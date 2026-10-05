import { describe, expect, test } from "bun:test";
import { address, generateKeyPairSigner, getAddressEncoder } from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { PubkeyValidityProofData } from "@solana/zk-sdk/bundler";
import { findVaultPda, VAULT_PROGRAM_ADDRESS } from "@/generated/vault/src/generated";
import { deriveWalletKeys, toMessagePartialSigner, type WalletSignMessage } from "@/lib/crypto/keys";
import { buildCompanySetupInstructions } from "./company";
import { DEVNET_WUSDC_MINT } from "./constants";
import { ataFor } from "./read";

const ZK_PROOF_PROGRAM = address("ZkE1Gama1Proof11111111111111111111111111111");
const WUSDC = address(DEVNET_WUSDC_MINT);

async function setup() {
  const signer = await generateKeyPairSigner();
  const sign: WalletSignMessage = async (message) => {
    const [d] = await signer.signMessages([{ content: message, signatures: {} }]);
    return { signature: d[signer.address] as unknown as Uint8Array, signedMessage: message };
  };
  const keys = await deriveWalletKeys(toMessagePartialSigner(signer.address, sign));
  const [vault] = await findVaultPda({ admin: signer.address, mint: WUSDC });
  const treasury = await ataFor(vault, WUSDC, TOKEN_2022_PROGRAM_ADDRESS);
  return { signer, keys, vault, treasury };
}

describe("buildCompanySetupInstructions", () => {
  test("new company: initialize_vault, proof, then configure_treasury_account, in that order", async () => {
    const { signer, keys, vault, treasury } = await setup();
    const ixs = await buildCompanySetupInstructions({ rpc: {} as never, signer, keys, vaultExists: false });
    expect(ixs.map((i) => i.programAddress)).toEqual([VAULT_PROGRAM_ADDRESS, ZK_PROOF_PROGRAM, VAULT_PROGRAM_ADDRESS]);

    const [init, verify, configure] = ixs;
    expect(init.accounts!.map((a) => a.address).slice(0, 3)).toEqual([signer.address, vault, WUSDC]);

    // The proof is the instruction immediately before configure_treasury_account, and it verifies.
    expect(() => PubkeyValidityProofData.fromBytes(Uint8Array.from(verify.data!).slice(1)).verify()).not.toThrow();

    const accounts = configure.accounts!.map((a) => a.address);
    expect(accounts[0]).toBe(signer.address); // admin
    expect(accounts[1]).toBe(vault);
    expect(accounts[2]).toBe(WUSDC);
    expect(accounts[3]).toBe(treasury); // the VAULT PDA's associated token account, not the admin's
    expect(accounts[3]).not.toBe(await ataFor(signer.address, WUSDC, TOKEN_2022_PROGRAM_ADDRESS));
    expect(accounts[6]).toBe(TOKEN_2022_PROGRAM_ADDRESS); // not the codegen's classic-token default

    const data = Uint8Array.from(configure.data!);
    expect(data).toHaveLength(8 + 32 + 36);
    expect(Array.from(data.slice(8, 40))).toEqual(Array.from(getAddressEncoder().encode(keys.elgamalKeypair.elgamalPubkey)));
  }, 30_000);

  test("vault already exists: skips initialize_vault so a half-finished setup can be completed", async () => {
    const { signer, keys } = await setup();
    const ixs = await buildCompanySetupInstructions({ rpc: {} as never, signer, keys, vaultExists: true });
    expect(ixs.map((i) => i.programAddress)).toEqual([ZK_PROOF_PROGRAM, VAULT_PROGRAM_ADDRESS]);
  }, 30_000);
});
