import { afterEach, describe, expect, test } from "bun:test";
import { SolanaError, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_MIN_CONTEXT_SLOT_NOT_REACHED } from "@solana/kit";
import { fresh, minContextSlot, noteSlot, resetFreshnessForTests } from "./freshness";

const behind = () => new SolanaError(SOLANA_ERROR__JSON_RPC__SERVER_ERROR_MIN_CONTEXT_SLOT_NOT_REACHED, { contextSlot: 1n, __serverMessage: "Minimum context slot has not been reached" } as never);

describe("monotonic reads", () => {
  afterEach(resetFreshnessForTests);

  test("no floor until a slot is known, then it only moves forward", () => {
    expect(minContextSlot()).toBeUndefined();
    noteSlot(100n);
    noteSlot(90);
    noteSlot(undefined);
    expect(minContextSlot()).toBe(100n);
    noteSlot(101);
    expect(minContextSlot()).toBe(101n);
  });

  test("every read is pinned to the newest known slot", async () => {
    noteSlot(500n);
    let asked: bigint | undefined;
    await fresh(async (slot) => {
      asked = slot;
      return 1;
    });
    expect(asked).toBe(500n);
  });

  test("a node that is behind is asked again, and the answer is returned once one has caught up", async () => {
    let calls = 0;
    const value = await fresh(async () => {
      if (++calls < 3) throw behind();
      return "ok";
    }, 5, 1);
    expect(value).toBe("ok");
    expect(calls).toBe(3);
  });

  test("other errors are not retried, and retries stop eventually", async () => {
    let calls = 0;
    await expect(fresh(async () => { calls++; throw new Error("boom"); }, 5, 1)).rejects.toThrow("boom");
    expect(calls).toBe(1);
    calls = 0;
    await expect(fresh(async () => { calls++; throw behind(); }, 3, 1)).rejects.toBeDefined();
    expect(calls).toBe(3);
  });
});
