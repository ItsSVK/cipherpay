// Keep in sync with ../../../../programs/vault/src/constants.rs. Devnet only.
export const VAULT_PROGRAM_ADDRESS = "ELChxVFAiE5jv1SV3v3gprWeWxmbgX7ATWingW5VcB48";
export const TOKEN_WRAP_COMPLIANCE_PROGRAM_ADDRESS = "9tbZBdds8EuGX2Yb1yBYWtnA9UyhgxjfVCmgmfV5LPwV";
export const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const DEVNET_WUSDC_MINT = "3Qj6ZeyMdytvoTXdRTygJrWAWLaiNEpiYMEVLejY6oPf";
export const TOKEN_DECIMALS = 6;

export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

/** Wallet Standard chain id. Wallets must support it to appear in the connect list. Devnet only. */
export const SOLANA_CHAIN = "solana:devnet" as const;
