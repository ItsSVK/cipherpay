import "server-only";
import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export const jsonError = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export const invalid = (e: ZodError) => jsonError(e.issues[0]?.message ?? "Invalid request", 400);

/** Reads a JSON body without throwing on garbage. */
export async function readJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
