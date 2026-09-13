use anchor_lang::prelude::*;

#[event]
pub struct InitializeEvent {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub mint: Pubkey,
}
