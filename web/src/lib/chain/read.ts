// Read-only chain state for the connected wallet. No keys are used here: decryption happens separately
// (lib/chain/decrypt.ts) and only while the user's keys are unlocked.
import { address, unwrapOption, type Address } from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS, fetchAllMaybeToken, fetchMaybeToken, findAssociatedTokenPda, type Token } from "@solana-program/token-2022";
import { fetchMaybeVault, findVaultPda } from "@/generated/vault/src/generated";
import { DEVNET_USDC_MINT, DEVNET_WUSDC_MINT } from "./constants";
import type { AppRpc } from "./rpc";

/** The classic SPL Token program, which owns real devnet USDC. */
const CLASSIC_TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const WUSDC = address(DEVNET_WUSDC_MINT);
const USDC = address(DEVNET_USDC_MINT);

export interface ConfidentialAccountView {
  /** The token account address (the wallet's WUSDC associated token account). */
  address: Address;
  /** The decoded Token-2022 account, kept so balances can be decrypted when keys are unlocked. */
  token: Token;
  /** Public (non-confidential) WUSDC balance sitting in the same account. */
  publicBalance: bigint;
  /** True when the confidential-transfer extension is configured: the account can receive confidential pay. */
  confidential: boolean;
  /** Whether the account is approved for confidential use. A mint that requires approval keeps this false until approved (decision D4). */
  approved: boolean;
  /** The ElGamal public key registered on the account. */
  elgamalPubkey: string | null;
}

export interface WalletChainState {
  owner: Address;
  /** Lamports. */
  sol: bigint;
  /** Plain USDC in the wallet's classic token account. */
  usdc: bigint;
  /** The WUSDC account, or null if the wallet has none yet. */
  wusdc: ConfidentialAccountView | null;
}

export interface VaultChainState {
  address: Address;
  /** False when this wallet has not created a vault. */
  exists: boolean;
  paused: boolean;
  treasuryConfigured: boolean;
  treasuryElgamalPubkey: string | null;
  /** The vault-owned treasury token account, once configured. */
  treasury: ConfidentialAccountView | null;
}

export async function ataFor(owner: Address, mint: Address, tokenProgram: Address): Promise<Address> {
  const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram });
  return ata;
}

function viewOf(addr: Address, token: Token): ConfidentialAccountView {
  const extensions = unwrapOption(token.extensions) ?? [];
  const ct = extensions.find((e) => e.__kind === "ConfidentialTransferAccount");
  return {
    address: addr,
    token,
    publicBalance: token.amount,
    confidential: !!ct,
    approved: ct?.__kind === "ConfidentialTransferAccount" ? ct.approved : false,
    elgamalPubkey: ct?.__kind === "ConfidentialTransferAccount" ? ct.elgamalPubkey : null,
  };
}

/** Fetches a token account that may not exist, or may not decode (something else lives at that address). */
async function readToken(rpc: AppRpc, addr: Address): Promise<Token | null> {
  try {
    const acct = await fetchMaybeToken(rpc, addr, { commitment: "confirmed" });
    return acct.exists ? acct.data : null;
  } catch {
    return null;
  }
}

export async function readWalletState(rpc: AppRpc, owner: Address): Promise<WalletChainState> {
  const [wusdcAta, usdcAta] = await Promise.all([ataFor(owner, WUSDC, TOKEN_2022_PROGRAM_ADDRESS), ataFor(owner, USDC, CLASSIC_TOKEN_PROGRAM)]);
  const [lamports, wusdc, usdc] = await Promise.all([rpc.getBalance(owner, { commitment: "confirmed" }).send(), readToken(rpc, wusdcAta), readToken(rpc, usdcAta)]);
  return { owner, sol: lamports.value, usdc: usdc?.amount ?? 0n, wusdc: wusdc ? viewOf(wusdcAta, wusdc) : null };
}

export async function readVaultState(rpc: AppRpc, admin: Address): Promise<VaultChainState> {
  const [vaultAddress] = await findVaultPda({ admin, mint: WUSDC });
  const maybe = await fetchMaybeVault(rpc, vaultAddress, { commitment: "confirmed" });
  if (!maybe.exists) return { address: vaultAddress, exists: false, paused: false, treasuryConfigured: false, treasuryElgamalPubkey: null, treasury: null };
  const v = maybe.data;
  const treasuryToken = v.treasuryConfigured ? await readToken(rpc, v.treasuryTokenAccount) : null;
  return {
    address: vaultAddress,
    exists: true,
    paused: v.paused,
    treasuryConfigured: v.treasuryConfigured,
    treasuryElgamalPubkey: v.treasuryConfigured ? v.treasuryElgamalPubkey : null,
    treasury: treasuryToken ? viewOf(v.treasuryTokenAccount, treasuryToken) : null,
  };
}

/** Which of these wallets can already receive confidential pay (account exists with the extension configured). One batched call. */
export async function readActivation(rpc: AppRpc, owners: Address[]): Promise<Record<string, boolean>> {
  if (owners.length === 0) return {};
  const atas = await Promise.all(owners.map((o) => ataFor(o, WUSDC, TOKEN_2022_PROGRAM_ADDRESS)));
  const accounts = await fetchAllMaybeToken(rpc, atas, { commitment: "confirmed" }).catch(() => null);
  return Object.fromEntries(owners.map((o, i) => [o, !!accounts?.[i]?.exists && viewOf(atas[i], accounts[i].data as Token).confidential]));
}
