//! Client-side confidential-transfer key material: the ElGamal keypair, the
//! AES key for the decryptable balance, and the `VerifyPubkeyValidity` proof
//! that must precede `create_confidential_account` / `configure_treasury_account` in the same transaction.

use solana_instruction::Instruction;
use solana_zk_sdk::{
    encryption::{auth_encryption::AeKey, elgamal::ElGamalKeypair},
    zk_elgamal_proof_program::{
        instruction::ProofInstruction, proof_data::pubkey_validity::PubkeyValidityProofData,
    },
};

/// A user's confidential-transfer key material, generated fresh for a test.
///
/// In a real client, both keys are typically derived deterministically from
/// the user's wallet signature rather than randomly generated, but random
/// keys behave identically for exercising the on-chain checks.
pub struct ConfidentialKeys {
    pub elgamal: ElGamalKeypair,
    pub ae_key: AeKey,
}

impl ConfidentialKeys {
    pub fn new_rand() -> Self {
        Self {
            elgamal: ElGamalKeypair::new_rand(),
            ae_key: AeKey::new_rand(),
        }
    }

    /// The raw ElGamal public key bytes, as stored/compared on-chain.
    pub fn elgamal_pubkey_bytes(&self) -> [u8; 32] {
        self.elgamal.pubkey_owned().into()
    }

    /// AES-encrypted zero balance, as required by the `decryptable_zero_balance` argument of
    /// `create_confidential_account` / `configure_treasury_account`.
    pub fn decryptable_zero_balance(&self) -> [u8; 36] {
        self.ae_key.encrypt(0u64).to_bytes()
    }

    /// Builds the `VerifyPubkeyValidity` instruction (targeting the ZK
    /// ElGamal Proof program) that must immediately precede
    /// the account-setup instruction in the same transaction.
    pub fn verify_pubkey_validity_instruction(&self) -> Instruction {
        let proof_data = PubkeyValidityProofData::new(&self.elgamal)
            .expect("failed to generate pubkey validity proof");
        ProofInstruction::VerifyPubkeyValidity.encode_verify_proof(None, &proof_data)
    }
}
