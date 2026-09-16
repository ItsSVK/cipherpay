// End-to-end P2P confidential-transfer round trip, run against a local
// surfpool Surfnet: wrap a real (test) asset, move it into a confidential
// balance, send part of it to an independent recipient confidentially,
// withdraw part of what they received back to public, then unwrap it back
// into the real asset. Mirrors
// programs/vault/tests/full_p2p_round_trip.rs step for step, but through a
// real client hitting a real (local) validator instead of litesvm.
//
// Run with `npm run round-trip` from `client/`, against
// `surfpool start --no-deploy --no-tui` with both `vault` and
// `token_wrap_compliance` already deployed (see client/README.md).
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import {
  AeCiphertext,
  AeKey,
  ElGamalCiphertext,
  ElGamalKeypair,
  ElGamalPubkey,
  PubkeyValidityProofData,
} from "@solana/zk-sdk";
import BN from "bn.js";

import { COMPLIANCE_AUDITOR_ELGAMAL_PUBKEY_BYTES, TOKEN_WRAP_COMPLIANCE_PROGRAM_ID } from "./lib/constants.js";
import { escrowAddress } from "./lib/pdas.js";
import { createWrappedMint } from "./lib/tokenWrapCompliance.js";
import {
  ProofInstructionDiscriminant,
  createProofContextAccount,
  encodeVerifyProofInstruction,
} from "./lib/zkProof.js";
import {
  buildApplyPendingBalanceInstruction,
  buildDepositInstruction,
  readConfidentialTransferAccountExtension,
} from "./lib/token2022Confidential.js";
import { transferSplitProofData, withdrawProofData } from "./lib/confidentialTransferProofs.js";
import { loadVaultProgram } from "./lib/vaultProgram.js";

const RPC_URL = process.env.SURFPOOL_RPC_URL ?? "http://127.0.0.1:8899";

function log(step: string, details?: Record<string, unknown>) {
  console.log(`\n[${step}]`);
  if (details) {
    for (const [key, value] of Object.entries(details)) {
      console.log(`  ${key}: ${value}`);
    }
  }
}

async function airdrop(connection: Connection, pubkey: PublicKey, sol: number) {
  const sig = await connection.requestAirdrop(pubkey, sol * 1_000_000_000);
  await connection.confirmTransaction(sig, "confirmed");
}

