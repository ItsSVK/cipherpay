//! Client-side proof generation and context-state-account bootstrap for
//! `pay_employee`'s three transfer proofs (equality, ciphertext-validity,
//! range) and `withdraw_confidential`'s two (equality, range).
//!
//! Unlike the single small `VerifyPubkeyValidity` proof used elsewhere in
//! this suite (embedded in the same transaction via
//! `ProofLocation::InstructionOffset`), these proofs are too large to fit
//! alongside the transfer/withdraw instruction itself -- see `CLAUDE.md`.
//! Each instead gets its own **context-state account**: a fresh, plain
//! (non-PDA) account the client creates and funds directly, then populates
//! by submitting a `VerifyProof` instruction against the ZK ElGamal Proof
//! program in its own transaction. The consuming instruction then
//! references them by address (`ProofLocation::ContextStateAccount`).
//!
//! The proof math itself (splitting the amount into lo/hi components,
//! building the Pedersen commitments and sigma/range proofs) is not
//! reimplemented here -- `spl-token-confidential-transfer-proof-generation`
//! (pinned to the same `solana-zk-sdk` version, 4.0.0, this suite already
//! uses for key material) does that, matching the exact protocol Token-2022
//! expects.

use anchor_lang::solana_program::system_instruction;
use litesvm::LiteSVM;
use solana_address::Address;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_zk_sdk::{
    encryption::{
        auth_encryption::{AeCiphertext, AeKey},
        elgamal::{ElGamalCiphertext, ElGamalKeypair, ElGamalPubkey},
    },
    zk_elgamal_proof_program::{
        self,
        instruction::{ContextStateInfo, ProofInstruction},
        proof_data::{
            BatchedGroupedCiphertext3HandlesValidityProofContext, BatchedRangeProofContext,
            CiphertextCommitmentEqualityProofContext, ZkProofData,
        },
        state::ProofContextState,
    },
};
use spl_token_confidential_transfer_proof_generation::{
    transfer::transfer_split_proof_data, withdraw::withdraw_proof_data,
};

use crate::common::ix::send;

/// The auditor ElGamal pubkey `token_wrap_compliance`'s
/// `ComplianceMintCustomizer` registers on every wrapped mint it creates
/// (`native_programs/token_wrap_compliance/src/mint_customizer/compliance.rs`'s
/// `AUDITOR_ELGAMAL_PUBKEY_B64`, base64 `3r7q9NN0FJUN4qM41WNCdg4WGelodhhHsLfOtPB7hWk=`,
/// decoded to raw bytes here rather than depending on that crate directly
/// -- same cross-version-Pubkey reasoning as `token_wrap.rs`). A proof
/// built for a wrapped-mint transfer with the wrong (or no) auditor pubkey
/// fails Token-2022's own check with "ElGamal public key mismatch", not a
/// silent success -- see `setup_transfer_proof_contexts`'s doc comment.
pub const COMPLIANCE_AUDITOR_ELGAMAL_PUBKEY_BYTES: [u8; 32] = [
    222, 190, 234, 244, 211, 116, 20, 149, 13, 226, 163, 56, 213, 99, 66, 118, 14, 22, 25, 233,
    104, 118, 24, 71, 176, 183, 206, 180, 240, 123, 133, 105,
];

/// Parses [`COMPLIANCE_AUDITOR_ELGAMAL_PUBKEY_BYTES`] into an `ElGamalPubkey`.
pub fn compliance_auditor_elgamal_pubkey() -> ElGamalPubkey {
    ElGamalPubkey::try_from(COMPLIANCE_AUDITOR_ELGAMAL_PUBKEY_BYTES.as_slice())
        .expect("compliance auditor pubkey bytes should be a valid ElGamalPubkey")
}

/// Everything `pay_employee` needs, once the three transactions
/// built by [`setup_transfer_proof_contexts`] have all landed.
pub struct TransferProofContexts {
    pub equality_context: Address,
    pub ciphertext_validity_context: Address,
    pub range_context: Address,
    pub new_source_decryptable_available_balance: [u8; 36],
    pub transfer_amount_auditor_ciphertext_lo: [u8; 64],
    pub transfer_amount_auditor_ciphertext_hi: [u8; 64],
}

