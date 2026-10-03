use std::num::NonZeroI8;

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_spl::associated_token;
use bytemuck::Zeroable;
use solana_zk_elgamal_proof_interface::proof_data::PubkeyValidityProofData;
use solana_zk_sdk_pod::encryption::auth_encryption::PodAeCiphertext;
use spl_token_2022_interface::{
    extension::{
        confidential_transfer::instruction::inner_configure_account,
        confidential_transfer::DEFAULT_MAXIMUM_PENDING_BALANCE_CREDIT_COUNTER, ExtensionType,
    },
    instruction::reallocate,
};
use spl_token_confidential_transfer_proof_extraction::instruction::ProofLocation;

/// Who authorizes the `Reallocate`/`ConfigureAccount` CPIs: either a real
/// transaction signer (plain `invoke`), or a program-derived address the
/// calling program signs for on the account's behalf (`invoke_signed`).
///
/// Whether to use `Signer` or `Pda` for a given token account depends
/// entirely on that account's Token-2022 *owner* -- not on which
/// instruction file you're calling from. See the "Hard-won lessons" entry
/// in this workspace's `CLAUDE.md` for why that check matters every time.
pub enum Authority<'a, 'info> {
    /// The token account's owner is a real wallet that signed this
    /// transaction directly.
    Signer(&'a AccountInfo<'info>),
    /// The token account's owner is a PDA of the calling program; `seeds`
    /// are that PDA's `invoke_signed` seeds (bump included).
    Pda {
        account: &'a AccountInfo<'info>,
        seeds: Vec<Vec<u8>>,
    },
}

impl<'a, 'info> Authority<'a, 'info> {
    pub fn key(&self) -> Pubkey {
        match self {
            Authority::Signer(info) => *info.key,
            Authority::Pda { account, .. } => *account.key,
        }
    }

    pub fn account_info(&self) -> AccountInfo<'info> {
        match self {
            Authority::Signer(info) => (*info).clone(),
            Authority::Pda { account, .. } => (*account).clone(),
        }
    }

    fn invoke(&self, ix: &Instruction, account_infos: &[AccountInfo<'info>]) -> Result<()> {
        match self {
            Authority::Signer(_) => invoke(ix, account_infos)?,
            Authority::Pda { seeds, .. } => {
                let seed_refs: Vec<&[u8]> = seeds.iter().map(Vec::as_slice).collect();
                invoke_signed(ix, account_infos, &[&seed_refs])?;
            }
        }
        Ok(())
    }
}

/// The create -> reallocate -> configure sequence every confidential
/// Token-2022 account needs, since Anchor's `#[account(init, ...)]` sugar
/// can't allocate `ConfidentialTransferAccount` extension space. Extracted
/// from `vault`'s `create_confidential_account` (authority = the user's own
/// wallet) and `configure_treasury_account` (authority = the vault PDA).
pub struct ConfidentialAccountSetup<'a, 'info> {
    /// Funds rent for account creation and the extension-space reallocation.
    /// Not necessarily the same account as `authority` -- e.g. an admin can
    /// pay while a PDA is the authority.
    pub payer: &'a AccountInfo<'info>,
    /// The token account being created and configured. Must not already
    /// exist as anything other than what `create_idempotent` would produce.
    pub token_account: &'a AccountInfo<'info>,
    pub mint: &'a AccountInfo<'info>,
    /// The token account's Token-2022 owner -- see [`Authority`].
    pub authority: Authority<'a, 'info>,
    /// CHECK: caller is responsible for verifying this is the real
    /// instructions sysvar (e.g. an `#[account(address = ...)]` constraint)
    /// before constructing this struct.
    pub instructions_sysvar: &'a AccountInfo<'info>,
    pub associated_token_program: &'a AccountInfo<'info>,
    pub token_program: &'a AccountInfo<'info>,
    pub system_program: &'a AccountInfo<'info>,
}

impl<'a, 'info> ConfidentialAccountSetup<'a, 'info> {
    /// Creates the associated token account for `mint`, owned by
    /// `authority`. Only allocates space for the base account plus whatever
    /// extensions the associated token program deems required by the mint
    /// (e.g. `ImmutableOwner`) -- `ConfidentialTransferAccount` is added
    /// separately, since it isn't auto-required and needs the owner's
    /// ElGamal pubkey.
    pub fn create_token_account(&self) -> Result<()> {
        associated_token::create_idempotent(CpiContext::new(
            *self.associated_token_program.key,
            associated_token::Create {
                payer: self.payer.clone(),
                associated_token: self.token_account.clone(),
                authority: self.authority.account_info(),
                mint: self.mint.clone(),
                system_program: self.system_program.clone(),
                token_program: self.token_program.clone(),
            },
        ))
    }

    /// Grows the token account to make room for the
    /// `ConfidentialTransferAccount` extension. `payer` funds the resize;
    /// `authority` -- the token account's actual owner -- authorizes it.
    pub fn reallocate_for_confidential_transfer(&self) -> Result<()> {
        let authority_key = self.authority.key();

        let ix = reallocate(
            self.token_program.key,
            self.token_account.key,
            self.payer.key,
            &authority_key,
            &[],
            &[ExtensionType::ConfidentialTransferAccount],
        )?;

        self.authority.invoke(
            &ix,
            &[
                self.token_account.clone(),
                self.payer.clone(),
                self.system_program.clone(),
                self.authority.account_info(),
            ],
        )
    }

    /// Initializes the `ConfidentialTransferAccount` extension with
    /// `elgamal_pubkey` (via `decryptable_zero_balance`, the caller's
    /// AES-encrypted zero balance). Token-2022 independently re-verifies
    /// that the instruction immediately preceding this one in the same
    /// transaction is the matching `VerifyPubkeyValidity` proof -- callers
    /// should also check this themselves beforehand via
    /// [`crate::proof::assert_pubkey_validity_proof`], so the failure is a
    /// clear, early one rather than surfacing from deep inside this CPI.
    pub fn configure_confidential_transfer_account(
        &self,
        decryptable_zero_balance: [u8; 36],
    ) -> Result<()> {
        let authority_key = self.authority.key();

        // Ignored by `inner_configure_account` when the proof is located via
        // instruction offset rather than embedded in this instruction's data.
        let unused_proof_data = PubkeyValidityProofData::zeroed();

        let ix = inner_configure_account(
            self.token_program.key,
            self.token_account.key,
            self.mint.key,
            &PodAeCiphertext(decryptable_zero_balance),
            DEFAULT_MAXIMUM_PENDING_BALANCE_CREDIT_COUNTER,
            &authority_key,
            &[],
            ProofLocation::InstructionOffset(NonZeroI8::new(-1).unwrap(), &unused_proof_data),
        )?;

        self.authority.invoke(
            &ix,
            &[
                self.token_account.clone(),
                self.mint.clone(),
                self.instructions_sysvar.clone(),
                self.authority.account_info(),
            ],
        )
    }

    /// Runs the full create -> reallocate -> configure sequence. Callers
    /// still need to check the preceding `VerifyPubkeyValidity` proof
    /// themselves first (see [`crate::proof::assert_pubkey_validity_proof`])
    /// -- this doesn't do it implicitly, to keep the failure attributable to
    /// the right step.
    pub fn run(&self, decryptable_zero_balance: [u8; 36]) -> Result<()> {
        self.create_token_account()?;
        self.reallocate_for_confidential_transfer()?;
        self.configure_confidential_transfer_account(decryptable_zero_balance)
    }
}
