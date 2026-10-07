import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionAddress } from "@/server/auth";
import { getDb } from "@/server/db";
import { addresses, payrollEntries, payrolls } from "@/server/db/schema";
import { jsonError } from "@/server/http";

/** Removes a saved address from the signed-in wallet's own list. The employer comes from the session, so another wallet's rows are unreachable. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const employer = await getSessionAddress(request);
  if (!employer) return jsonError("Not signed in", 401);
  const { id } = await params;
  const db = getDb();
  // Refuse (don't silently change a payroll's total) while the address is still in one.
  const inUse = await db
    .select({ name: payrolls.name })
    .from(payrollEntries)
    .innerJoin(payrolls, eq(payrolls.id, payrollEntries.payrollId))
    .innerJoin(addresses, eq(addresses.id, payrollEntries.addressId))
    .where(and(eq(payrollEntries.addressId, id), eq(addresses.employer, employer)));
  if (inUse.length) return jsonError(`This address is in ${inUse.map((p) => `"${p.name}"`).join(", ")}. Remove it from there first.`, 409);
  const removed = await db.delete(addresses).where(and(eq(addresses.id, id), eq(addresses.employer, employer))).returning({ id: addresses.id });
  return removed.length ? NextResponse.json({ ok: true }) : jsonError("Not found", 404);
}
