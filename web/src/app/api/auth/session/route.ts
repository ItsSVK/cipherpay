import { NextResponse, type NextRequest } from "next/server";
import { getSessionAddress } from "@/server/auth";
import { jsonError } from "@/server/http";

export async function GET(request: NextRequest) {
  const address = await getSessionAddress(request);
  return address ? NextResponse.json({ address }) : jsonError("Not signed in", 401);
}
