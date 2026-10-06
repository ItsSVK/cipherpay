import { NextResponse, type NextRequest } from "next/server";
import { buildSignInMessage } from "@/lib/auth/message";
import { verifyWalletSignature } from "@/lib/auth/verify";
import { consumeNonce, cookieOptions, createSession, SESSION_COOKIE } from "@/server/auth";
import { invalid, jsonError, readJson } from "@/server/http";
import { verifyRequest } from "@/server/schemas";

/** Step 2: checks the wallet's signature over the server-built message, burns the nonce, and starts a session. */
export async function POST(request: NextRequest) {
  const parsed = verifyRequest.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const { address, nonce, signature } = parsed.data;

  // Burn the nonce first so a failed attempt can't be retried against the same challenge.
  const challenge = await consumeNonce(nonce);
  if (!challenge) return jsonError("That sign-in request expired. Try again.", 401);

  const message = buildSignInMessage({ domain: new URL(request.url).host, address, nonce, issuedAt: challenge.issuedAt, expiresAt: challenge.expiresAt });
  const ok = await verifyWalletSignature(address, message, Uint8Array.from(Buffer.from(signature, "base64")));
  if (!ok) return jsonError("The signature didn't match this wallet.", 401);

  const { token, maxAge } = await createSession(address);
  const res = NextResponse.json({ address });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(maxAge));
  return res;
}
