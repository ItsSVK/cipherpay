// The payroll operator: the admin authorizes the payroll helper key (see helper-signer.ts) ONCE, with `set_operator`, and from then on
// the helper signs every `pay_employee` itself, so a run needs no per-payment wallet prompt. The authorization expires, can be
// revoked, and lets the helper pay only (it cannot pause, resume or change anything else). Amounts are encrypted, so the program
// cannot cap what the operator pays: the limits are the expiry, revoking, and the key never leaving this browser.
import { address, type Address, type Instruction, type TransactionSigner } from "@solana/kit";
import { fetchMaybeOperatorConfig, findOperatorConfigPda, findVaultPda, getSetOperatorInstructionAsync } from "@/generated/vault/src/generated";
import { DEVNET_WUSDC_MINT } from "./constants";
import type { AppRpc } from "./rpc";

/** How long one authorization lasts. */
export const OPERATOR_TTL_SECONDS = 60 * 60;
/** Treat an authorization as gone this long before it expires, so a run never starts on one that lapses mid-payment. */
export const OPERATOR_MARGIN_SECONDS = 5 * 60;
const SYSTEM_PROGRAM_DEFAULT = address("11111111111111111111111111111111");

export interface OperatorStatus {
  /** The operator currently on chain (the default address when none was ever set or it was revoked). */
  operator: Address | null;
  /** Unix seconds; 0 means "no expiry". */
  expiresAt: bigint;
  /** True when `helper` is the operator and the authorization has at least OPERATOR_MARGIN_SECONDS left. */
  authorized: boolean;
}

export async function readOperator(rpc: AppRpc, admin: Address, helper: Address, nowSeconds = BigInt(Math.floor(Date.now() / 1000))): Promise<OperatorStatus> {
  const [vault] = await findVaultPda({ admin, mint: address(DEVNET_WUSDC_MINT) });
  const [config] = await findOperatorConfigPda({ vault });
  const maybe = await fetchMaybeOperatorConfig(rpc, config, { commitment: "confirmed" });
  if (!maybe.exists || maybe.data.operator === SYSTEM_PROGRAM_DEFAULT) return { operator: null, expiresAt: 0n, authorized: false };
  const { operator, expiresAt } = maybe.data;
  const live = expiresAt === 0n || expiresAt > nowSeconds + BigInt(OPERATOR_MARGIN_SECONDS);
  return { operator, expiresAt, authorized: operator === helper && live };
}

/** `set_operator` naming the helper, valid for OPERATOR_TTL_SECONDS. The admin signs it. */
export async function buildAuthorizeInstruction(admin: TransactionSigner, helper: Address, nowSeconds = Math.floor(Date.now() / 1000)): Promise<Instruction> {
  const [vault] = await findVaultPda({ admin: admin.address, mint: address(DEVNET_WUSDC_MINT) });
  return getSetOperatorInstructionAsync({ admin, vault, operator: helper, expiresAt: BigInt(nowSeconds + OPERATOR_TTL_SECONDS) });
}

/** `set_operator` with the default address and no expiry: the program stores this as "nobody". */
export async function buildRevokeInstruction(admin: TransactionSigner): Promise<Instruction> {
  const [vault] = await findVaultPda({ admin: admin.address, mint: address(DEVNET_WUSDC_MINT) });
  return getSetOperatorInstructionAsync({ admin, vault, operator: SYSTEM_PROGRAM_DEFAULT, expiresAt: 0n });
}
