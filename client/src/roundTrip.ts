// End-to-end confidential PAYROLL round trip, run against a local surfpool
// Surfnet: the employer wraps a real (test) asset, funds the encrypted vault
// treasury, pays an employee with `pay_employee` (the amount stays hidden;
// the auditor decrypts it from the event), and the employee discloses part of
// it (`withdraw_confidential`) and unwraps it back into the real asset.
// Mirrors programs/vault/tests/full_payroll_round_trip.rs step for step, but
// through a real client hitting a real (local) validator instead of litesvm.
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
  ElGamalSecretKey,
  PubkeyValidityProofData,
} from "@solana/zk-sdk";
import BN from "bn.js";

import {
  COMPLIANCE_AUDITOR_ELGAMAL_PUBKEY_BYTES,
  DEMO_AUDITOR_ELGAMAL_SECRET_BYTES,
} from "./lib/constants.js";
import { escrowAddress, vaultPda } from "./lib/pdas.js";
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
  const admin = Keypair.generate(); // the employer
  const employee = Keypair.generate();
  await Promise.all([
    airdrop(connection, mintAuthority.publicKey, 10),
    airdrop(connection, admin.publicKey, 10),
    airdrop(connection, employee.publicKey, 10),
  ]);
  log("funded wallets", {
    mintAuthority: mintAuthority.publicKey.toBase58(),
    admin: admin.publicKey.toBase58(),
    employee: employee.publicKey.toBase58(),
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

  // 2. The employer acquires 1,000,000 units of the real asset.
  const adminUnwrappedAccount = getAssociatedTokenAddressSync(
    unwrappedMint.publicKey,
    admin.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  await sendTx(connection, admin, [
    createAssociatedTokenAccountIdempotentInstruction(
      admin.publicKey,
      adminUnwrappedAccount,
      admin.publicKey,
      unwrappedMint.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
  ]);
  await sendTx(connection, mintAuthority, [
    createMintToInstruction(
      unwrappedMint.publicKey,
      adminUnwrappedAccount,
      mintAuthority.publicKey,
      1_000_000,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  ]);
  log("funded the employer's real-asset account", {
    account: adminUnwrappedAccount.toBase58(),
    amount: 1_000_000,
  });

  // 3. Bootstrap the wrapped mint.
  const { wrappedMint, wrappedMintAuthority } = await createWrappedMint(
    connection,
    admin,
    unwrappedMint.publicKey,
    TOKEN_2022_PROGRAM_ID,
  );
  log("bootstrapped wrapped mint", {
    wrappedMint: wrappedMint.toBase58(),
    wrappedMintAuthority: wrappedMintAuthority.toBase58(),
  });

    const vault = loadVaultProgram(connection, admin);
  const [vaultAddress] = vaultPda(admin.publicKey, wrappedMint);
  const adminElgamal = new ElGamalKeypair();
  const adminAe = new AeKey();
  const employeeElgamal = new ElGamalKeypair();
  const employeeAe = new AeKey();

  // 4. initialize_vault, then configure_treasury_account (the treasury is a
  // vault-PDA-owned account that only the admin's keys can read).
  await sendTx(connection, admin, [
    await vault.methods
      .initializeVault()
      .accountsPartial({ admin: admin.publicKey, vault: vaultAddress, mint: wrappedMint })
      .instruction(),
  ]);
  const treasuryTokenAccount = getAssociatedTokenAddressSync(
    wrappedMint,
    vaultAddress,
    true,
    TOKEN_2022_PROGRAM_ID,
  );
  await sendTx(connection, admin, [
    encodeVerifyProofInstruction(
      ProofInstructionDiscriminant.VerifyPubkeyValidity,
      new PubkeyValidityProofData(adminElgamal),
    ),
    await vault.methods
      .configureTreasuryAccount(
        Array.from(adminElgamal.pubkey().toBytes()),
        Array.from(adminAe.encrypt(0n).toBytes()),
      )
      .accountsPartial({
        admin: admin.publicKey,
        vault: vaultAddress,
        mint: wrappedMint,
        treasuryTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .instruction(),
  ]);
  log("vault initialized, treasury configured", {
    vault: vaultAddress.toBase58(),
    treasury: treasuryTokenAccount.toBase58(),
  });

  // 5. Fund the treasury: wrap -> fund_treasury (public) ->
  // deposit_confidential (pending) -> apply_treasury_pending (available).
  const wrapAmount = 1_000_000n;
  const escrow = escrowAddress(unwrappedMint.publicKey, TOKEN_2022_PROGRAM_ID, TOKEN_2022_PROGRAM_ID);
  const adminWrappedAccount = getAssociatedTokenAddressSync(
    wrappedMint,
    admin.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  await sendTx(connection, admin, [
    await vault.methods
      .wrapConfidential(new BN(wrapAmount.toString()))
      .accounts({
        owner: admin.publicKey,
        unwrappedMint: unwrappedMint.publicKey,
        ownerUnwrappedTokenAccount: adminUnwrappedAccount,
        escrow,
        ownerWrappedTokenAccount: adminWrappedAccount,
        unwrappedTokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .instruction(),
  ]);
  await sendTx(connection, admin, [
    await vault.methods
      .fundTreasury(new BN(wrapAmount.toString()))
      .accountsPartial({
        funder: admin.publicKey,
        funderTokenAccount: adminWrappedAccount,
        vault: vaultAddress,
        mint: wrappedMint,
        treasuryTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .instruction(),
  ]);
  await sendTx(connection, admin, [
    await vault.methods
      .depositConfidential(new BN(wrapAmount.toString()))
      .accountsPartial({
        admin: admin.publicKey,
        vault: vaultAddress,
        mint: wrappedMint,
        treasuryTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .instruction(),
  ]);
  await sendTx(connection, admin, [
    await vault.methods
      .applyTreasuryPending(
        new BN(1),
        Array.from(adminAe.encrypt(wrapAmount).toBytes()),
      )
      .accountsPartial({
        admin: admin.publicKey,
        vault: vaultAddress,
        treasuryTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .instruction(),
  ]);
  log("treasury funded (encrypted)", { amount: wrapAmount.toString() });

  // 6. The employee activates their own wallet-owned confidential account.
  const employeeWrappedAccount = getAssociatedTokenAddressSync(
    wrappedMint,
    employee.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  await sendTx(connection, employee, [
    encodeVerifyProofInstruction(
      ProofInstructionDiscriminant.VerifyPubkeyValidity,
      new PubkeyValidityProofData(employeeElgamal),
    ),
    await vault.methods
      .createConfidentialAccount(
        Array.from(employeeElgamal.pubkey().toBytes()),
        Array.from(employeeAe.encrypt(0n).toBytes()),
      )
      .accounts({
        owner: employee.publicKey,
        mint: wrappedMint,
        tokenAccount: employeeWrappedAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .instruction(),
  ]);
  log("employee activated", { account: employeeWrappedAccount.toBase58() });

  // 7. pay_employee: the employer pays part of the treasury, amount hidden.
  const payAmount = 400_000n;
  const treasuryBefore = await fetchDecryptedBalances(connection, treasuryTokenAccount, adminAe);
  const auditorPubkey = ElGamalPubkey.fromBytes(COMPLIANCE_AUDITOR_ELGAMAL_PUBKEY_BYTES);
  const payProofs = transferSplitProofData(
    ElGamalCiphertext.fromBytes(treasuryBefore.availableCiphertext)!,
    treasuryBefore.available,
    payAmount,
    adminElgamal,
    employeeElgamal.pubkey(),
    auditorPubkey,
  );
  const equalityContext = await createProofContextAccount(
    connection,
    admin,
    ProofInstructionDiscriminant.VerifyCiphertextCommitmentEquality,
    payProofs.equalityProofData,
  );
  const ciphertextValidityContext = await createProofContextAccount(
    connection,
    admin,
    ProofInstructionDiscriminant.VerifyBatchedGroupedCiphertext3HandlesValidity,
    payProofs.ciphertextValidityProofData,
  );
  const rangeContext = await createProofContextAccount(
    connection,
    admin,
    ProofInstructionDiscriminant.VerifyBatchedRangeProofU128,
    payProofs.rangeProofData,
  );
  log("generated pay proofs and context-state accounts", {
    equalityContext: equalityContext.toBase58(),
    ciphertextValidityContext: ciphertextValidityContext.toBase58(),
    rangeContext: rangeContext.toBase58(),
  });

  const newTreasuryDecryptableBalance = adminAe
    .encrypt(payProofs.newSourceDecryptableAvailableBalance)
    .toBytes();
  const payEmployeeIx = await vault.methods
      .payEmployee(
        Array.from(newTreasuryDecryptableBalance),
        Array.from(payProofs.transferAmountAuditorCiphertextLo),
        Array.from(payProofs.transferAmountAuditorCiphertextHi),
      )
      .accountsPartial({
        admin: admin.publicKey,
        vault: vaultAddress,
        mint: wrappedMint,
        treasuryTokenAccount,
        employeeTokenAccount: employeeWrappedAccount,
        equalityProofContext: equalityContext,
        ciphertextValidityProofContext: ciphertextValidityContext,
        rangeProofContext: rangeContext,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .instruction();

  // REQ02/REQ11/REQ12 on a real validator: while paused, pay_employee must be
  // rejected with PayrollPaused (error 6003 = 0x1773); after resume it works.
  await sendTx(connection, admin, [
    await vault.methods
      .pausePayroll()
      .accountsPartial({ admin: admin.publicKey, vault: vaultAddress })
      .instruction(),
  ]);
  let rejectedWhilePaused = false;
  try {
    await sendTx(connection, admin, [payEmployeeIx]);
  } catch (err) {
    rejectedWhilePaused = /PayrollPaused|0x1773|6003/.test(String(err) + JSON.stringify((err as { logs?: string[] }).logs ?? []));
    if (!rejectedWhilePaused) throw err;
  }
  if (!rejectedWhilePaused) throw new Error("pay_employee succeeded while payroll was paused");
  log("pay_employee rejected while paused", { error: "PayrollPaused" });
  await sendTx(connection, admin, [
    await vault.methods
      .resumePayroll()
      .accountsPartial({ admin: admin.publicKey, vault: vaultAddress })
      .instruction(),
  ]);

  const paySignature = await sendTx(connection, admin, [payEmployeeIx]);
  log("paid the employee confidentially", { signature: paySignature });

  // 7b. The auditor reads the amount from the PayEmployeeEvent: decrypting
  // the two ciphertexts with the auditor's secret gives lo + hi * 2^16.
  const payTx = await connection.getTransaction(paySignature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  let auditorAmount: bigint | undefined;
  for (const line of payTx?.meta?.logMessages ?? []) {
    if (!line.startsWith("Program data: ")) continue;
    const event = vault.coder.events.decode(line.slice("Program data: ".length));
    if (event?.name.toLowerCase() !== "payemployeeevent") continue;
    const data = event.data as {
      auditorCiphertextLo: number[];
      auditorCiphertextHi: number[];
    };
    const secret = ElGamalSecretKey.fromBytes(DEMO_AUDITOR_ELGAMAL_SECRET_BYTES);
    const lo = secret.decrypt(ElGamalCiphertext.fromBytes(Uint8Array.from(data.auditorCiphertextLo))!);
    const hi = secret.decrypt(ElGamalCiphertext.fromBytes(Uint8Array.from(data.auditorCiphertextHi))!);
    auditorAmount = lo + (hi << 16n);
  }
  log("auditor decrypted the event", { amount: String(auditorAmount) });

  // 8. The employee applies their pending balance.
  await sendTx(connection, employee, [
    buildApplyPendingBalanceInstruction(
      TOKEN_2022_PROGRAM_ID,
      employeeWrappedAccount,
      1n,
      employeeAe.encrypt(payAmount).toBytes(),
      employee.publicKey,
    ),
  ]);
  log("employee applied their pending balance", { amount: payAmount.toString() });

  // 9. The employee discloses part of their pay: confidential -> public.
  const withdrawAmount = 250_000n;
  const employeeBalanceBefore = await fetchDecryptedBalances(connection, employeeWrappedAccount, employeeAe);
  const withdrawProofs = withdrawProofData(
    ElGamalCiphertext.fromBytes(employeeBalanceBefore.availableCiphertext)!,
    employeeBalanceBefore.available,
    withdrawAmount,
    employeeElgamal,
  );
  const withdrawEqualityContext = await createProofContextAccount(
    connection,
    employee,
    ProofInstructionDiscriminant.VerifyCiphertextCommitmentEquality,
    withdrawProofs.equalityProofData,
  );
  const withdrawRangeContext = await createProofContextAccount(
    connection,
    employee,
    ProofInstructionDiscriminant.VerifyBatchedRangeProofU64,
    withdrawProofs.rangeProofData,
  );
  const newDecryptableBalance = employeeAe
    .encrypt(withdrawProofs.newDecryptableAvailableBalance)
    .toBytes();
  await sendTx(connection, employee, [
    await vault.methods
      .withdrawConfidential(new BN(withdrawAmount.toString()), Array.from(newDecryptableBalance))
      .accounts({
        owner: employee.publicKey,
        mint: wrappedMint,
        tokenAccount: employeeWrappedAccount,
        equalityProofContext: withdrawEqualityContext,
        rangeProofContext: withdrawRangeContext,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .instruction(),
  ]);
  log("employee withdrew to public balance", { amount: withdrawAmount.toString() });

  // 10. The employee unwraps what they disclosed back into the real asset.
  const employeeUnwrappedAccount = getAssociatedTokenAddressSync(
    unwrappedMint.publicKey,
    employee.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  await sendTx(connection, employee, [
    await vault.methods
      .unwrapConfidential(new BN(withdrawAmount.toString()))
      .accounts({
        owner: employee.publicKey,
        unwrappedMint: unwrappedMint.publicKey,
        ownerUnwrappedTokenAccount: employeeUnwrappedAccount,
        escrow,
        ownerWrappedTokenAccount: employeeWrappedAccount,
        unwrappedTokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .instruction(),
  ]);
  log("unwrapped back into the real asset", { amount: withdrawAmount.toString() });

  // Final assertions, mirroring full_payroll_round_trip.rs.
  const employeeUnwrappedInfo = await connection.getAccountInfo(employeeUnwrappedAccount);
  const employeeUnwrappedAmount = employeeUnwrappedInfo!.data.readBigUInt64LE(64);
  const escrowInfo = await connection.getAccountInfo(escrow);
  const escrowAmount = escrowInfo!.data.readBigUInt64LE(64);
  const treasuryAfter = await fetchDecryptedBalances(connection, treasuryTokenAccount, adminAe);
  const employeeAfter = await fetchDecryptedBalances(connection, employeeWrappedAccount, employeeAe);

  log("FINAL STATE", {
    "employee's real-asset balance": `${employeeUnwrappedAmount} (expected ${withdrawAmount})`,
    "escrow balance": `${escrowAmount} (expected ${wrapAmount - withdrawAmount})`,
    "treasury confidential balance": `${treasuryAfter.available} (expected ${wrapAmount - payAmount})`,
    "employee confidential balance": `${employeeAfter.available} (expected ${payAmount - withdrawAmount})`,
    "auditor-decrypted payment": `${auditorAmount} (expected ${payAmount})`,
  });

  const ok =
    employeeUnwrappedAmount === withdrawAmount &&
    escrowAmount === wrapAmount - withdrawAmount &&
    treasuryAfter.available === wrapAmount - payAmount &&
    employeeAfter.available === payAmount - withdrawAmount &&
    auditorAmount === payAmount;

  console.log(ok ? "\n✅ payroll round trip succeeded end to end" : "\n❌ payroll round trip produced unexpected results");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("payroll round trip failed:", err);
  process.exit(1);
});
