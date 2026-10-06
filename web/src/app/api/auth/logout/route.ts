import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, destroySession, SESSION_COOKIE } from "@/server/auth";

export async function POST(request: NextRequest) {
  await destroySession(request);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  return res;
}
