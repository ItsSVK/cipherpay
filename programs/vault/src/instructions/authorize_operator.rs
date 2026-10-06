use anchor_lang::prelude::*;
use solana_instructions_sysvar as sysvar_instructions;

use crate::{
    error::VaultError, events::SetOperatorEvent, OperatorConfig, Vault, MAX_OPERATOR_TTL_SECONDS,
    OPERATOR_SEED, VAULT_SEED,
};

/// The Ed25519 signature-verification precompile. The runtime checks every signature in an
/// instruction addressed to it; if any is wrong the whole transaction fails before our program runs.
pub const ED25519_PROGRAM_ID: Pubkey = Pubkey::new_from_array(solana_sdk_ids::ed25519_program::ID.to_bytes());

/// Authorizes (or revokes) the payroll operator from a message the admin SIGNED OFFLINE, instead of
/// from a transaction the admin signed.
///
/// Why this exists: a transaction is only valid for ~150 blocks (about 40 seconds on devnet), and a
/// browser wallet that is slow to show its approval (it simulates the transaction against its own RPC,
/// which may be rate-limited) can blow through that window, so the admin approves something that is
/// already dead. A SIGNED MESSAGE has no expiry and nothing to simulate, so the admin can take as long
/// as they like. Whoever holds the signed message (in practice the payroll helper, which is the operator
/// being authorized) then builds and pays for this transaction themselves.
///
/// The transaction must therefore be:
///   [ Ed25519 verify (admin's pubkey, the message, the admin's signature), authorize_operator(..) ]
/// This instruction re-derives the exact message the admin must have signed from its own arguments and
/// the vault, then checks the preceding instruction really is the precompile certifying THAT message
/// under `Vault.authority`. It never trusts the arguments on their own.
///
/// Replay is prevented by `seq`: the message must carry the config's current sequence number, which is
/// incremented here (and by `set_operator`), so each signed message works exactly once.
#[derive(Accounts)]
pub struct AuthorizeOperator<'info> {
    /// Whoever submits and pays. Carries no authority: the admin's authority comes from the signed
    /// message, which is why a slow wallet never has to sign this transaction.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.authority.key().as_ref(), vault.mint.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + OperatorConfig::INIT_SPACE,
        seeds = [OPERATOR_SEED, vault.key().as_ref()],
        bump,
    )]
    pub operator_config: Account<'info, OperatorConfig>,

    /// CHECK: the instructions sysvar, pinned by address; read only to find the Ed25519 instruction.
    #[account(address = sysvar_instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// The exact text the admin signs. Built identically here and in the client; a single byte of
/// difference makes the authorization fail, which is the point.
///
/// It is deliberately human-readable, because the wallet shows it to the admin verbatim. That is
/// strictly better than blind-signing an opaque instruction.
pub fn authorization_message(
    vault: &Pubkey,
    operator: &Pubkey,
    expires_at: i64,
    max_payments: u32,
    seq: u64,
) -> String {
    if *operator == Pubkey::default() {
        format!("Cipherpay: revoke payroll operator\nvault: {vault}\nseq: {seq}")
    } else {
        format!(
            "Cipherpay: authorize payroll operator\nvault: {vault}\noperator: {operator}\nexpires: {expires_at}\npayments: {max_payments}\nseq: {seq}"
        )
    }
}

