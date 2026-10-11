import { describe, expect, test } from "bun:test";
import { address, generateKeyPairSigner } from "@solana/kit";
import { deriveWalletKeys, toMessagePartialSigner, type WalletSignMessage } from "@/lib/crypto/keys";
import { NO_OPERATOR } from "./authorization";
import { alreadyApplied, deriveHelperSigner, HELPER_MIN_LAMPORTS, HELPER_TOPUP_LAMPORTS, isSeqMismatch } from "./helper-signer";
import { TxError } from "./send";

async function keysFor(kp: Awaited<ReturnType<typeof generateKeyPairSigner>>) {
  const sign: WalletSignMessage = async (message) => {
    const [d] = await kp.signMessages([{ content: message, signatures: {} }]);
    return { signature: d[kp.address] as unknown as Uint8Array, signedMessage: message };
  };
  return deriveWalletKeys(toMessagePartialSigner(kp.address, sign));
}

describe("payroll helper key", () => {
  test("the same wallet always gets the same helper (so leftover SOL is always recoverable)", async () => {
    const kp = await generateKeyPairSigner();
    const a = await deriveHelperSigner(await keysFor(kp));
    const b = await deriveHelperSigner(await keysFor(kp));
    expect(a.address).toBe(b.address);
  }, 30_000);

  test("different wallets get different helpers, and the helper is never the wallet itself", async () => {
    const k1 = await generateKeyPairSigner();
    const k2 = await generateKeyPairSigner();
    const h1 = await deriveHelperSigner(await keysFor(k1));
    const h2 = await deriveHelperSigner(await keysFor(k2));
    expect(h1.address).not.toBe(h2.address);
    expect(h1.address).not.toBe(k1.address);
  }, 30_000);

  test("it can actually sign (a usable keypair signer)", async () => {
    const kp = await generateKeyPairSigner();
    const h = await deriveHelperSigner(await keysFor(kp));
    const [sig] = await h.signMessages([{ content: new TextEncoder().encode("x"), signatures: {} }]);
    expect(sig[h.address]).toBeDefined();
  }, 30_000);

  test("the funding threshold is above the proof accounts' rent (proof accounts plus the operator config's own rent) and the top-up is above the threshold", () => {
    expect(HELPER_MIN_LAMPORTS).toBeGreaterThan(10_600_000n);
    expect(HELPER_TOPUP_LAMPORTS).toBeGreaterThan(HELPER_MIN_LAMPORTS);
  });
});

describe("recovering from a stale authorization counter", () => {
  const helper = address("9tbZBdds8EuGX2Yb1yBYWtnA9UyhgxjfVCmgmfV5LPwV");
  const vault = address("ELChxVFAiE5jv1SV3v3gprWeWxmbgX7ATWingW5VcB48");
  const signed = { vault, operator: helper, expiresAt: 1_000n, maxPayments: 3, seq: 4n };

  test("the program's seq mismatch is recognised from a rejected preflight, and nothing else is", () => {
    const log = "Program log: AnchorError thrown in programs/vault/src/instructions/authorize_operator.rs:164. Error Code: AuthorizationSeqMismatch. Error Number: 6009.";
    expect(isSeqMismatch(new TxError("The network rejected the transaction before sending it: Custom program error: #6009 (instruction #2).", "preflight"))).toBe(true);
    expect(isSeqMismatch(new TxError("rejected", "preflight", [log]))).toBe(true);
    expect(isSeqMismatch(new TxError("rejected", "failed", [log]))).toBe(false);
    expect(isSeqMismatch(new TxError("Custom program error: #6000", "preflight"))).toBe(false);
    expect(isSeqMismatch(new Error("AuthorizationSeqMismatch"))).toBe(false);
  });

  test("an authorization counts as applied only when the chain holds exactly what was signed, one counter later", () => {
    const live = { operator: helper, isHelper: true, expiresAt: 1_000n, paymentsLeft: 3, seq: 5n, authorized: true };
    expect(alreadyApplied(live, signed, helper)).toBe(true);
    expect(alreadyApplied({ ...live, seq: 4n }, signed, helper)).toBe(false);
    expect(alreadyApplied({ ...live, expiresAt: 999n }, signed, helper)).toBe(false);
    expect(alreadyApplied({ ...live, operator: null, isHelper: false }, signed, helper)).toBe(false);
  });

  test("a revoke counts as applied whenever no operator is set", () => {
    const revoke = { ...signed, operator: NO_OPERATOR, expiresAt: 0n, maxPayments: 0 };
    expect(alreadyApplied({ operator: null, isHelper: false, expiresAt: 0n, paymentsLeft: 0, seq: 9n, authorized: false }, revoke, helper)).toBe(true);
    expect(alreadyApplied({ operator: helper, isHelper: true, expiresAt: 1_000n, paymentsLeft: 3, seq: 4n, authorized: true }, revoke, helper)).toBe(false);
  });
});
