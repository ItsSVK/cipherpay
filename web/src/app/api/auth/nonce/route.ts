import { NextResponse, type NextRequest } from "next/server";
import { buildSignInMessage } from "@/lib/auth/message";
import { createNonce } from "@/server/auth";
import { invalid, readJson } from "@/server/http";
import { nonceRequest } from "@/server/schemas";

/** Step 1 of signing in: returns the exact message the wallet must sign. The server rebuilds it to verify, so it can't be altered. */
export async function POST(request: NextRequest) {
  const parsed = nonceRequest.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const { nonce, issuedAt, expiresAt } = await createNonce();
  const message = buildSignInMessage({ domain: new URL(request.url).host, address: parsed.data.address, nonce, issuedAt, expiresAt });
  return NextResponse.json({ nonce, message });
}
