import { describe, expect, test } from "bun:test";
import { address, generateKeyPairSigner } from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { AeCiphertext, AeKey } from "@solana/zk-sdk/bundler";
import { findVaultPda, findWrappedMintPda, VAULT_PROGRAM_ADDRESS } from "@/generated/vault/src/generated";
import { deriveWalletKeys, toMessagePartialSigner, type WalletSignMessage } from "@/lib/crypto/keys";
import { DEVNET_USDC_MINT, DEVNET_WUSDC_MINT, TOKEN_WRAP_COMPLIANCE_PROGRAM_ADDRESS } from "./constants";
import { buildFundTreasuryInstructions, CLASSIC_TOKEN_PROGRAM } from "./fund";
import { ataFor } from "./read";

const USDC = address(DEVNET_USDC_MINT);
const WUSDC = address(DEVNET_WUSDC_MINT);

describe("buildFundTreasuryInstructions", () => {
  test("the wrapped mint PDA, derived under the token-wrap program, is the WUSDC constant", async () => {
    // Pins our hard-coded mint and the seeds knowledge together. The generated finder defaults to the vault program,
    // which would silently give a different address, so the program must be named.
    const [derived] = await findWrappedMintPda({ unwrappedMint: USDC, wrappedTokenProgram: TOKEN_2022_PROGRAM_ADDRESS }, { programAddress: address(TOKEN_WRAP_COMPLIANCE_PROGRAM_ADDRESS) });
    expect(derived).toBe(WUSDC);
  });

  test("wrap, fund, deposit, apply: right order, right accounts, and the new encrypted balance adds up", async () => {
    const signer = await generateKeyPairSigner();
    const sign: WalletSignMessage = async (message) => {
      const [d] = await signer.signMessages([{ content: message, signatures: {} }]);
      return { signature: d[signer.address] as unknown as Uint8Array, signedMessage: message };
    };
    const keys = await deriveWalletKeys(toMessagePartialSigner(signer.address, sign));
    const amount = 2_500_000n;
    const ixs = await buildFundTreasuryInstructions({ signer, keys, amount, treasury: { available: 7_000_000n, pending: 300_000n, pendingCreditCounter: 0n } });

    expect(ixs).toHaveLength(5);
    expect(ixs[0].programAddress).toBe(address("ComputeBudget111111111111111111111111111111"));
    expect(ixs.slice(1).every((i) => i.programAddress === VAULT_PROGRAM_ADDRESS)).toBe(true);

    const [vault] = await findVaultPda({ admin: signer.address, mint: WUSDC });
    const treasury = await ataFor(vault, WUSDC, TOKEN_2022_PROGRAM_ADDRESS);
    const adminWusdc = await ataFor(signer.address, WUSDC, TOKEN_2022_PROGRAM_ADDRESS);
    const adminUsdc = await ataFor(signer.address, USDC, CLASSIC_TOKEN_PROGRAM);
    const [wrap, fund, deposit, apply] = ixs.slice(1);

    const w = wrap.accounts!.map((a) => a.address);
    expect(w[0]).toBe(signer.address);
    expect(w[1]).toBe(USDC);
    expect(w[2]).toBe(adminUsdc);
    expect(w[3]).toBe(WUSDC);
    expect(w[6]).toBe(adminWusdc);
    expect(w[7]).toBe(address(TOKEN_WRAP_COMPLIANCE_PROGRAM_ADDRESS));
    expect(w[8]).toBe(CLASSIC_TOKEN_PROGRAM); // USDC is a classic SPL token
    expect(w[9]).toBe(TOKEN_2022_PROGRAM_ADDRESS); // WUSDC is Token-2022

    // fund_treasury moves from the admin's WUSDC account into the vault's treasury account
    expect(fund.accounts!.map((a) => a.address)).toEqual([signer.address, adminWusdc, vault, WUSDC, treasury, TOKEN_2022_PROGRAM_ADDRESS]);
    expect(deposit.accounts!.map((a) => a.address)).toEqual([signer.address, vault, WUSDC, treasury, TOKEN_2022_PROGRAM_ADDRESS]);

    // apply: the counter we expect is one more than now, and the AES balance is available + pending + the deposit
    const applyData = Uint8Array.from(apply.data!);
    expect(applyData).toHaveLength(8 + 8 + 36);
    expect(new DataView(applyData.buffer, applyData.byteOffset).getBigUint64(8, true)).toBe(1n);
    const ae = AeKey.fromBytes(keys.aeKey);
    expect(ae.decrypt(AeCiphertext.fromBytes(applyData.slice(16))!)).toBe(7_000_000n + 300_000n + amount);
  }, 30_000);

  test("refuses a zero amount", async () => {
    const signer = await generateKeyPairSigner();
    await expect(buildFundTreasuryInstructions({ signer, keys: {} as never, amount: 0n, treasury: { available: 0n, pending: 0n, pendingCreditCounter: 0n } })).rejects.toThrow();
  });
});
