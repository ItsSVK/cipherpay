import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionAddress } from "@/server/auth";
import { getDb } from "@/server/db";
import { payrollEntries, payrollRunItems, payrollRuns, payrolls } from "@/server/db/schema";
import { invalid, jsonError, readJson } from "@/server/http";
import { sealInput } from "@/server/schemas";

/**
 * One-time migration of rows saved before amounts were sealed. The admin's browser reads the old plaintext (GET /api/company),
 * encrypts it and sends it back here; each row gets its ciphertext and its plaintext is cleared. Only the signed-in wallet's own
 * rows, and only rows not sealed yet, are touched, so this can't overwrite an amount that is already sealed.
 */
export async function POST(request: NextRequest) {
  const employer = await getSessionAddress(request);
  if (!employer) return jsonError("Not signed in", 401);
  const parsed = sealInput.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const { entries, runs, items } = parsed.data;
  const db = getDb();

  const ownPayrolls = new Set((await db.select({ id: payrolls.id }).from(payrolls).where(eq(payrolls.employer, employer))).map((p) => p.id));
  const ownRuns = new Set((await db.select({ id: payrollRuns.id }).from(payrollRuns).where(eq(payrollRuns.employer, employer))).map((r) => r.id));
  const itemIds = items.map((i) => i.id);
  const ownItems = new Set(
    itemIds.length
      ? (await db.select({ id: payrollRunItems.id }).from(payrollRunItems).innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunItems.runId)).where(and(eq(payrollRuns.employer, employer), inArray(payrollRunItems.id, itemIds)))).map((i) => i.id)
      : [],
  );
  if (entries.some((e) => !ownPayrolls.has(e.payrollId)) || runs.some((r) => !ownRuns.has(r.id)) || items.some((i) => !ownItems.has(i.id))) return jsonError("Some of those rows aren't yours.", 403);

  const updates = [
    ...entries.map((e) => db.update(payrollEntries).set({ amountCt: e.amountCt, legacyAmount: "" }).where(and(eq(payrollEntries.payrollId, e.payrollId), eq(payrollEntries.addressId, e.addressId), isNull(payrollEntries.amountCt)))),
    ...runs.map((r) => db.update(payrollRuns).set({ totalCt: r.totalCt, legacyTotal: "" }).where(and(eq(payrollRuns.id, r.id), isNull(payrollRuns.totalCt)))),
    ...items.map((i) => db.update(payrollRunItems).set({ amountCt: i.amountCt, legacyAmount: "" }).where(and(eq(payrollRunItems.id, i.id), isNull(payrollRunItems.amountCt)))),
  ];
  const [first, ...rest] = updates;
  if (first) await db.batch([first, ...rest]);
  return NextResponse.json({ sealed: updates.length });
}
