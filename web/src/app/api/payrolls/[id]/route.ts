import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionAddress } from "@/server/auth";
import { getDb } from "@/server/db";
import { payrolls } from "@/server/db/schema";
import { jsonError } from "@/server/http";

/** Deletes one of the signed-in wallet's payrolls. Its entries go with it; past runs stay in history. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const employer = await getSessionAddress(request);
  if (!employer) return jsonError("Not signed in", 401);
  const { id } = await params;
  const removed = await getDb().delete(payrolls).where(and(eq(payrolls.id, id), eq(payrolls.employer, employer))).returning({ id: payrolls.id });
  return removed.length ? NextResponse.json({ ok: true }) : jsonError("Not found", 404);
}
