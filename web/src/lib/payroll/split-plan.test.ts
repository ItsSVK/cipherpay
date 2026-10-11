import { describe, expect, test } from "bun:test";
import { checkSplitWallets, splitRunItems } from "./split-plan";
import { splitAmount } from "./split";

const A = "11111111111111111111111111111112";
const B = "11111111111111111111111111111113";
const C = "11111111111111111111111111111114";
const targets = [
  { id: "sam", name: "Sam", wallet: A },
  { id: "tax", name: "Tax reserve", wallet: B },
  { id: "fee", name: "Platform fee", wallet: C },
];

describe("checkSplitWallets", () => {
  test("three distinct valid addresses are all fine", () => {
    expect(checkSplitWallets(targets)).toEqual({ sam: null, tax: null, fee: null });
  });
  test("empty and malformed addresses are named", () => {
    const r = checkSplitWallets([targets[0], { id: "tax", name: "Tax reserve", wallet: "" }, { id: "fee", name: "Platform fee", wallet: "not-an-address" }]);
    expect(r.sam).toBeNull();
    expect(r.tax).toMatch(/Enter a wallet/);
    expect(r.fee).toMatch(/not a valid/);
  });
  test("the same wallet twice is flagged on both", () => {
    const r = checkSplitWallets([targets[0], { id: "tax", name: "Tax reserve", wallet: A }, targets[2]]);
    expect(r.sam).toMatch(/Tax reserve/);
    expect(r.tax).toMatch(/Sam/);
    expect(r.fee).toBeNull();
  });
});

describe("splitRunItems", () => {
  test("79/20/1 of 10 USDC becomes three payments that add up exactly", () => {
    const parts = splitAmount(10_000_000n, [{ id: "sam", label: "Sam", bps: 7900, primary: true }, { id: "tax", label: "Tax", bps: 2000 }, { id: "fee", label: "Fee", bps: 100 }]);
    const items = splitRunItems(parts, targets);
    expect(items.map((i) => [i.id, i.amount])).toEqual([["sam", 7_900_000n], ["tax", 2_000_000n], ["fee", 100_000n]]);
    expect(items.reduce((n, i) => n + i.amount, 0n)).toBe(10_000_000n);
    expect(items[1].wallet).toBe(B);
  });
  test("a destination at 0% is not paid", () => {
    const parts = splitAmount(5_000_000n, [{ id: "sam", label: "Sam", bps: 10_000, primary: true }, { id: "tax", label: "Tax", bps: 0 }, { id: "fee", label: "Fee", bps: 0 }]);
    expect(splitRunItems(parts, targets).map((i) => i.id)).toEqual(["sam"]);
  });
});

import { checkSplit, MAX_SPLIT_ROWS, parsePercentBps, toDestinations, type SplitRow } from "./split-plan";

describe("parsePercentBps", () => {
  test("reads whole and fractional percentages", () => {
    expect(parsePercentBps("79")).toBe(7900);
    expect(parsePercentBps(" 12.5 ")).toBe(1250);
    expect(parsePercentBps("0.25")).toBe(25);
    expect(parsePercentBps("100")).toBe(10_000);
    expect(parsePercentBps("0")).toBe(0);
  });
  test("refuses anything that is not a percentage with at most 2 decimals", () => {
    for (const bad of ["", "abc", "-5", "100.01", "101", "1.234", "1e2", "1,5", ".5", "5."]) expect(parsePercentBps(bad)).toBeNull();
  });
});

const row = (key: string, name: string, wallet: string, pct: string): SplitRow => ({ key, name, wallet, pct });

describe("checkSplit", () => {
  const rows = [row("a", "Sam", A, "70"), row("b", "Tax", B, "25.5"), row("c", "Fee", C, "4.5")];
  test("a complete rule that adds to 100% is ok", () => {
    const c = checkSplit(rows, "a");
    expect(c.ok).toBe(true);
    expect(c.sumBps).toBe(10_000);
    expect(c.bps).toEqual({ a: 7000, b: 2550, c: 450 });
  });
  test("works for any number of destinations, from one to the cap", () => {
    expect(checkSplit([row("a", "Only", A, "100")], "a").ok).toBe(true);
    expect(checkSplit([row("a", "A", A, "50"), row("b", "B", B, "50")], "a").ok).toBe(true);
    const many = Array.from({ length: MAX_SPLIT_ROWS + 1 }, (_, i) => row(`k${i}`, `N${i}`, `1111111111111111111111111111111${(i % 8) + 2}`, "0"));
    expect(checkSplit(many, "k0").ok).toBe(false);
  });
  test("reports how much is left, or how far over, when the total is not 100%", () => {
    const under = checkSplit([row("a", "A", A, "60"), row("b", "B", B, "30")], "a");
    expect([under.sumValid, under.remainingBps, under.ok]).toEqual([false, 1000, false]);
    const over = checkSplit([row("a", "A", A, "60"), row("b", "B", B, "50")], "a");
    expect([over.sumValid, over.remainingBps, over.ok]).toEqual([false, -1000, false]);
  });
  test("names, wallets and percentages are each flagged on the row that has the problem", () => {
    const c = checkSplit([row("a", " ", A, "50"), row("b", "B", "nope", "x"), row("c", "C", A, "50")], "a");
    expect(c.errors.a.name).toBeDefined();
    expect(c.errors.a.wallet).toMatch(/Already used/);
    expect(c.errors.b.wallet).toMatch(/not a valid/);
    expect(c.errors.b.pct).toBeDefined();
    expect(c.ok).toBe(false);
  });
  test("the primary recipient cannot sit at 0%", () => {
    const c = checkSplit([row("a", "A", A, "0"), row("b", "B", B, "100")], "a");
    expect(c.errors.a.pct).toMatch(/more than 0/);
    expect(c.ok).toBe(false);
  });
  test("the rule turns into destinations that split exactly, with the remainder going to the primary", () => {
    const c = checkSplit(rows, "a");
    const parts = splitAmount(1_000_001n, toDestinations(rows, c.bps, "a"));
    expect(parts.reduce((n, p) => n + p.amount, 0n)).toBe(1_000_001n);
    expect(parts.find((p) => p.id === "b")!.amount).toBe(255_000n); // floor(1_000_001 * 25.5%)
  });
});
