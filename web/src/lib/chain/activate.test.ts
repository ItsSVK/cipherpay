import { describe, expect, test } from "bun:test";
import { address, generateKeyPairSigner, getAddressEncoder } from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { PubkeyValidityProofData } from "@solana/zk-sdk/bundler";
import { VAULT_PROGRAM_ADDRESS } from "@/generated/vault/src/generated";
import { deriveWalletKeys, toMessagePartialSigner, type WalletSignMessage } from "@/lib/crypto/keys";
import { buildActivationInstructions } from "./activate";
import { DEVNET_WUSDC_MINT } from "./constants";
import { ataFor } from "./read";

const ZK_PROOF_PROGRAM = "ZkE1Gama1Proof11111111111111111111111111111";

describe("buildActivationInstructions", () => {
  test("proof first, then create_confidential_account with the right accounts and the wallet's key", async () => {
    const signer = await generateKeyPairSigner();
    const sign: WalletSignMessage = async (message) => {
      const [d] = await signer.signMessages([{ content: message, signatures: {} }]);
      return { signature: d[signer.address] as unknown as Uint8Array, signedMessage: message };
    };
    const keys = await deriveWalletKeys(toMessagePartialSigner(signer.address, sign));

    // The rpc is only needed for context-state accounts, which activation doesn't use.
    const ixs = await buildActivationInstructions({ rpc: {} as never, signer, keys });
    expect(ixs).toHaveLength(2);
    const [verify, create] = ixs;

    // The proof must be the instruction immediately before the program's (offset -1).
    expect(verify.programAddress).toBe(address(ZK_PROOF_PROGRAM));
    expect(create.programAddress).toBe(VAULT_PROGRAM_ADDRESS);

    // The embedded proof is real and valid for this wallet's key.
    const proof = PubkeyValidityProofData.fromBytes(Uint8Array.from(verify.data!).slice(1));
    expect(() => proof.verify()).not.toThrow();

    const ata = await ataFor(signer.address, address(DEVNET_WUSDC_MINT), TOKEN_2022_PROGRAM_ADDRESS);
    const accounts = create.accounts!.map((a) => a.address);
    expect(accounts[0]).toBe(signer.address); // owner
    expect(accounts[1]).toBe(address(DEVNET_WUSDC_MINT)); // mint
    expect(accounts[2]).toBe(ata); // the wallet's own WUSDC associated token account
    expect(accounts[3]).toBe(address("Sysvar1nstructions1111111111111111111111111"));
    expect(accounts[5]).toBe(TOKEN_2022_PROGRAM_ADDRESS); // Token-2022, not the codegen's classic-token default

    // data = 8-byte discriminator + 32-byte ElGamal pubkey + 36-byte AES-encrypted zero
    const data = Uint8Array.from(create.data!);
    expect(data).toHaveLength(8 + 32 + 36);
    expect(Array.from(data.slice(8, 40))).toEqual(Array.from(getAddressEncoder().encode(keys.elgamalKeypair.elgamalPubkey)));
  }, 30_000);
});