async function sendTx(
  connection: Connection,
  payer: Keypair,
  instructions: Transaction["instructions"],
  extraSigners: Keypair[] = [],
): Promise<string> {
  const tx = new Transaction().add(...instructions);
  const sig = await connection.sendTransaction(tx, [payer, ...extraSigners]);
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

async function fetchDecryptedBalances(
  connection: Connection,
  tokenAccount: PublicKey,
  ae: AeKey,
): Promise<{ available: bigint; availableCiphertext: Uint8Array; decryptableBytes: Uint8Array }> {
  const info = await connection.getAccountInfo(tokenAccount);
  if (!info) throw new Error(`account ${tokenAccount.toBase58()} not found`);
  const { availableBalance, decryptableAvailableBalance } =
    readConfidentialTransferAccountExtension(info.data as Buffer);
  const ct = AeCiphertext.fromBytes(decryptableAvailableBalance)!;
  const available = ae.decrypt(ct);
  return { available, availableCiphertext: availableBalance, decryptableBytes: decryptableAvailableBalance };
}

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  console.log(`Connected to ${RPC_URL}`);

  const mintAuthority = Keypair.generate();
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  await Promise.all([
    airdrop(connection, mintAuthority.publicKey, 10),
    airdrop(connection, alice.publicKey, 10),
    airdrop(connection, bob.publicKey, 10),
  ]);
  log("funded wallets", {
    mintAuthority: mintAuthority.publicKey.toBase58(),
    alice: alice.publicKey.toBase58(),
    bob: bob.publicKey.toBase58(),
  });

  // 1. Create the plain "real asset" mint (stands in for USDC).
  const unwrappedMint = Keypair.generate();
  const mintLamports = await getMinimumBalanceForRentExemptMint(connection);
  await sendTx(
    connection,
    mintAuthority,
    [
      SystemProgram.createAccount({
        fromPubkey: mintAuthority.publicKey,
        newAccountPubkey: unwrappedMint.publicKey,
        lamports: mintLamports,
        space: 82,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(
        unwrappedMint.publicKey,
        6,
        mintAuthority.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID,
      ),
    ],
    [unwrappedMint],
  );
  log("created unwrapped (real-asset) mint", { mint: unwrappedMint.publicKey.toBase58() });

  // 2. Alice acquires 1,000,000 units of the real asset.
  const aliceUnwrappedAccount = getAssociatedTokenAddressSync(
    unwrappedMint.publicKey,
    alice.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  await sendTx(connection, alice, [
    createAssociatedTokenAccountIdempotentInstruction(
      alice.publicKey,
      aliceUnwrappedAccount,
      alice.publicKey,
      unwrappedMint.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
  ]);
  await sendTx(connection, mintAuthority, [
    createMintToInstruction(
      unwrappedMint.publicKey,
      aliceUnwrappedAccount,
      mintAuthority.publicKey,
      1_000_000,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  ]);
  log("funded Alice's real-asset account", {
    account: aliceUnwrappedAccount.toBase58(),
    amount: 1_000_000,
  });

  // 3. Bootstrap the wrapped mint.
  const { wrappedMint, wrappedMintAuthority } = await createWrappedMint(
    connection,
    alice,
    unwrappedMint.publicKey,
    TOKEN_2022_PROGRAM_ID,
  );
  log("bootstrapped wrapped mint", {
    wrappedMint: wrappedMint.toBase58(),
    wrappedMintAuthority: wrappedMintAuthority.toBase58(),
  });

  const vault = loadVaultProgram(connection, alice);

  // 4. Alice and Bob each set up a confidential account for the wrapped mint.
  const aliceElgamal = new ElGamalKeypair();
  const aliceAe = new AeKey();
  const bobElgamal = new ElGamalKeypair();
  const bobAe = new AeKey();

  async function createConfidentialAccount(
    owner: Keypair,
    elgamal: ElGamalKeypair,
    ae: AeKey,
  ): Promise<PublicKey> {
    const tokenAccount = getAssociatedTokenAddressSync(
      wrappedMint,
      owner.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
    const pubkeyValidityProof = new PubkeyValidityProofData(elgamal);
    const verifyProofIx = encodeVerifyProofInstruction(
      ProofInstructionDiscriminant.VerifyPubkeyValidity,
      pubkeyValidityProof,
    );
    const createAccountIx = await vault.methods
      .createConfidentialAccount(
        Array.from(elgamal.pubkey().toBytes()),
        Array.from(ae.encrypt(0n).toBytes()),
      )
      .accounts({
        owner: owner.publicKey,
        mint: wrappedMint,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .instruction();

    await sendTx(connection, owner, [verifyProofIx, createAccountIx]);
    return tokenAccount;
  }

  const aliceWrappedAccount = await createConfidentialAccount(alice, aliceElgamal, aliceAe);
  const bobWrappedAccount = await createConfidentialAccount(bob, bobElgamal, bobAe);
  log("set up confidential accounts", {
    alice: aliceWrappedAccount.toBase58(),
    bob: bobWrappedAccount.toBase58(),
  });

  // 5. Alice wraps her real asset into the wrapped mint's public balance.
  const wrapAmount = 1_000_000n;
  const escrow = escrowAddress(unwrappedMint.publicKey, TOKEN_2022_PROGRAM_ID, TOKEN_2022_PROGRAM_ID);
  const wrapIx = await vault.methods
    .wrapConfidential(new BN(wrapAmount.toString()))
    .accounts({
      owner: alice.publicKey,
      unwrappedMint: unwrappedMint.publicKey,
      ownerUnwrappedTokenAccount: aliceUnwrappedAccount,
      escrow,
      ownerWrappedTokenAccount: aliceWrappedAccount,
      unwrappedTokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
  await sendTx(connection, alice, [wrapIx]);
  log("wrapped real asset into wrapped mint", { amount: wrapAmount.toString() });

  // 6. Move the wrapped public balance into Alice's confidential available
  // balance: plain Deposit -> ApplyPendingBalance, no vault instruction.
  await sendTx(connection, alice, [
    buildDepositInstruction(
      TOKEN_2022_PROGRAM_ID,
      aliceWrappedAccount,
      wrappedMint,
      wrapAmount,
      6,
      alice.publicKey,
    ),
  ]);
  await sendTx(connection, alice, [
    buildApplyPendingBalanceInstruction(
      TOKEN_2022_PROGRAM_ID,
      aliceWrappedAccount,
      1n,
      aliceAe.encrypt(wrapAmount).toBytes(),
      alice.publicKey,
    ),
  ]);
  log("Alice deposited into her confidential available balance", {
    amount: wrapAmount.toString(),
  });

  // 7. Alice sends part of her confidential balance to Bob, confidentially.
  const transferAmount = 400_000n;
  const aliceBalanceBefore = await fetchDecryptedBalances(connection, aliceWrappedAccount, aliceAe);
  const auditorPubkey = ElGamalPubkey.fromBytes(COMPLIANCE_AUDITOR_ELGAMAL_PUBKEY_BYTES);
  const transferProofs = transferSplitProofData(
    ElGamalCiphertext.fromBytes(aliceBalanceBefore.availableCiphertext)!,
    aliceBalanceBefore.available,
    transferAmount,
    aliceElgamal,
    bobElgamal.pubkey(),
    auditorPubkey,
  );

  const equalityContext = await createProofContextAccount(
    connection,
    alice,
    ProofInstructionDiscriminant.VerifyCiphertextCommitmentEquality,
    transferProofs.equalityProofData,
  );
  const ciphertextValidityContext = await createProofContextAccount(
    connection,
    alice,
    ProofInstructionDiscriminant.VerifyBatchedGroupedCiphertext3HandlesValidity,
    transferProofs.ciphertextValidityProofData,
  );
  const rangeContext = await createProofContextAccount(
    connection,
    alice,
    ProofInstructionDiscriminant.VerifyBatchedRangeProofU128,
    transferProofs.rangeProofData,
  );
  log("generated transfer proofs and context-state accounts", {
    equalityContext: equalityContext.toBase58(),
    ciphertextValidityContext: ciphertextValidityContext.toBase58(),
    rangeContext: rangeContext.toBase58(),
  });

  const newSourceDecryptableBalance = aliceAe
    .encrypt(transferProofs.newSourceDecryptableAvailableBalance)
    .toBytes();

  const transferIx = await vault.methods
    .transferConfidential(
      Array.from(newSourceDecryptableBalance),
      Array.from(transferProofs.transferAmountAuditorCiphertextLo),
      Array.from(transferProofs.transferAmountAuditorCiphertextHi),
    )
    .accounts({
      sender: alice.publicKey,
      mint: wrappedMint,
      sourceTokenAccount: aliceWrappedAccount,
      destinationTokenAccount: bobWrappedAccount,
      equalityProofContext: equalityContext,
      ciphertextValidityProofContext: ciphertextValidityContext,
      rangeProofContext: rangeContext,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
  await sendTx(connection, alice, [transferIx]);
  log("transferred confidentially", { amount: transferAmount.toString() });

  // 8. Bob applies his pending balance.
  await sendTx(connection, bob, [
    buildApplyPendingBalanceInstruction(
      TOKEN_2022_PROGRAM_ID,
      bobWrappedAccount,
      1n,
      bobAe.encrypt(transferAmount).toBytes(),
      bob.publicKey,
    ),
  ]);
  log("Bob applied his pending balance", { amount: transferAmount.toString() });

  // 9. Bob withdraws part of his confidential balance back to public.
  const withdrawAmount = 250_000n;
  const bobBalanceBefore = await fetchDecryptedBalances(connection, bobWrappedAccount, bobAe);
  const withdrawProofs = withdrawProofData(
    ElGamalCiphertext.fromBytes(bobBalanceBefore.availableCiphertext)!,
    bobBalanceBefore.available,
    withdrawAmount,
    bobElgamal,
  );

  const withdrawEqualityContext = await createProofContextAccount(
    connection,
    bob,
    ProofInstructionDiscriminant.VerifyCiphertextCommitmentEquality,
    withdrawProofs.equalityProofData,
  );
  const withdrawRangeContext = await createProofContextAccount(
    connection,
    bob,
    ProofInstructionDiscriminant.VerifyBatchedRangeProofU64,
    withdrawProofs.rangeProofData,
  );
  log("generated withdraw proofs and context-state accounts", {
    equalityContext: withdrawEqualityContext.toBase58(),
    rangeContext: withdrawRangeContext.toBase58(),
  });

  const newDecryptableBalance = bobAe.encrypt(withdrawProofs.newDecryptableAvailableBalance).toBytes();
  const withdrawIx = await vault.methods
    .withdrawConfidential(
      new BN(withdrawAmount.toString()),
      Array.from(newDecryptableBalance),
    )
    .accounts({
      owner: bob.publicKey,
      mint: wrappedMint,
      tokenAccount: bobWrappedAccount,
      equalityProofContext: withdrawEqualityContext,
      rangeProofContext: withdrawRangeContext,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
  await sendTx(connection, bob, [withdrawIx]);
  log("withdrew to public balance", { amount: withdrawAmount.toString() });

  // 10. Bob unwraps his freshly-withdrawn public wrapped balance.
  const bobUnwrappedAccount = getAssociatedTokenAddressSync(
    unwrappedMint.publicKey,
    bob.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const unwrapIx = await vault.methods
    .unwrapConfidential(new BN(withdrawAmount.toString()))
    .accounts({
      owner: bob.publicKey,
      unwrappedMint: unwrappedMint.publicKey,
      ownerUnwrappedTokenAccount: bobUnwrappedAccount,
      escrow,
      ownerWrappedTokenAccount: bobWrappedAccount,
      unwrappedTokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
  await sendTx(connection, bob, [unwrapIx]);
  log("unwrapped back into the real asset", { amount: withdrawAmount.toString() });

  // Final assertions, mirroring full_p2p_round_trip.rs.
  const bobUnwrappedInfo = await connection.getAccountInfo(bobUnwrappedAccount);
  const bobUnwrappedAmount = bobUnwrappedInfo!.data.readBigUInt64LE(64);
  const escrowInfo = await connection.getAccountInfo(escrow);
  const escrowAmount = escrowInfo!.data.readBigUInt64LE(64);
  const aliceBalanceAfter = await fetchDecryptedBalances(connection, aliceWrappedAccount, aliceAe);
  const bobBalanceAfter = await fetchDecryptedBalances(connection, bobWrappedAccount, bobAe);

  log("FINAL STATE", {
    "Bob's real-asset balance": `${bobUnwrappedAmount} (expected ${withdrawAmount})`,
    "escrow balance": `${escrowAmount} (expected ${wrapAmount - withdrawAmount})`,
    "Alice's confidential balance": `${aliceBalanceAfter.available} (expected ${wrapAmount - transferAmount})`,
    "Bob's confidential balance": `${bobBalanceAfter.available} (expected ${transferAmount - withdrawAmount})`,
  });

  const ok =
    bobUnwrappedAmount === withdrawAmount &&
    escrowAmount === wrapAmount - withdrawAmount &&
    aliceBalanceAfter.available === wrapAmount - transferAmount &&
    bobBalanceAfter.available === transferAmount - withdrawAmount;

  console.log(ok ? "\n✅ round trip succeeded end to end" : "\n❌ round trip produced unexpected balances");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("round trip failed:", err);
  process.exit(1);
});
