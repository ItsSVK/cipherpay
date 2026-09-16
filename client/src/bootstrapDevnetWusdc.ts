// One-time devnet bootstrap: creates the canonical wrapped-USDC (WUSDC)
// mint via token_wrap_compliance's CreateMint, targeting Circle's real
// devnet USDC mint as the unwrapped asset. This is NOT a per-user action --
// the wrapped-mint address is a PDA derived from (unwrappedMint,
// wrappedTokenProgram) alone, so running this more than once for the same
// pair is a no-op (CreateMint is called with `idempotent: true`). See
// CLAUDE.md's "A second workspace member: token_wrap_compliance" section.
//
// Run with `npm run bootstrap-wusdc` from `client/`, against devnet, once
// `vault` and `token_wrap_compliance` are deployed there (see CLAUDE.md).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getMint } from "@solana/spl-token";

import { createWrappedMint } from "./lib/tokenWrapCompliance.js";
import { escrowAddress, wrappedMintAuthorityPda, wrappedMintPda } from "./lib/pdas.js";

const DEVNET_RPC = "https://api.devnet.solana.com";

/** Circle's official devnet USDC mint (classic SPL Token program). */
const DEVNET_USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

function loadDefaultKeypair(): Keypair {
  const path = join(homedir(), ".config", "solana", "id.json");
  const secret = JSON.parse(readFileSync(path, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const payer = loadDefaultKeypair();

  const [expectedWrappedMint] = wrappedMintPda(DEVNET_USDC_MINT, TOKEN_2022_PROGRAM_ID);
  const [expectedAuthority] = wrappedMintAuthorityPda(expectedWrappedMint);
  const expectedEscrow = escrowAddress(DEVNET_USDC_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID);

  console.log("payer:", payer.publicKey.toBase58());
  console.log("unwrapped_mint (devnet USDC):", DEVNET_USDC_MINT.toBase58());
  console.log("expected wrapped_mint (WUSDC):", expectedWrappedMint.toBase58());
  console.log("expected wrapped_mint_authority:", expectedAuthority.toBase58());
  console.log("expected escrow ATA:", expectedEscrow.toBase58());

  const existing = await connection.getAccountInfo(expectedWrappedMint);
  if (existing) {
    console.log("\nWrapped mint already exists on devnet -- skipping CreateMint.");
  } else {
    console.log("\nBootstrapping wrapped mint via CreateMint...");
    const { wrappedMint, wrappedMintAuthority } = await createWrappedMint(
      connection,
      payer,
      DEVNET_USDC_MINT,
      TOKEN_2022_PROGRAM_ID,
    );
    console.log("wrapped_mint:", wrappedMint.toBase58());
    console.log("wrapped_mint_authority:", wrappedMintAuthority.toBase58());
  }

  const mintInfo = await getMint(
    connection,
    expectedWrappedMint,
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );
  console.log("\nOn-chain wrapped mint state:");
  console.log("  address:", expectedWrappedMint.toBase58());
  console.log("  mintAuthority:", mintInfo.mintAuthority?.toBase58());
  console.log("  decimals:", mintInfo.decimals);
  console.log("  supply:", mintInfo.supply.toString());
  console.log("  tlvDataLength:", mintInfo.tlvData.length, "bytes");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
