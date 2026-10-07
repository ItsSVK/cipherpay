import { and, eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionAddress } from "@/server/auth";
import { getDb } from "@/server/db";
import { addresses, payrollEntries, payrolls } from "@/server/db/schema";
import { invalid, jsonError, readJson } from "@/server/http";
import { payrollInput } from "@/server/schemas";

/** Creates a payroll: a name plus (saved address, amount) pairs. Every address must be the signed-in wallet's own. */
export async function POST(request: NextRequest) {
  const employer = await getSessionAddress(request);
  if (!employer) return jsonError("Not signed in", 401);
  const parsed = payrollInput.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const { name, entries } = parsed.data;

  const db = getDb();
  const owned = await db.select().from(addresses).where(and(eq(addresses.employer, employer), inArray(addresses.id, entries.map((e) => e.addressId))));
  const byId = new Map(owned.map((a) => [a.id, a]));
  if (byId.size !== entries.length) return jsonError("One of those addresses isn't in your saved list.", 400);

  const id = crypto.randomUUID();
  // One atomic batch: a payroll is never saved without its entries.
  await db.batch([
    db.insert(payrolls).values({ id, employer, name }),
    ...entries.map((e) => db.insert(payrollEntries).values({ payrollId: id, addressId: e.addressId, amount: e.amount })),
  ]);
  return NextResponse.json(
    { id, name, entries: entries.map((e) => ({ addressId: e.addressId, name: byId.get(e.addressId)!.name, wallet: byId.get(e.addressId)!.wallet, amount: e.amount })) },
    { status: 201 },
  );
}
