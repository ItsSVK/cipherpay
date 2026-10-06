// The payroll operator: the admin authorizes the payroll helper key (see helper-signer.ts) ONCE, with `set_operator`, and from then on
// the helper signs every `pay_employee` itself, so a run needs no per-payment wallet prompt. The authorization expires, can be
// revoked, and lets the helper pay only (it cannot pause, resume or change anything else). Amounts are encrypted, so the program
// cannot cap what the operator pays; it CAN cap how many payments it makes. The limits are the expiry (at most 24 h on-chain), a
// payment count, revoking, and the key never leaving this browser.
import { address, type Address, type Instruction, type TransactionSigner } from "@solana/kit";
import { fetchMaybeOperatorConfig, findOperatorConfigPda, findVaultPda, getSetOperatorInstructionAsync } from "@/generated/vault/src/generated";
import { DEVNET_WUSDC_MINT } from "./constants";
import type { AppRpc } from "./rpc";

/** The choices offered for how long an authorization lasts (the program refuses more than 24 h; we stay well under it so a
 *  skewed local clock can't trip that). */
export const OPERATOR_TTL_OPTIONS = [
  { seconds: 15 * 60, label: "15 minutes" },
  { seconds: 60 * 60, label: "1 hour" },
  { seconds: 6 * 60 * 60, label: "6 hours" },
] as const;
export const DEFAULT_OPERATOR_TTL_SECONDS = 60 * 60;

/** What the admin chose for an authorization. */
export interface OperatorTerms {
  ttlSeconds: number;
  /** How many payments the operator may make before it needs authorizing again. */
  maxPayments: number;
}
/** Treat an authorization as gone this long before it expires, so a run never starts on one that lapses mid-payment. */
export const OPERATOR_MARGIN_SECONDS = 5 * 60;
const SYSTEM_PROGRAM_DEFAULT = address("11111111111111111111111111111111");

export interface OperatorStatus {
  /** The operator currently on chain (the default address when none was ever set or it was revoked). */
  operator: Address | null;
  /** Unix seconds; 0 when nothing is authorized. */
  expiresAt: bigint;
  /** Payments the operator may still make. */
  paymentsLeft: number;
  /** True when `helper` is the operator, has payments left and at least OPERATOR_MARGIN_SECONDS before it expires. */
  authorized: boolean;
}

/** `needPayments`: how many payments the caller is about to make; `authorized` is false if fewer are left. */
export async function readOperator(rpc: AppRpc, admin: Address, helper: Address, needPayments = 1, nowSeconds = BigInt(Math.floor(Date.now() / 1000))): Promise<OperatorStatus> {
  const [vault] = await findVaultPda({ admin, mint: address(DEVNET_WUSDC_MINT) });
  const [config] = await findOperatorConfigPda({ vault });
  const maybe = await fetchMaybeOperatorConfig(rpc, config, { commitment: "confirmed" });
  if (!maybe.exists || maybe.data.operator === SYSTEM_PROGRAM_DEFAULT) return { operator: null, expiresAt: 0n, paymentsLeft: 0, authorized: false };
  const { operator, expiresAt, paymentsLeft } = maybe.data;
  const live = expiresAt > nowSeconds + BigInt(OPERATOR_MARGIN_SECONDS);
  return { operator, expiresAt, paymentsLeft, authorized: operator === helper && live && paymentsLeft >= needPayments };
}

/** `set_operator` naming the helper, with the chosen expiry and payment count. The admin signs it. */
export async function buildAuthorizeInstruction(admin: TransactionSigner, helper: Address, terms: OperatorTerms, nowSeconds = Math.floor(Date.now() / 1000)): Promise<Instruction> {
  const [vault] = await findVaultPda({ admin: admin.address, mint: address(DEVNET_WUSDC_MINT) });
  return getSetOperatorInstructionAsync({ admin, vault, operator: helper, expiresAt: BigInt(nowSeconds + terms.ttlSeconds), maxPayments: terms.maxPayments });
}

/** `set_operator` with the default address: the program stores this as "nobody" and clears the expiry and count. */
export async function buildRevokeInstruction(admin: TransactionSigner): Promise<Instruction> {
  const [vault] = await findVaultPda({ admin: admin.address, mint: address(DEVNET_WUSDC_MINT) });
  return getSetOperatorInstructionAsync({ admin, vault, operator: SYSTEM_PROGRAM_DEFAULT, expiresAt: 0n, maxPayments: 0 });
}
