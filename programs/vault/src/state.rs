use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub authority: Pubkey, // who can administer this vault (e.g. add employees, set auditor)
    pub mint: Pubkey,      // which Token-2022 confidential mint this vault operates on
    pub auditor_elgamal_pubkey: Option<[u8; 32]>, // optional compliance key
    pub bump: u8, // the PDA bump seed, stored so later instructions don't have to search for it
    pub paused: bool, // the pause flag we discussed earlier
}

#[account]
#[derive(InitSpace)]
pub struct UserAccount {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub token_account: Pubkey,
    pub elgamal_pubkey: Pubkey,
    pub bump: u8,
    pub active: bool,
}
