// Builds the transaction that pauses or resumes payroll: vault::pause_payroll / vault::resume_payroll, signed by the vault's admin.
// A paused vault rejects pay_employee (for the admin and for the operator alike); withdrawals stay open on purpose. Both instructions are
// idempotent on-chain, so sending the one that matches the current state is harmless.
import { address, type Instruction, type TransactionSigner } from "@solana/kit";
import { findVaultPda, getPausePayrollInstruction, getResumePayrollInstruction } from "@/generated/vault/src/generated";
import { DEVNET_WUSDC_MINT } from "./constants";

export async function buildPauseInstruction(input: { admin: TransactionSigner; paused: boolean }): Promise<Instruction> {
  const { admin, paused } = input;
  const [vault] = await findVaultPda({ admin: address(admin.address), mint: address(DEVNET_WUSDC_MINT) });
  return paused ? getPausePayrollInstruction({ admin, vault }) : getResumePayrollInstruction({ admin, vault });
}
