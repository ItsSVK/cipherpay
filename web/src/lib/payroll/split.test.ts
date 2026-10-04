import { describe, expect, test } from "bun:test";
import { splitAmount } from "./split";

const dests = [
  { id: "sam", label: "Sam", bps: 7900, primary: true },
  { id: "tax", label: "Tax reserve", bps: 2000 },
  { id: "fee", label: "Platform fee", bps: 100 },
];

describe("splitAmount", () => {
  test("79/20/1 of $10,000", () => {
    const parts = splitAmount(10_000_000_000n, dests);
    expect(parts.map((p) => p.amount)).toEqual([7_900_000_000n, 2_000_000_000n, 100_000_000n]);
  });

  test("remainder goes to the primary so parts sum exactly", () => {
    const total = 1_000_003n;
    const parts = splitAmount(total, dests);
    expect(parts.reduce((n, p) => n + p.amount, 0n)).toBe(total);
    expect(parts[1].amount).toBe((total * 2000n) / 10_000n);
  });

  test("rejects percentages that do not sum to 100", () => {
    expect(() => splitAmount(1n, [{ id: "a", label: "A", bps: 5000, primary: true }])).toThrow();
  });

  test("requires exactly one primary", () => {
    expect(() =>
      splitAmount(1n, [
        { id: "a", label: "A", bps: 5000 },
        { id: "b", label: "B", bps: 5000 },
      ]),
    ).toThrow();
  });
});