fn create_proof_context_account<T, U>(
    svm: &mut LiteSVM,
    payer: &Keypair,
    proof_instruction: ProofInstruction,
    proof_data: &T,
    context_data_len: usize,
) -> Address
where
    T: bytemuck::Pod + ZkProofData<U>,
    U: bytemuck::Pod,
{
    let context_keypair = Keypair::new();
    let context_address = context_keypair.pubkey();

    let lamports = svm.minimum_balance_for_rent_exemption(context_data_len);
    let create_account_ix = system_instruction::create_account(
        &payer.pubkey(),
        &context_address,
        lamports,
        context_data_len as u64,
        &zk_elgamal_proof_program::id(),
    );

    let verify_proof_ix = proof_instruction.encode_verify_proof(
        Some(ContextStateInfo {
            context_state_account: &context_address,
            context_state_authority: &payer.pubkey(),
        }),
        proof_data,
    );

    send(
        svm,
        &[create_account_ix, verify_proof_ix],
        payer,
        &[&context_keypair],
    );

    context_address
}

/// Generates the three proofs for transferring `amount` from an account
/// whose current confidential state is `current_available_balance`
/// (ElGamal-encrypted, 64 bytes) / `current_decryptable_available_balance`
/// (AES-encrypted, 36 bytes), and submits one transaction per proof to
/// create and populate its context-state account.
///
/// `auditor_elgamal_pubkey` must match whatever auditor (if any) is
/// actually registered on the mint -- pass `None` for a mint created via
/// `mint::create_confidential_mint` (no auditor), or the auditor's real
/// pubkey for a mint that has one configured (e.g. a wrapped mint created
/// through `token_wrap_compliance`'s `ComplianceMintCustomizer`). Getting
/// this wrong doesn't silently succeed -- Token-2022 rejects the transfer
/// with "ElGamal public key mismatch" if the ciphertext-validity proof's
/// auditor ciphertext doesn't match the mint's registered auditor key.
#[allow(clippy::too_many_arguments)]
pub fn setup_transfer_proof_contexts(
    svm: &mut LiteSVM,
    payer: &Keypair,
    current_available_balance: [u8; 64],
    current_decryptable_available_balance: [u8; 36],
    amount: u64,
    source_elgamal: &ElGamalKeypair,
    source_ae_key: &AeKey,
    destination_elgamal_pubkey: &ElGamalPubkey,
    auditor_elgamal_pubkey: Option<&ElGamalPubkey>,
) -> TransferProofContexts {
    let current_available_balance_ciphertext =
        ElGamalCiphertext::from_bytes(&current_available_balance)
            .expect("failed to parse current available balance ciphertext");
    let current_decryptable_balance_ciphertext =
        AeCiphertext::from_bytes(&current_decryptable_available_balance)
            .expect("failed to parse current decryptable available balance");

    let current_balance = current_decryptable_balance_ciphertext
        .decrypt(source_ae_key)
        .expect("failed to decrypt current available balance");
    let new_balance = current_balance
        .checked_sub(amount)
        .expect("transfer amount exceeds current available balance");
    let new_source_decryptable_available_balance = source_ae_key.encrypt(new_balance).to_bytes();

    let proof_data = transfer_split_proof_data(
        &current_available_balance_ciphertext,
        &current_decryptable_balance_ciphertext,
        amount,
        source_elgamal,
        source_ae_key,
        destination_elgamal_pubkey,
        auditor_elgamal_pubkey,
    )
    .expect("failed to generate transfer proof data");

    let equality_context = create_proof_context_account(
        svm,
        payer,
        ProofInstruction::VerifyCiphertextCommitmentEquality,
        &proof_data.equality_proof_data,
        std::mem::size_of::<ProofContextState<CiphertextCommitmentEqualityProofContext>>(),
    );

    let ciphertext_validity_context = create_proof_context_account(
        svm,
        payer,
        ProofInstruction::VerifyBatchedGroupedCiphertext3HandlesValidity,
        &proof_data
            .ciphertext_validity_proof_data_with_ciphertext
            .proof_data,
        std::mem::size_of::<ProofContextState<BatchedGroupedCiphertext3HandlesValidityProofContext>>(),
    );

    let range_context = create_proof_context_account(
        svm,
        payer,
        ProofInstruction::VerifyBatchedRangeProofU128,
        &proof_data.range_proof_data,
        std::mem::size_of::<ProofContextState<BatchedRangeProofContext>>(),
    );

    let transfer_amount_auditor_ciphertext_lo: [u8; 64] = *bytemuck::bytes_of(
        &proof_data
            .ciphertext_validity_proof_data_with_ciphertext
            .ciphertext_lo,
    )
    .first_chunk()
    .expect("PodElGamalCiphertext should be 64 bytes");
    let transfer_amount_auditor_ciphertext_hi: [u8; 64] = *bytemuck::bytes_of(
        &proof_data
            .ciphertext_validity_proof_data_with_ciphertext
            .ciphertext_hi,
    )
    .first_chunk()
    .expect("PodElGamalCiphertext should be 64 bytes");

    TransferProofContexts {
        equality_context,
        ciphertext_validity_context,
        range_context,
        new_source_decryptable_available_balance,
        transfer_amount_auditor_ciphertext_lo,
        transfer_amount_auditor_ciphertext_hi,
    }
}

