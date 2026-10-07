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
