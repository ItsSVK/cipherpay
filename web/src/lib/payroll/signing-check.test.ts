import { describe, expect, test } from "bun:test";
import { checkSigning, secondsNeeded, suggestSigning, SECONDS_PER_PAYMENT } from "./signing-check";
import { OPERATOR_MARGIN_SECONDS } from "@/lib/chain/operator";

const byId = (checks: ReturnType<typeof checkSigning>, id: string) => checks.find((c) => c.id === id)!;

describe("checkSigning", () => {
  test("manual mode always passes", () => {
    const checks = checkSigning({ mode: "manual" }, 20);
    expect(checks).toHaveLength(1);
    expect(checks[0].ok).toBe(true);
  });

  test("fails when fewer payments are authorized than recipients", () => {
    const c = byId(checkSigning({ mode: "automatic", secondsLeft: 600, paymentsLeft: 1 }, 2), "auto-count");
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("this run needs 2");
  });

  test("passes when the count matches exactly", () => {
    expect(byId(checkSigning({ mode: "automatic", secondsLeft: 600, paymentsLeft: 2 }, 2), "auto-count").ok).toBe(true);
  });

  test("fails when the time left is shorter than the run needs", () => {
    const c = byId(checkSigning({ mode: "automatic", secondsLeft: 60, paymentsLeft: 20 }, 20), "auto-time");
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("expire part way");
  });

  test("time check compares usable time (already net of the expiry margin) with the run, without counting the margin twice", () => {
    const run = 2 * SECONDS_PER_PAYMENT;
    expect(byId(checkSigning({ mode: "automatic", secondsLeft: run, paymentsLeft: 2 }, 2), "auto-time").ok).toBe(true);
    expect(byId(checkSigning({ mode: "automatic", secondsLeft: run - 1, paymentsLeft: 2 }, 2), "auto-time").ok).toBe(false);
  });

  test("an authorization must last the run plus the expiry margin", () => {
    expect(secondsNeeded(2)).toBe(2 * SECONDS_PER_PAYMENT + OPERATOR_MARGIN_SECONDS);
  });

  test("says when no offered window is long enough", () => {
    const c = byId(checkSigning({ mode: "automatic", secondsLeft: 60, paymentsLeft: 100 }, 100), "auto-time");
    expect(c.detail).toContain("manual approvals");
  });
});

describe("suggestSigning", () => {
  test("picks the smallest window that fits and a cap of the recipients", () => {
    expect(suggestSigning(1)).toEqual({ ttlSeconds: 60, maxPayments: 1 });
    expect(suggestSigning(2)).toEqual({ ttlSeconds: 5 * 60, maxPayments: 2 });
    expect(suggestSigning(20)).toEqual({ ttlSeconds: 15 * 60, maxPayments: 20 });
  });

  test("no window when the run is longer than the longest option", () => {
    expect(suggestSigning(100).ttlSeconds).toBeNull();
  });
});