/// Everything `withdraw_confidential` needs, once the two transactions
/// built by [`setup_withdraw_proof_contexts`] have all landed.
pub struct WithdrawProofContexts {
    pub equality_context: Address,
    pub range_context: Address,
    pub new_decryptable_available_balance: [u8; 36],
}

/// Generates the two proofs for withdrawing `amount` from an account whose
/// current confidential state is `current_available_balance`
/// (ElGamal-encrypted, 64 bytes) / `current_decryptable_available_balance`
/// (AES-encrypted, 36 bytes), and submits one transaction per proof to
/// create and populate its context-state account.
pub fn setup_withdraw_proof_contexts(
    svm: &mut LiteSVM,
    payer: &Keypair,
    current_available_balance: [u8; 64],
    current_decryptable_available_balance: [u8; 36],
    amount: u64,
    elgamal: &ElGamalKeypair,
    ae_key: &AeKey,
) -> WithdrawProofContexts {
    let current_available_balance_ciphertext =
        ElGamalCiphertext::from_bytes(&current_available_balance)
            .expect("failed to parse current available balance ciphertext");
    let current_decryptable_balance_ciphertext =
        AeCiphertext::from_bytes(&current_decryptable_available_balance)
            .expect("failed to parse current decryptable available balance");

    let current_balance = current_decryptable_balance_ciphertext
        .decrypt(ae_key)
        .expect("failed to decrypt current available balance");
    let new_balance = current_balance
        .checked_sub(amount)
        .expect("withdraw amount exceeds current available balance");
    let new_decryptable_available_balance = ae_key.encrypt(new_balance).to_bytes();

    let proof_data = withdraw_proof_data(
        &current_available_balance_ciphertext,
        current_balance,
        amount,
        elgamal,
    )
    .expect("failed to generate withdraw proof data");

    let equality_context = create_proof_context_account(
        svm,
        payer,
        ProofInstruction::VerifyCiphertextCommitmentEquality,
        &proof_data.equality_proof_data,
        std::mem::size_of::<ProofContextState<CiphertextCommitmentEqualityProofContext>>(),
    );

    let range_context = create_proof_context_account(
        svm,
        payer,
        ProofInstruction::VerifyBatchedRangeProofU64,
        &proof_data.range_proof_data,
        std::mem::size_of::<ProofContextState<BatchedRangeProofContext>>(),
    );

    WithdrawProofContexts {
        equality_context,
        range_context,
        new_decryptable_available_balance,
    }
}
