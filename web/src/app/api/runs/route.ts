import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionAddress } from "@/server/auth";
import { getDb } from "@/server/db";
import { payrollRunItems, payrollRuns, payrolls } from "@/server/db/schema";
import { invalid, jsonError, readJson } from "@/server/http";
import { runInput } from "@/server/schemas";

/** Records a finished (or partly finished) run. The total and counts are computed here from the items, never taken from the client. */
export async function POST(request: NextRequest) {
  const employer = await getSessionAddress(request);
  if (!employer) return jsonError("Not signed in", 401);
  const parsed = runInput.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const { label, items, payrollId } = parsed.data;
  const db = getDb();
  // The payroll must be this employer's own, or one wallet could attach runs to another's list.
  if (payrollId && !(await db.select({ id: payrolls.id }).from(payrolls).where(and(eq(payrolls.id, payrollId), eq(payrolls.employer, employer)))).length) return jsonError("Unknown payroll", 400);

  const confirmed = items.filter((i) => i.status === "confirmed");
  const run = {
    id: crypto.randomUUID(),
    employer,
    label,
    payrollId: payrollId ?? null,
    status: items.every((i) => i.status === "confirmed") ? "done" : "failed",
    recipients: items.length,
    total: confirmed.reduce((n, i) => n + BigInt(i.amount), 0n).toString(),
  };
  // One atomic batch: a run is never saved without its items.
  await db.batch([
    db.insert(payrollRuns).values(run),
    ...items.map((i) => db.insert(payrollRunItems).values({ runId: run.id, recipient: i.wallet, name: i.name, amount: i.amount, status: i.status, signature: i.signature, error: i.error ?? null })),
  ]);
  return NextResponse.json({ id: run.id }, { status: 201 });
}
