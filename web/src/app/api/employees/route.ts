import { NextResponse, type NextRequest } from "next/server";
import { getSessionAddress } from "@/server/auth";
import { getDb } from "@/server/db";
import { employees } from "@/server/db/schema";
import { invalid, jsonError, readJson } from "@/server/http";
import { employeeInput } from "@/server/schemas";

export async function POST(request: NextRequest) {
  const employer = await getSessionAddress(request);
  if (!employer) return jsonError("Not signed in", 401);
  const parsed = employeeInput.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const row = { id: crypto.randomUUID(), employer, ...parsed.data };
  try {
    await getDb().insert(employees).values(row);
  } catch (e) {
    // The (employer, wallet) unique index: the same wallet can't be on one payroll list twice.
    if (e instanceof Error && /unique|constraint/i.test(`${e.message} ${(e as { cause?: { message?: string } }).cause?.message ?? ""}`)) return jsonError("That wallet is already on your payroll list.", 409);
    throw e;
  }
  return NextResponse.json({ id: row.id, name: row.name, role: row.role, wallet: row.wallet, salary: row.amount }, { status: 201 });
}
