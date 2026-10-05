// Builds the company-setup transaction: initialize_vault (if the vault doesn't exist yet) then
// configure_treasury_account, which creates the vault-owned treasury token account, makes room for the
// confidential extension and registers the admin's ElGamal key on it.
import { address, type Instruction, type TransactionSigner } from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { findVaultPda, getConfigureTreasuryAccountInstruction, getInitializeVaultInstruction } from "@/generated/vault/src/generated";
import type { DerivedKeys } from "@/lib/crypto/keys";
import { DEVNET_WUSDC_MINT } from "./constants";
import { buildKeyRegistration } from "./key-registration";
import { ataFor } from "./read";
import type { AppRpc } from "./rpc";

const WUSDC = address(DEVNET_WUSDC_MINT);

/**
 * [initialize_vault?, VerifyPubkeyValidity, configure_treasury_account] as ONE transaction, so there is a single
 * wallet approval and no half-created company. `vaultExists` skips the first instruction, which repairs a vault
 * that was created but never configured. The proof must sit immediately before configure_treasury_account.
 */
export async function buildCompanySetupInstructions(input: { rpc: AppRpc; signer: TransactionSigner; keys: DerivedKeys; vaultExists: boolean }): Promise<Instruction[]> {
  const { rpc, signer, keys, vaultExists } = input;
  const [vault] = await findVaultPda({ admin: signer.address, mint: WUSDC });
  // The treasury is the vault PDA's own associated token account, so the program can sign payments out of it.
  const treasuryTokenAccount = await ataFor(vault, WUSDC, TOKEN_2022_PROGRAM_ADDRESS);
  const reg = await buildKeyRegistration({ rpc, signer, keys });

  const configure = getConfigureTreasuryAccountInstruction({
    admin: signer,
    vault,
    mint: WUSDC,
    treasuryTokenAccount,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    elgamalPubkey: reg.elgamalPubkey,
    decryptableZeroBalance: reg.decryptableZeroBalance,
  });
  const init = vaultExists ? [] : [getInitializeVaultInstruction({ admin: signer, vault, mint: WUSDC })];
  return [...init, ...reg.verify, configure];
}
