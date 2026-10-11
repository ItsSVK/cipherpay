import { describe, expect, test } from "bun:test";
import { address, generateKeyPairSigner, getAddressDecoder } from "@solana/kit";
import { findOperatorConfigPda, findVaultPda, getAuthorizeOperatorInstructionDataDecoder, VAULT_PROGRAM_ADDRESS } from "@/generated/vault/src/generated";
import { DEVNET_WUSDC_MINT } from "./constants";
import { authorizationMessage, buildAuthorization, ed25519VerifyInstruction, NO_OPERATOR } from "./authorization";
import { DEFAULT_OPERATOR_TTL_SECONDS, OPERATOR_MARGIN_SECONDS, supersedes, usableSecondsLeft, type OperatorStatus } from "./operator";

const WUSDC = address(DEVNET_WUSDC_MINT);
const ED25519_PROGRAM = address("Ed25519SigVerify111111111111111111111111111");
const SYSVAR_INSTRUCTIONS = address("Sysvar1nstructions1111111111111111111111111");
const SYSTEM = address("11111111111111111111111111111111");
const decodeAddress = getAddressDecoder();

describe("the authorization message", () => {
  // These strings are the contract with the on-chain program: `authorization_message` in
  // programs/vault/src/instructions/authorize_operator.rs builds exactly this and compares bytes. If this test is edited,
  // the Rust must be edited to match, or every authorization fails.
  test("matches the program's wording for an authorization", () => {
    expect(
      authorizationMessage({ vault: address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"), operator: WUSDC, expiresAt: 1_800_003_600n, maxPayments: 12, seq: 3n }),
    ).toBe(
      "Cipherpay: authorize payroll operator\n" +
        "vault: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU\n" +
        "operator: 3Qj6ZeyMdytvoTXdRTygJrWAWLaiNEpiYMEVLejY6oPf\n" +
        "expires: 1800003600\n" +
        "payments: 12\n" +
        "seq: 3",
    );
  });

  test("matches the program's wording for a revoke", () => {
    expect(authorizationMessage({ vault: address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"), operator: NO_OPERATOR, expiresAt: 0n, maxPayments: 0, seq: 7n })).toBe(
      "Cipherpay: revoke payroll operator\nvault: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU\nseq: 7",
    );
  });

  test("is readable: the admin can see what they are agreeing to", () => {
    const text = authorizationMessage({ vault: WUSDC, operator: WUSDC, expiresAt: 1_800_000_000n, maxPayments: 5, seq: 0n });
    expect(text).toContain("Cipherpay");
    expect(text.split("\n")).toHaveLength(6);
  });
});

describe("the Ed25519 verify instruction", () => {
  test("lays the bytes out where the precompile and the program both expect them", async () => {
    const signer = await generateKeyPairSigner();
    const message = new TextEncoder().encode("hello");
    const signature = new Uint8Array(64).fill(7);
    const ix = ed25519VerifyInstruction(signer.address, message, signature);

    expect(ix.programAddress).toBe(ED25519_PROGRAM);
    const data = Uint8Array.from(ix.data!);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(data[0]).toBe(1); // exactly one signature
    expect(data[1]).toBe(0);
    expect(view.getUint16(2, true)).toBe(48); // signature offset
    expect(view.getUint16(6, true)).toBe(16); // public key offset
    expect(view.getUint16(10, true)).toBe(112); // message offset
    expect(view.getUint16(12, true)).toBe(message.length);
    // All three "instruction index" fields must say "this instruction", or the bytes the runtime verifies would not be the
    // bytes the program reads.
    for (const offset of [4, 8, 14]) expect(view.getUint16(offset, true)).toBe(0xffff);
    expect(decodeAddress.decode(data.subarray(16, 48))).toBe(signer.address);
    expect(data.subarray(48, 112)).toEqual(signature);
    expect(data.subarray(112)).toEqual(message);
  });

  test("refuses a signature that is not 64 bytes", async () => {
    const signer = await generateKeyPairSigner();
    expect(() => ed25519VerifyInstruction(signer.address, new Uint8Array(1), new Uint8Array(32))).toThrow();
  });
});

describe("buildAuthorization", () => {
  test("asks the wallet to sign the message, and returns [verify, authorize] paid for by the helper, not the admin", async () => {
    const admin = await generateKeyPairSigner();
    const helper = await generateKeyPairSigner();
    const [vault] = await findVaultPda({ admin: admin.address, mint: WUSDC });
    const terms = { vault, operator: helper.address, expiresAt: 1_800_003_600n, maxPayments: 9, seq: 2n };

    let asked: Uint8Array | null = null;
    const signMessage = async (message: Uint8Array) => {
      asked = message;
      const [d] = await admin.signMessages([{ content: message, signatures: {} }]);
      return { signature: d[admin.address] as unknown as Uint8Array, signedMessage: message };
    };

    const [verify, authorize] = await buildAuthorization({ admin: admin.address, payer: helper, terms, signMessage });

    expect(new TextDecoder().decode(asked!)).toBe(authorizationMessage(terms));
    expect(verify.programAddress).toBe(ED25519_PROGRAM);
    expect(decodeAddress.decode(Uint8Array.from(verify.data!).subarray(16, 48))).toBe(admin.address);

    expect(authorize.programAddress).toBe(VAULT_PROGRAM_ADDRESS);
    const [operatorConfig] = await findOperatorConfigPda({ vault });
    expect(authorize.accounts!.map((a) => a.address)).toEqual([helper.address, vault, operatorConfig, SYSVAR_INSTRUCTIONS, SYSTEM]);
    // The admin's wallet signs nothing in this transaction: that is the entire point.
    expect(authorize.accounts!.map((a) => a.address)).not.toContain(admin.address);

    const args = getAuthorizeOperatorInstructionDataDecoder().decode(Uint8Array.from(authorize.data!));
    expect(args.operator).toBe(helper.address);
    expect(args.expiresAt).toBe(terms.expiresAt);
    expect(args.maxPayments).toBe(9);
    expect(args.seq).toBe(2n);
  });

  test("refuses a wallet that alters the message before signing it", async () => {
    const admin = await generateKeyPairSigner();
    const helper = await generateKeyPairSigner();
    const [vault] = await findVaultPda({ admin: admin.address, mint: WUSDC });
    const signMessage = async (message: Uint8Array) => {
      const altered = new TextEncoder().encode(`Sign-in request:\n${new TextDecoder().decode(message)}`);
      const [d] = await admin.signMessages([{ content: altered, signatures: {} }]);
      return { signature: d[admin.address] as unknown as Uint8Array, signedMessage: altered };
    };
    await expect(
      buildAuthorization({ admin: admin.address, payer: helper, terms: { vault, operator: helper.address, expiresAt: 1_800_003_600n, maxPayments: 1, seq: 0n }, signMessage }),
    ).rejects.toThrow(/changed the authorization text/);
  });

  test("the default TTL is one of the offered windows and well inside the program's 24 hour cap", () => {
    expect(DEFAULT_OPERATOR_TTL_SECONDS).toBeLessThanOrEqual(24 * 60 * 60);
  });
});

describe("operator status never goes backwards", () => {
  const helper = address("9tbZBdds8EuGX2Yb1yBYWtnA9UyhgxjfVCmgmfV5LPwV");
  const live: OperatorStatus = { operator: helper, isHelper: true, expiresAt: 1_000n, paymentsLeft: 3, seq: 5n, authorized: true };
  const revoked: OperatorStatus = { operator: null, isHelper: false, expiresAt: 0n, paymentsLeft: 0, seq: 6n, authorized: false };

  test("the first answer is always taken", () => expect(supersedes(null, live)).toBe(true));
  test("a revoke (next seq) replaces a live authorization", () => expect(supersedes(live, revoked)).toBe(true));
  test("a stale answer from before the revoke does not bring the authorization back", () => expect(supersedes(revoked, live)).toBe(false));
  test("a stale answer from before the authorization does not turn it off", () => {
    const before: OperatorStatus = { ...revoked, seq: 4n };
    expect(supersedes(live, before)).toBe(false);
  });
  test("a payment (same seq, one fewer left) is taken; an answer from before it is not", () => {
    const afterPay = { ...live, paymentsLeft: 2 };
    expect(supersedes(live, afterPay)).toBe(true);
    expect(supersedes(afterPay, live)).toBe(false);
  });
  test("the same state again is taken (so the clock-based fields refresh)", () => expect(supersedes(live, { ...live })).toBe(true));
});

describe("usable time left", () => {
  const m = BigInt(OPERATOR_MARGIN_SECONDS);
  test("is the time to expiry minus the margin", () => expect(usableSecondsLeft(1_000n, 900n)).toBe(100 - OPERATOR_MARGIN_SECONDS));
  test("reaches 0 exactly when a payment would be refused, and never goes negative", () => {
    expect(usableSecondsLeft(1_000n, 1_000n - m - 1n)).toBe(1);
    expect(usableSecondsLeft(1_000n, 1_000n - m)).toBe(0);
    expect(usableSecondsLeft(1_000n, 1_000n - 5n)).toBe(0);
    expect(usableSecondsLeft(1_000n, 2_000n)).toBe(0);
  });
});
