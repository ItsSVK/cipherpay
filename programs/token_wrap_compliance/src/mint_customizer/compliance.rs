use {
    crate::mint_customizer::interface::MintCustomizer,
    solana_account_info::AccountInfo,
    solana_cpi::invoke,
    solana_program_error::{ProgramError, ProgramResult},
    solana_pubkey::Pubkey,
    solana_zk_sdk::encryption::pod::elgamal::PodElGamalPubkey,
    spl_token_2022::{
        extension::{
            confidential_transfer::instruction::initialize_mint as initialize_confidential_transfer_mint,
            default_account_state::instruction::initialize_default_account_state,
            pausable::instruction::initialize as initialize_pausable, ExtensionType,
            PodStateWithExtensions,
        },
        instruction::initialize_permanent_delegate,
        pod::PodMint,
        state::{AccountState, Mint},
    },
    std::str::FromStr,
};

/// Adapted from upstream's reference `ComplianceMintCustomizer`. Adds, for
/// the wrapped mint:
/// - A permanent delegate (can move/burn from *any* holder's account,
///   without their approval -- real power, see the constant's doc comment)
/// - `Pausable` transfers, mints, burns (a circuit breaker)
/// - Confidential transfers with a designated auditor (the actual point of
///   this fork: unlike upstream's `DefaultToken2022Customizer`, this auditor
///   key is *not* `None` -- someone can decrypt transfer amounts for
///   compliance)
///
/// **All four authority roles below currently point at the same wallet**
/// (this project's existing devnet deployer key, already used as
/// `vault.authority` elsewhere in this workspace) rather than four separate
/// keys. That's a deliberate simplicity choice for now, not a requirement --
/// splitting them (e.g. a separate compliance-only key that can't also
/// freeze/pause/seize) is a real hardening step worth doing before this is
/// anything more than a demo.
///
/// In the future, can support sRFC-37: https://github.com/solana-foundation/SRFCs/discussions/2
pub struct ComplianceMintCustomizer;

/// This project's devnet deployer wallet (same key as `Anchor.toml`'s
/// `provider.wallet`, and as `vault.authority` in the main `vault` program).
/// Used below for every authority role -- see the customizer's doc comment
/// for why that's a simplification, not a design requirement.
const DEPLOYER_WALLET: Pubkey =
    solana_pubkey::pubkey!("DGDkTQ2Fziv6RTwvyTuTRbqWyrLcR8hcpbM7Ytxky6St");

/// Permanent delegate that can transfer/burn from *any* account of this
/// mint, without that account's approval. This is real, standing power over
/// every holder's funds -- treat rotating/multisig-ing this key as a
/// priority before real value flows through a mint created with it.
pub const PERMANENT_DELEGATE: Pubkey = DEPLOYER_WALLET;

/// Authority that can later call `UpdateMint` to change confidential-transfer
/// settings on this mint -- including rotating the auditor ElGamal key
/// below. Keep this key able to rotate the auditor; that's the intended
/// escape hatch if the current (demo) auditor key ever needs replacing.
pub const CONFIDENTIAL_TRANSFER_AUTHORITY: Pubkey = DEPLOYER_WALLET;

/// Auditor public key for Confidential Transfer amount visibility.
///
/// ⚠️ This is a throwaway, randomly-generated demo key -- see
/// `DEVNET_DEMO_AUDITOR_KEY.md` at the crate root before creating any mint
/// with this customizer that you intend to keep. It is **not** derived from
/// `DEPLOYER_WALLET` (or anyone's wallet) the way every other ElGamal key in
/// this project is (per `PRODUCT.md` §4.2) -- replace it with a real,
/// wallet-derived key before this leaves "demo" status.
pub const AUDITOR_ELGAMAL_PUBKEY_B64: &str = "3r7q9NN0FJUN4qM41WNCdg4WGelodhhHsLfOtPB7hWk=";

/// Mint freeze authority enabling freezable tokens
pub const FREEZE_AUTHORITY: Pubkey = DEPLOYER_WALLET;

/// Mint pause authority enabling `pausable` tokens
pub const PAUSE_AUTHORITY: Pubkey = DEPLOYER_WALLET;

impl MintCustomizer for ComplianceMintCustomizer {
    fn get_token_2022_mint_space() -> Result<usize, ProgramError> {
        ExtensionType::try_calculate_account_len::<Mint>(&[
            ExtensionType::PermanentDelegate,
            ExtensionType::DefaultAccountState,
            ExtensionType::ConfidentialTransferMint,
            ExtensionType::Pausable,
        ])
    }

    fn initialize_extensions(
        wrapped_mint_account: &AccountInfo,
        wrapped_token_program_account: &AccountInfo,
    ) -> ProgramResult {
        // This delegate can burn or transfer tokens from any account for this mint,
        // even without an explicit approval
        invoke(
            &initialize_permanent_delegate(
                wrapped_token_program_account.key,
                wrapped_mint_account.key,
                &PERMANENT_DELEGATE,
            )?,
            &[wrapped_mint_account.clone()],
        )?;

        // Enables private transactions and specifies an auditor that can decrypt
        // transaction amounts for compliance
        let elgamal_pubkey = PodElGamalPubkey::from_str(AUDITOR_ELGAMAL_PUBKEY_B64)
            .map_err(|_| ProgramError::InvalidArgument)?;
        invoke(
            &initialize_confidential_transfer_mint(
                wrapped_token_program_account.key,
                wrapped_mint_account.key,
                Some(CONFIDENTIAL_TRANSFER_AUTHORITY), // Authority to manage settings
                true,
                // Enable compliance monitoring by allowing auditor to decrypt confidential
                // transfer amounts
                Some(elgamal_pubkey),
            )?,
            &[wrapped_mint_account.clone()],
        )?;

        // By default, new accounts are initialized. The freeze authority can freeze
        // them individually.
        invoke(
            &initialize_default_account_state(
                wrapped_token_program_account.key,
                wrapped_mint_account.key,
                &AccountState::Initialized,
            )?,
            &[wrapped_mint_account.clone()],
        )?;

        // The pause authority can pause transfers, burns, and mints
        invoke(
            &initialize_pausable(
                wrapped_token_program_account.key,
                wrapped_mint_account.key,
                &PAUSE_AUTHORITY,
            )?,
            &[wrapped_mint_account.clone()],
        )?;

        Ok(())
    }

    fn get_freeze_auth_and_decimals(
        unwrapped_mint_account: &AccountInfo,
    ) -> Result<(Option<Pubkey>, u8), ProgramError> {
        // Copy decimals from the original unwrapped mint.
        let unwrapped_mint_data = unwrapped_mint_account.try_borrow_data()?;
        let pod_mint = PodStateWithExtensions::<PodMint>::unpack(&unwrapped_mint_data)?.base;
        let decimals = pod_mint.decimals;

        // By setting a freeze authority, we enable "pausable" functionality. The freeze
        // authority can freeze all token accounts, effectively pausing transfers.
        Ok((Some(FREEZE_AUTHORITY), decimals))
    }
}
