import { desc, eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionAddress } from "@/server/auth";
import { getDb } from "@/server/db";
import { addresses, payrollEntries, payrollRunItems, payrollRuns, payrolls } from "@/server/db/schema";
import { jsonError } from "@/server/http";

/** Everything the Company pages need for the signed-in wallet: its saved addresses and its run history. Amounts are base-unit strings. */
export async function GET(request: NextRequest) {
  const employer = await getSessionAddress(request);
  if (!employer) return jsonError("Not signed in", 401);
  const db = getDb();

  const rows = await db.select().from(addresses).where(eq(addresses.employer, employer)).orderBy(desc(addresses.createdAt), desc(addresses.id));
  const lists = await db.select().from(payrolls).where(eq(payrolls.employer, employer)).orderBy(desc(payrolls.createdAt), desc(payrolls.id));
  const entries = lists.length ? await db.select().from(payrollEntries).where(inArray(payrollEntries.payrollId, lists.map((p) => p.id))) : [];
  const byId = new Map(rows.map((a) => [a.id, a]));
  const runs = await db.select().from(payrollRuns).where(eq(payrollRuns.employer, employer)).orderBy(desc(payrollRuns.createdAt)).limit(50);
  const items = runs.length ? await db.select().from(payrollRunItems).where(inArray(payrollRunItems.runId, runs.map((r) => r.id))) : [];

  return NextResponse.json({
    addresses: rows.map((a) => ({ id: a.id, name: a.name, wallet: a.wallet })),
    payrolls: lists.map((p) => ({
      id: p.id,
      name: p.name,
      entries: entries.filter((e) => e.payrollId === p.id).flatMap((e) => { const a = byId.get(e.addressId); return a ? [{ addressId: a.id, name: a.name, wallet: a.wallet, amount: e.amount }] : []; }),
    })),
    runs: runs.map((r) => ({
      id: r.id,
      label: r.label,
      payrollId: r.payrollId,
      createdAt: r.createdAt.toISOString(),
      status: r.status,
      recipients: r.recipients,
      total: r.total,
      items: items.filter((i) => i.runId === r.id).map((i) => ({ wallet: i.recipient, name: i.name, amount: i.amount, signature: i.signature ?? "", status: i.status })),
    })),
  });
}
