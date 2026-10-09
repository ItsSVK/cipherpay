import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionAddress } from "@/server/auth";
import { getDb } from "@/server/db";
import { payrollRunItems, payrollRuns, payrolls } from "@/server/db/schema";
import { invalid, jsonError, readJson } from "@/server/http";
import { runInput } from "@/server/schemas";

/**
 * Records a finished (or partly finished) run. Amounts and the total arrive sealed by the admin's browser, so the server
 * can't add them up; it computes only the counts and the status from the items.
 */
export async function POST(request: NextRequest) {
  const employer = await getSessionAddress(request);
  if (!employer) return jsonError("Not signed in", 401);
  const parsed = runInput.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const { id, label, items, payrollId, totalCt } = parsed.data;
  const db = getDb();
  // The payroll must be this employer's own, or one wallet could attach runs to another's list.
  if (payrollId && !(await db.select({ id: payrolls.id }).from(payrolls).where(and(eq(payrolls.id, payrollId), eq(payrolls.employer, employer)))).length) return jsonError("Unknown payroll", 400);
  // The id comes from the browser (the sealed amounts are bound to it), so it must not already exist, for anyone.
  if ((await db.select({ id: payrollRuns.id }).from(payrollRuns).where(eq(payrollRuns.id, id))).length) return jsonError("That run is already saved.", 409);

  const run = {
    id,
    employer,
    label,
    payrollId: payrollId ?? null,
    status: items.every((i) => i.status === "confirmed") ? "done" : "failed",
    recipients: items.length,
    legacyTotal: "",
    totalCt,
  };
  // One atomic batch: a run is never saved without its items.
  await db.batch([
    db.insert(payrollRuns).values(run),
    ...items.map((i) => db.insert(payrollRunItems).values({ runId: run.id, recipient: i.wallet, name: i.name, legacyAmount: "", amountCt: i.amountCt, receivedAmountCt: i.receivedAmountCt ?? null, status: i.status, signature: i.signature, error: i.error ?? null })),
  ]);
  return NextResponse.json({ id: run.id }, { status: 201 });
}
