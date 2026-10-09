import { and, desc, eq, isNotNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionAddress } from "@/server/auth";
import { getDb } from "@/server/db";
import { payrollRunItems, payrollRuns } from "@/server/db/schema";
import { jsonError } from "@/server/http";

/**
 * The confirmed payments an employer's payroll record says were sent TO the signed-in wallet. "Who is asking" comes from the session only,
 * and it is matched against the RECIPIENT, so a wallet can only ever read payments addressed to itself. The employer's own (sealed) amount
 * is not returned. `receivedAmountCt` is the amount encrypted to THIS wallet's key, saved by the employer's browser from the payment's
 * proof, so only the recipient can read it; the recipient's browser checks it against the on-chain payment before showing it. Each row
 * carries its transaction signature so it can be checked on an explorer.
 */
export async function GET(request: NextRequest) {
  const me = await getSessionAddress(request);
  if (!me) return jsonError("Not signed in", 401);

  const rows = await getDb()
    .select({ id: payrollRunItems.id, employer: payrollRuns.employer, label: payrollRuns.label, createdAt: payrollRuns.createdAt, signature: payrollRunItems.signature, receivedAmountCt: payrollRunItems.receivedAmountCt })
    .from(payrollRunItems)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunItems.runId))
    .where(and(eq(payrollRunItems.recipient, me), eq(payrollRunItems.status, "confirmed"), isNotNull(payrollRunItems.signature)))
    .orderBy(desc(payrollRunItems.createdAt), desc(payrollRunItems.id))
    .limit(100);

  return NextResponse.json({
    payments: rows.map((r) => ({ id: String(r.id), employer: r.employer, label: r.label, createdAt: r.createdAt.toISOString(), signature: r.signature ?? "", receivedAmountCt: r.receivedAmountCt ?? null })),
  });
}
