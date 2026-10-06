import { describe, expect, test } from "bun:test";
import { SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE, SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND, SolanaError } from "@solana/kit";
import { toTxError, TxError } from "./send";

const preflight = (logs: string[], cause?: Error) =>
  new SolanaError(SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE, { accounts: null, innerInstructions: null, logs, returnData: null, unitsConsumed: 0n, replacementBlockhash: null, ...(cause ? { cause } : {}) } as never);

describe("toTxError", () => {
  test("a rejected preflight keeps the network's real reason, even when there are no logs", () => {
    const e = toTxError(preflight([], new SolanaError(SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND)));
    expect(e.kind).toBe("preflight");
    expect(e.message).toContain("Blockhash not found"); // this used to be dropped, leaving only a vague message
    expect(e.submitted).toBe(false); // a rejected preflight sends nothing, so retrying is safe
  });

  test("a program failure adds the failing log line", () => {
    const e = toTxError(preflight(["Program 111 invoke [1]", "Transfer: insufficient lamports 995000, need 50000000", "Program 111 failed"], undefined));
    expect(e.message).toContain("insufficient lamports");
    expect(e.submitted).toBe(false);
  });

  test("a declined wallet prompt is reported as declined and sends nothing", () => {
    const e = toTxError(new Error("User rejected the request."));
    expect(e.kind).toBe("rejected");
    expect(e.submitted).toBe(false);
  });

  test("an unknown failure (a dropped connection) is treated as possibly sent", () => {
    const e = toTxError(new Error("fetch failed"));
    expect(e.kind).toBe("failed");
    expect(e.submitted).toBe(true);
  });

  test("an existing TxError passes through unchanged", () => {
    const original = new TxError("boom", "expired", [], true);
    expect(toTxError(original)).toBe(original);
  });
});
