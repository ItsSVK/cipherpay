import { describe, expect, test } from "bun:test";
import { address, type Address } from "@solana/kit";
import { ElGamalKeypair } from "@solana/zk-sdk/bundler";
import { getPayEmployeeInstructionDataEncoder } from "@/generated/vault/src/generated";
import { decodeReceivedAmount, encodeReceivedAmount, RECEIVED_AMOUNT_PATTERN } from "@/lib/received-amount";
import { VAULT_PROGRAM_ADDRESS } from "./constants";
import { openReceivedAmountsLocal } from "./received-amount-local";
import { receivedMatchesInstructions } from "./received-check";
import { composeTransferProofs } from "./transfer-proofs";

// The validity proof's context, as Token-2022 stores and checks it: three 32-byte pubkeys, then grouped lo and grouped hi, each
// commitment (32) || source handle (32) || destination handle (32) || auditor handle (32).
const GROUPED_LO = 96;
const GROUPED_HI = 96 + 128;
const DESTINATION_HANDLE = 64;

async function pay(amount: bigint) {
  const source = new ElGamalKeypair();
  const destination = new ElGamalKeypair();
  const auditor = new ElGamalKeypair();
  const balance = 10_000_000n;
  const proofs = await composeTransferProofs({
    currentAvailableCiphertext: source.pubkey().encryptU64(balance).toBytes(),
    currentBalance: balance,
    amount,
    sourceSecretKey: source.secret().toBytes(),
    destinationPubkey: destination.pubkey().toBytes(),
    auditorPubkey: auditor.pubkey().toBytes(),
  });
  return { proofs, destination, received: encodeReceivedAmount(proofs.destinationCiphertextLo, proofs.destinationCiphertextHi) };
}

const EMPLOYEE_ATA: Address = address("9tbZBdds8EuGX2Yb1yBYWtnA9UyhgxjfVCmgmfV5LPwV");
const OTHER: Address = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const filler = (n: number) => Array.from({ length: n }, (_, i) => address(i % 2 ? OTHER : EMPLOYEE_ATA));

function payEmployeeIx(auditorLo: Uint8Array, auditorHi: Uint8Array, employeeAta: Address = EMPLOYEE_ATA) {
  const data = getPayEmployeeInstructionDataEncoder().encode({ newSourceDecryptableAvailableBalance: new Uint8Array(36), transferAmountAuditorCiphertextLo: auditorLo, transferAmountAuditorCiphertextHi: auditorHi });
  const accounts = filler(10);
  accounts[4] = employeeAta;
  return { programAddress: address(VAULT_PROGRAM_ADDRESS), accounts, data: Uint8Array.from(data) };
}

describe("amounts encrypted to the recipient", () => {
  test("are exactly the recipient's ciphertexts inside the on-chain validity proof, and open to the amount", async () => {
    const amount = 1_250_000n; // both halves non-zero
    const { proofs, destination, received } = await pay(amount);
    const v = proofs.validity;
    const fromProof = (at: number) => Uint8Array.from([...v.slice(at, at + 32), ...v.slice(at + DESTINATION_HANDLE, at + DESTINATION_HANDLE + 32)]);
    expect(proofs.destinationCiphertextLo).toEqual(fromProof(GROUPED_LO));
    expect(proofs.destinationCiphertextHi).toEqual(fromProof(GROUPED_HI));
    // Same commitment as the auditor's copy that pay_employee carries.
    expect(proofs.destinationCiphertextLo.slice(0, 32)).toEqual(proofs.auditorCiphertextLo.slice(0, 32));

    expect(received).toMatch(RECEIVED_AMOUNT_PATTERN);
    expect(decodeReceivedAmount(received)).toEqual({ lo: proofs.destinationCiphertextLo, hi: proofs.destinationCiphertextHi });
    expect(await openReceivedAmountsLocal([received, null, "v1.nope"], destination.secret().toBytes())).toEqual([amount, null, null]);
  }, 60_000);

  test("do not open under another key", async () => {
    const { received } = await pay(42_000n);
    expect(await openReceivedAmountsLocal([received], new ElGamalKeypair().secret().toBytes())).toEqual([null]);
  }, 60_000);

  test("match the pay_employee instruction that paid them, and nothing else", async () => {
    const a = await pay(1_500_000n);
    const b = await pay(1_500_000n); // same amount, different payment: different commitments
    const ix = payEmployeeIx(a.proofs.auditorCiphertextLo, a.proofs.auditorCiphertextHi);
    expect(receivedMatchesInstructions([ix], EMPLOYEE_ATA, a.received)).toBe(true);
    expect(receivedMatchesInstructions([ix], EMPLOYEE_ATA, b.received)).toBe(false);
    expect(receivedMatchesInstructions([payEmployeeIx(a.proofs.auditorCiphertextLo, a.proofs.auditorCiphertextHi, OTHER)], EMPLOYEE_ATA, a.received)).toBe(false);
    expect(receivedMatchesInstructions([{ ...ix, programAddress: OTHER }], EMPLOYEE_ATA, a.received)).toBe(false);
    // A record that keeps the real lo but swaps in another payment's hi is caught.
    const mixed = encodeReceivedAmount(a.proofs.destinationCiphertextLo, b.proofs.destinationCiphertextHi);
    expect(receivedMatchesInstructions([ix], EMPLOYEE_ATA, mixed)).toBe(false);
  }, 60_000);
});
