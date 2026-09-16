import { PublicKey } from "@solana/web3.js";

export const VAULT_PROGRAM_ID = new PublicKey(
  "ELChxVFAiE5jv1SV3v3gprWeWxmbgX7ATWingW5VcB48",
);

/** Our fork of spl-token-wrap. See native_programs/token_wrap_compliance. */
export const TOKEN_WRAP_COMPLIANCE_PROGRAM_ID = new PublicKey(
  "9tbZBdds8EuGX2Yb1yBYWtnA9UyhgxjfVCmgmfV5LPwV",
);

export const ZK_ELGAMAL_PROOF_PROGRAM_ID = new PublicKey(
  "ZkE1Gama1Proof11111111111111111111111111111",
);

/** Must match token_wrap_compliance's own (private) seed constants. */
export const WRAPPED_MINT_SEED = Buffer.from("mint");
export const WRAPPED_MINT_AUTHORITY_SEED = Buffer.from("authority");
export const WRAPPED_MINT_BACKPOINTER_SEED = Buffer.from("backpointer");

/**
 * The auditor ElGamal pubkey `token_wrap_compliance`'s
 * `ComplianceMintCustomizer` registers on every wrapped mint it creates
 * (native_programs/token_wrap_compliance/src/mint_customizer/compliance.rs's
 * AUDITOR_ELGAMAL_PUBKEY_B64). Any transfer proof for a wrapped mint must be
 * built against this exact pubkey, or Token-2022 rejects it with
 * "ElGamal public key mismatch" -- see CLAUDE.md for the same lesson
 * discovered on the Rust test side.
 */
export const COMPLIANCE_AUDITOR_ELGAMAL_PUBKEY_BYTES = new Uint8Array([
  222, 190, 234, 244, 211, 116, 20, 149, 13, 226, 163, 56, 213, 99, 66, 118,
  14, 22, 25, 233, 104, 118, 24, 71, 176, 183, 206, 180, 240, 123, 133, 105,
]);
