import { AnchorProvider, Program, type Wallet } from "@coral-xyz/anchor";
import type { Connection, Keypair } from "@solana/web3.js";
import idl from "../idl/vault.json" with { type: "json" };
import type { Vault } from "../idl/vault.js";

/**
 * Loads `vault`'s Anchor client from the checked-in IDL
 * (`client/src/idl/vault.json`, copied from `target/idl/vault.json` --
 * re-copy it if the program's accounts/instructions change).
 */
export function loadVaultProgram(connection: Connection, payer: Keypair): Program<Vault> {
  const wallet: Wallet = {
    publicKey: payer.publicKey,
    signTransaction: async (tx) => {
      if ("partialSign" in tx) tx.partialSign(payer);
      return tx;
    },
    signAllTransactions: async (txs) => {
      for (const tx of txs) if ("partialSign" in tx) tx.partialSign(payer);
      return txs;
    },
  } as Wallet;

  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  return new Program<Vault>(idl as Vault, provider);
}
