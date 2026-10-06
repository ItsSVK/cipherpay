import "server-only";
import { eq, lt } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { SIGN_IN_TTL_SECONDS } from "@/lib/auth/message";
import { getDb } from "./db";
import { authNonces, sessions } from "./db/schema";

export const SESSION_COOKIE = "cp_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const nowSeconds = () => Math.floor(Date.now() / 1000);

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 32): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}

/** A single-use sign-in challenge. Also sweeps expired challenges and sessions so the tables don't grow forever. */
export async function createNonce(): Promise<{ nonce: string; issuedAt: number; expiresAt: number }> {
  const db = getDb();
  const now = nowSeconds();
  await db.delete(authNonces).where(lt(authNonces.expiresAt, now));
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  const nonce = randomToken(16);
  const expiresAt = now + SIGN_IN_TTL_SECONDS;
  await db.insert(authNonces).values({ nonce, expiresAt });
  return { nonce, issuedAt: now, expiresAt };
}

/**
 * Consumes a nonce: it can be used exactly once, and only before it expires. Deleting it and reading the row back in one
 * statement means two simultaneous verifications can't both succeed with the same signature.
 */
export async function consumeNonce(nonce: string): Promise<{ issuedAt: number; expiresAt: number } | null> {
  const db = getDb();
  const [row] = await db.delete(authNonces).where(eq(authNonces.nonce, nonce)).returning();
  if (!row || row.expiresAt < nowSeconds()) return null;
  return { issuedAt: row.expiresAt - SIGN_IN_TTL_SECONDS, expiresAt: row.expiresAt };
}

export async function createSession(address: string): Promise<{ token: string; maxAge: number }> {
  const token = randomToken(32);
  await getDb()
    .insert(sessions)
    .values({ id: await sha256Hex(token), address, expiresAt: nowSeconds() + SESSION_TTL_SECONDS });
  return { token, maxAge: SESSION_TTL_SECONDS };
}

/** The wallet address this request is signed in as, or null. The ONLY source of "who is calling" for every API route. */
export async function getSessionAddress(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await getDb()
    .select()
    .from(sessions)
    .where(eq(sessions.id, await sha256Hex(token)));
  if (!row || row.expiresAt < nowSeconds()) return null;
  return row.address;
}

export async function destroySession(request: NextRequest): Promise<void> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.id, await sha256Hex(token)));
}

export const cookieOptions = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge });
