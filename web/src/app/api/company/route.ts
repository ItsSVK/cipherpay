import { desc, eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionAddress } from "@/server/auth";
import { getDb } from "@/server/db";
import { employees, payrollRunItems, payrollRuns } from "@/server/db/schema";
import { jsonError } from "@/server/http";

/** Everything the Company pages need for the signed-in wallet: its payroll list and its run history. Amounts are base-unit strings. */
export async function GET(request: NextRequest) {
  const employer = await getSessionAddress(request);
  if (!employer) return jsonError("Not signed in", 401);
  const db = getDb();

  const rows = await db.select().from(employees).where(eq(employees.employer, employer)).orderBy(desc(employees.createdAt), desc(employees.id));
  const runs = await db.select().from(payrollRuns).where(eq(payrollRuns.employer, employer)).orderBy(desc(payrollRuns.createdAt)).limit(50);
  const items = runs.length ? await db.select().from(payrollRunItems).where(inArray(payrollRunItems.runId, runs.map((r) => r.id))) : [];

  return NextResponse.json({
    employees: rows.map((e) => ({ id: e.id, name: e.name, role: e.role, wallet: e.wallet, salary: e.amount })),
    runs: runs.map((r) => ({
      id: r.id,
      label: r.label,
      createdAt: r.createdAt.toISOString(),
      status: r.status,
      recipients: r.recipients,
      total: r.total,
      items: items.filter((i) => i.runId === r.id).map((i) => ({ wallet: i.recipient, name: i.name, amount: i.amount, signature: i.signature ?? "", status: i.status })),
    })),
  });
}
