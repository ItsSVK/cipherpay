import { describe, expect, test } from "bun:test";
import { deriveRecordKey, openAmount, sealAmount, SealError } from "./record-seal";
import { amountContext, SEALED_AMOUNT_PATTERN } from "@/lib/sealed-amount";

const secretA = new Uint8Array(32).fill(7);
const secretB = new Uint8Array(32).fill(8);
const ctx = amountContext.payrollEntry("Employer1111", "payroll-1", "address-1");

describe("record seal", () => {
  test("round-trips amounts, including 0 and u64::MAX", async () => {
    const key = await deriveRecordKey(secretA);
    for (const amount of [0n, 1n, 1_500_000n, 2n ** 64n - 1n]) {
      const sealed = await sealAmount(key, amount, ctx);
      expect(sealed).toMatch(SEALED_AMOUNT_PATTERN);
      expect(await openAmount(key, sealed, ctx)).toBe(amount);
    }
  });

  test("every ciphertext has the same length and a fresh nonce", async () => {
    const key = await deriveRecordKey(secretA);
    const a = await sealAmount(key, 1n, ctx);
    const b = await sealAmount(key, 1n, ctx);
    const big = await sealAmount(key, 2n ** 63n, ctx);
    expect(a).not.toBe(b);
    expect(a.length).toBe(big.length);
  });

  test("the same secret derives the same key in a later session", async () => {
    const sealed = await sealAmount(await deriveRecordKey(secretA), 42n, ctx);
    expect(await openAmount(await deriveRecordKey(secretA.slice()), sealed, ctx)).toBe(42n);
  });

  test("another wallet's key can't open it", async () => {
    const sealed = await sealAmount(await deriveRecordKey(secretA), 42n, ctx);
    await expect(openAmount(await deriveRecordKey(secretB), sealed, ctx)).rejects.toBeInstanceOf(SealError);
  });

  test("an amount moved to another row is refused", async () => {
    const key = await deriveRecordKey(secretA);
    const sealed = await sealAmount(key, 42n, ctx);
    for (const other of [
      amountContext.payrollEntry("Employer1111", "payroll-1", "address-2"),
      amountContext.payrollEntry("Employer1111", "payroll-2", "address-1"),
      amountContext.payrollEntry("Employer2222", "payroll-1", "address-1"),
      amountContext.runTotal("Employer1111", "payroll-1"),
    ]) {
      await expect(openAmount(key, sealed, other)).rejects.toBeInstanceOf(SealError);
    }
  });

  test("a changed byte is refused", async () => {
    const key = await deriveRecordKey(secretA);
    const sealed = await sealAmount(key, 42n, ctx);
    const i = 20;
    const tampered = sealed.slice(0, i) + (sealed[i] === "A" ? "B" : "A") + sealed.slice(i + 1);
    await expect(openAmount(key, tampered, ctx)).rejects.toBeInstanceOf(SealError);
    await expect(openAmount(key, "42", ctx)).rejects.toBeInstanceOf(SealError);
  });

  test("refuses amounts that don't fit a u64", async () => {
    const key = await deriveRecordKey(secretA);
    await expect(sealAmount(key, 2n ** 64n, ctx)).rejects.toBeInstanceOf(SealError);
    await expect(sealAmount(key, -1n, ctx)).rejects.toBeInstanceOf(SealError);
  });
});
