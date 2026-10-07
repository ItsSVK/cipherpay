import { NextResponse, type NextRequest } from "next/server";
import { getSessionAddress } from "@/server/auth";
import { getDb } from "@/server/db";
import { addresses } from "@/server/db/schema";
import { invalid, jsonError, readJson } from "@/server/http";
import { addressInput } from "@/server/schemas";

export async function POST(request: NextRequest) {
  const employer = await getSessionAddress(request);
  if (!employer) return jsonError("Not signed in", 401);
  const parsed = addressInput.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const row = { id: crypto.randomUUID(), employer, ...parsed.data };
  try {
    await getDb().insert(addresses).values(row);
  } catch (e) {
    // The (employer, wallet) unique index: the same wallet can't be saved twice.
    if (e instanceof Error && /unique|constraint/i.test(`${e.message} ${(e as { cause?: { message?: string } }).cause?.message ?? ""}`)) return jsonError("That address is already saved.", 409);
    throw e;
  }
  return NextResponse.json({ id: row.id, name: row.name, wallet: row.wallet }, { status: 201 });
}
