// The payroll operator: the admin authorizes the payroll helper key (see helper-signer.ts) ONCE, with `set_operator`, and from then on
// the helper signs every `pay_employee` itself, so a run needs no per-payment wallet prompt. The authorization expires, can be
// revoked, and lets the helper pay only (it cannot pause, resume or change anything else). Amounts are encrypted, so the program
// cannot cap what the operator pays; it CAN cap how many payments it makes. The limits are the expiry (at most 24 h on-chain), a
// payment count, revoking, and the key never leaving this browser.
import { address, type Address } from "@solana/kit";
import { fetchMaybeOperatorConfig, findOperatorConfigPda, findVaultPda } from "@/generated/vault/src/generated";
import { NO_OPERATOR } from "./authorization";
import { DEVNET_WUSDC_MINT } from "./constants";
import type { AppRpc } from "./rpc";

/** The choices offered for how long an authorization lasts (the program refuses more than 24 h). */
export const OPERATOR_TTL_OPTIONS = [
  { seconds: 60, label: "1 minute" },
  { seconds: 5 * 60, label: "5 minutes" },
  { seconds: 15 * 60, label: "15 minutes" },
] as const;
export const DEFAULT_OPERATOR_TTL_SECONDS = 5 * 60;

/** What the admin chose for an authorization. */
export interface OperatorTerms {
  ttlSeconds: number;
  /** How many payments the operator may make before it needs authorizing again. */
  maxPayments: number;
}
/** Treat an authorization as gone this long before it expires, so a payment never starts on one that is about to lapse. */
export const OPERATOR_MARGIN_SECONDS = 10;


export interface OperatorStatus {
  /** The operator currently on chain (the default address when none was ever set or it was revoked). */
  operator: Address | null;
  /** Unix seconds; 0 when nothing is authorized. */
  expiresAt: bigint;
  /** Payments the operator may still make. */
  paymentsLeft: number;
  /** The config's replay counter. The next signed authorization must carry exactly this value. */
  seq: bigint;
  /** True when `helper` is the operator, has payments left and at least OPERATOR_MARGIN_SECONDS before it expires. */
  authorized: boolean;
}

/** `needPayments`: how many payments the caller is about to make; `authorized` is false if fewer are left. */
export async function readOperator(rpc: AppRpc, admin: Address, helper: Address, needPayments = 1, nowSeconds = BigInt(Math.floor(Date.now() / 1000))): Promise<OperatorStatus> {
  const [vault] = await findVaultPda({ admin, mint: address(DEVNET_WUSDC_MINT) });
  const [config] = await findOperatorConfigPda({ vault });
  const maybe = await fetchMaybeOperatorConfig(rpc, config, { commitment: "confirmed" });
  if (!maybe.exists || maybe.data.operator === NO_OPERATOR) return { operator: null, expiresAt: 0n, paymentsLeft: 0, seq: maybe.exists ? maybe.data.seq : 0n, authorized: false };
  const { operator, expiresAt, paymentsLeft, seq } = maybe.data;
  const live = expiresAt > nowSeconds + BigInt(OPERATOR_MARGIN_SECONDS);
  return { operator, expiresAt, paymentsLeft, seq, authorized: operator === helper && live && paymentsLeft >= needPayments };
}
