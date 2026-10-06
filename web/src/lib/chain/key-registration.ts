// CLIENT-ONLY. The pieces every "register my encryption key on a token account" instruction needs:
// a pubkey-validity proof (as its own instruction), the ElGamal public key, and an AES-encrypted zero balance.
import type { Instruction, TransactionSigner } from "@solana/kit";
import { verifyPubkeyValidity } from "@solana-program/zk-elgamal-proof";
import type { DerivedKeys } from "@/lib/crypto/keys";
import type { AppRpc } from "./rpc";

export interface KeyRegistration {
  /** Goes immediately before the instruction that registers the key (offset -1 from that top-level instruction). */
  verify: Instruction[];
  elgamalPubkey: Uint8Array;
  decryptableZeroBalance: Uint8Array;
}

export async function buildKeyRegistration(input: { rpc: AppRpc; signer: TransactionSigner; keys: DerivedKeys }): Promise<KeyRegistration> {
  const { rpc, signer, keys } = input;
  const { AeKey, ElGamalKeypair, ElGamalSecretKey, PubkeyValidityProofData } = await import("@solana/zk-sdk/bundler");
  const secret = ElGamalSecretKey.fromBytes(keys.elgamalKeypair.secretKey);
  const keypair = ElGamalKeypair.fromSecretKey(secret);
  const ae = AeKey.fromBytes(keys.aeKey);
  const proof = new PubkeyValidityProofData(keypair);
  // .pubkey() and .encrypt() each hand back a new WASM object, so they are freed here too, not just their owners.
  const pubkey = keypair.pubkey();
  const zero = ae.encrypt(0n);
  try {
    return {
      verify: await verifyPubkeyValidity({ rpc, payer: signer, proofData: proof.toBytes() }),
      elgamalPubkey: pubkey.toBytes(),
      decryptableZeroBalance: zero.toBytes(),
    };
  } finally {
    zero.free();
    pubkey.free();
    proof.free();
    keypair.free();
    secret.free();
    ae.free();
  }
}
