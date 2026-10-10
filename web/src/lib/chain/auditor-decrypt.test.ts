import { describe, expect, test } from "bun:test";
import { address, getAddressDecoder, type Address } from "@solana/kit";
import { ElGamalKeypair } from "@solana/zk-sdk/bundler";
import { getPayEmployeeInstructionDataEncoder } from "@/generated/vault/src/generated";
import { VAULT_PROGRAM_ADDRESS } from "./constants";
import { auditorPubkeyForSecret, checkAuditorSecret, extractPayEmployee, openAuditorPayments, parseAuditorSecret, type AuditorPayment } from "./auditor-decrypt";
import { composeTransferProofs } from "./transfer-proofs";

const VAULT: Address = address("9tbZBdds8EuGX2Yb1yBYWtnA9UyhgxjfVCmgmfV5LPwV");
const OTHER_VAULT: Address = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const SIGNER: Address = address("3Qj6ZeyMdytvoTXdRTygJrWAWLaiNEpiYMEVLejY6oPf");
const EMPLOYEE_ATA: Address = address("ELChxVFAiE5jv1SV3v3gprWeWxmbgX7ATWingW5VcB48");

/** A real transfer's proofs, built against `auditor`, so the ciphertexts are exactly what pay_employee would carry. */
async function transferTo(auditor: ElGamalKeypair, amount: bigint) {
  const source = new ElGamalKeypair();
  const destination = new ElGamalKeypair();
  const balance = 50_000_000n;
  return composeTransferProofs({
    currentAvailableCiphertext: source.pubkey().encryptU64(balance).toBytes(),
    currentBalance: balance,
    amount,
    sourceSecretKey: source.secret().toBytes(),
    destinationPubkey: destination.pubkey().toBytes(),
    auditorPubkey: auditor.pubkey().toBytes(),
  });
}

function payEmployeeIx(lo: Uint8Array, hi: Uint8Array, vault: Address = VAULT) {
  const data = getPayEmployeeInstructionDataEncoder().encode({ newSourceDecryptableAvailableBalance: new Uint8Array(36), transferAmountAuditorCiphertextLo: lo, transferAmountAuditorCiphertextHi: hi });
  const accounts = Array.from({ length: 10 }, () => OTHER_VAULT);
  accounts[0] = SIGNER;
  accounts[1] = vault;
  accounts[4] = EMPLOYEE_ATA;
  return { programAddress: address(VAULT_PROGRAM_ADDRESS), accounts, data: Uint8Array.from(data) };
}

const asPayment = (p: Omit<AuditorPayment, "signature" | "blockTime">, n: number): AuditorPayment => ({ ...p, signature: `sig${n}`, blockTime: null });

describe("auditor decryption of pay_employee", () => {
  test("opens each payment's amount from the instruction's auditor ciphertexts, as lo + hi * 2^16", async () => {
    const auditor = new ElGamalKeypair();
    const amounts = [1_250_000n, 75n, 9_999_999n, 65_536n, 1n];
    const ixs = [];
    for (const a of amounts) {
      const proofs = await transferTo(auditor, a);
      ixs.push(payEmployeeIx(proofs.auditorCiphertextLo, proofs.auditorCiphertextHi));
    }
    const found = extractPayEmployee(ixs, VAULT);
    expect(found.length).toBe(amounts.length);
    expect(found[0].signer).toBe(SIGNER);
    expect(found[0].employeeTokenAccount).toBe(EMPLOYEE_ATA);
    const opened = await openAuditorPayments(found.map(asPayment), auditor.secret().toBytes());
    expect(opened).toEqual(amounts);
  }, 120_000);

  test("does not open under a key that is not the mint's auditor", async () => {
    const auditor = new ElGamalKeypair();
    const proofs = await transferTo(auditor, 1_250_000n);
    const found = extractPayEmployee([payEmployeeIx(proofs.auditorCiphertextLo, proofs.auditorCiphertextHi)], VAULT);
    expect(await openAuditorPayments(found.map(asPayment), new ElGamalKeypair().secret().toBytes())).toEqual([null]);
  }, 60_000);

  test("skips other vaults, other instructions and other programs", async () => {
    const auditor = new ElGamalKeypair();
    const proofs = await transferTo(auditor, 500n);
    const mine = payEmployeeIx(proofs.auditorCiphertextLo, proofs.auditorCiphertextHi);
    const found = extractPayEmployee(
      [
        payEmployeeIx(proofs.auditorCiphertextLo, proofs.auditorCiphertextHi, OTHER_VAULT),
        { ...mine, programAddress: OTHER_VAULT },
        { ...mine, data: Uint8Array.from([...mine.data.slice(0, 8).map((b) => b ^ 0xff), ...mine.data.slice(8)]) },
        { ...mine, data: mine.data.slice(0, 40) },
        mine,
      ],
      VAULT,
    );
    expect(found.length).toBe(1);
  }, 60_000);
});

describe("auditor secret", () => {
  test("is read from base64, hex or a JSON array, and nothing else", () => {
    const secret = new ElGamalKeypair().secret().toBytes();
    const hex = Array.from(secret, (b) => b.toString(16).padStart(2, "0")).join("");
    const b64 = btoa(String.fromCharCode(...secret));
    expect(parseAuditorSecret(b64)).toEqual(secret);
    expect(parseAuditorSecret(`  ${b64}\n`)).toEqual(secret);
    expect(parseAuditorSecret(hex)).toEqual(secret);
    expect(parseAuditorSecret(JSON.stringify(Array.from(secret)))).toEqual(secret);
    expect(parseAuditorSecret("")).toBeNull();
    expect(parseAuditorSecret("not a key")).toBeNull();
    expect(parseAuditorSecret(hex.slice(2))).toBeNull();
    expect(parseAuditorSecret(JSON.stringify([1, 2, 3]))).toBeNull();
    expect(parseAuditorSecret(JSON.stringify(Array.from(secret, (b) => b + 256)))).toBeNull();
  });

  test("is checked against the auditor pubkey the mint reports", async () => {
    const auditor = new ElGamalKeypair();
    const secret = auditor.secret().toBytes();
    const onMint = getAddressDecoder().decode(auditor.pubkey().toBytes());
    expect(await auditorPubkeyForSecret(secret)).toBe(onMint);
    expect(await checkAuditorSecret(secret, onMint)).toBe(true);
    expect(await checkAuditorSecret(new ElGamalKeypair().secret().toBytes(), onMint)).toBe(false);
  });
});