/// Reads an Ed25519 precompile instruction and returns the (public key, message) it certifies.
///
/// Layout (one signature, as every standard builder emits it):
///   [0]      number of signatures (we require exactly 1)
///   [1]      padding
///   [2..16]  offsets: signature, signature ix index, pubkey, pubkey ix index, message, message len, message ix index
///   [16..48] public key
///   [48..112] signature
///   [112..]  message
/// Every "instruction index" must be `u16::MAX`, which means "this instruction": otherwise the
/// precompile would be certifying bytes living in some OTHER instruction, and the bytes we read here
/// would not be the bytes the runtime verified.
fn ed25519_signed_payload(data: &[u8]) -> Result<(Pubkey, Vec<u8>)> {
    require!(data.len() >= 16, VaultError::InvalidAuthorization);
    require!(
        data[0] == 1 && data[1] == 0,
        VaultError::InvalidAuthorization
    );

    let u16_at = |offset: usize| -> u16 { u16::from_le_bytes([data[offset], data[offset + 1]]) };
    let signature_instruction_index = u16_at(4);
    let public_key_offset = u16_at(6) as usize;
    let public_key_instruction_index = u16_at(8);
    let message_data_offset = u16_at(10) as usize;
    let message_data_size = u16_at(12) as usize;
    let message_instruction_index = u16_at(14);

    require!(
        signature_instruction_index == u16::MAX
            && public_key_instruction_index == u16::MAX
            && message_instruction_index == u16::MAX,
        VaultError::InvalidAuthorization
    );

    let public_key_end = public_key_offset
        .checked_add(32)
        .ok_or(VaultError::InvalidAuthorization)?;
    let message_end = message_data_offset
        .checked_add(message_data_size)
        .ok_or(VaultError::InvalidAuthorization)?;
    require!(
        public_key_end <= data.len() && message_end <= data.len(),
        VaultError::InvalidAuthorization
    );

    let public_key = Pubkey::try_from(&data[public_key_offset..public_key_end])
        .map_err(|_| error!(VaultError::InvalidAuthorization))?;
    Ok((public_key, data[message_data_offset..message_end].to_vec()))
}

impl<'info> AuthorizeOperator<'info> {
    /// Confirms the admin really signed exactly this authorization, in this transaction.
    fn assert_admin_signed(&self, operator: Pubkey, expires_at: i64, max_payments: u32, seq: u64) -> Result<()> {
        let instruction = sysvar_instructions::get_instruction_relative(
            -1,
            &self.instructions_sysvar.to_account_info(),
        )
        .map_err(|_| error!(VaultError::InvalidAuthorization))?;
        require_keys_eq!(
            instruction.program_id,
            ED25519_PROGRAM_ID,
            VaultError::InvalidAuthorization
        );

        let (signer, message) = ed25519_signed_payload(&instruction.data)?;
        require_keys_eq!(signer, self.vault.authority, VaultError::Unauthorized);

        let expected = authorization_message(
            &self.vault.key(),
            &operator,
            expires_at,
            max_payments,
            seq,
        );
        require!(
            message == expected.as_bytes(),
            VaultError::InvalidAuthorization
        );
        Ok(())
    }

    fn authorize(&mut self, operator: Pubkey, expires_at: i64, max_payments: u32, seq: u64, bump: u8) -> Result<()> {
        // The signed message is good for exactly one use.
        require!(
            seq == self.operator_config.seq,
            VaultError::AuthorizationSeqMismatch
        );

        let revoking = operator == Pubkey::default();
        if !revoking {
            let now = Clock::get()?.unix_timestamp;
            require!(
                expires_at > now && expires_at <= now.saturating_add(MAX_OPERATOR_TTL_SECONDS),
                VaultError::InvalidOperatorExpiry
            );
            require!(max_payments >= 1, VaultError::InvalidOperatorLimit);
        }

        self.operator_config.set_inner(OperatorConfig {
            vault: self.vault.key(),
            operator,
            expires_at: if revoking { 0 } else { expires_at },
            payments_left: if revoking { 0 } else { max_payments },
            seq: seq.saturating_add(1),
            bump,
        });
        Ok(())
    }
}

pub fn handle_authorize_operator(
    ctx: Context<AuthorizeOperator>,
    operator: Pubkey,
    expires_at: i64,
    max_payments: u32,
    seq: u64,
) -> Result<()> {
    let bump = ctx.bumps.operator_config;
    ctx.accounts
        .assert_admin_signed(operator, expires_at, max_payments, seq)?;
    ctx.accounts.authorize(operator, expires_at, max_payments, seq, bump)?;

    emit!(SetOperatorEvent {
        vault: ctx.accounts.vault.key(),
        admin: ctx.accounts.vault.authority,
        operator: ctx.accounts.operator_config.operator,
        expires_at: ctx.accounts.operator_config.expires_at,
        payments_left: ctx.accounts.operator_config.payments_left,
        seq: ctx.accounts.operator_config.seq,
    });

    Ok(())
}
