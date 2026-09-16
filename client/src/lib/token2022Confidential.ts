// Hand-built Token-2022 confidential-transfer instructions the client calls
// directly (funding a P2P account's confidential balance needs no vault
// instruction -- no PDA authority is involved, same as the Rust test
// suite's tests/transfer_confidential.rs). `@solana/spl-token` (0.4.15, the
// version pinned in package.json) has no confidential-transfer extension
// support at all -- checked its `extensions/` directory directly, no
// `confidentialTransfer` folder exists. The modern `@solana-program/token-2022`
// package does, but it's built on `@solana/kit`, a different transaction
// style from the rest of this script (web3.js + Anchor) -- hand-building
// just these two instructions avoids pulling in a second, incompatible SDK
// for two small, well-understood wire formats. Discriminants and byte
// layouts below are confirmed directly against
// `spl_token_2022_interface::extension::confidential_transfer::instruction`
// (the same crate the Rust side of this project depends on), not guessed.
import { PublicKey, TransactionInstruction } from "@solana/web3.js";

const TOKEN_INSTRUCTION_CONFIDENTIAL_TRANSFER_EXTENSION = 27;

enum ConfidentialTransferInstruction {
  Deposit = 5,
  ApplyPendingBalance = 8,
}

function u64LeBytes(amount: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(amount);
  return buf;
}

/** `ConfidentialTransferInstruction::Deposit`: public balance -> pending. */
export function buildDepositInstruction(
  tokenProgram: PublicKey,
  tokenAccount: PublicKey,
  mint: PublicKey,
  amount: bigint,
  decimals: number,
  authority: PublicKey,
): TransactionInstruction {
  const data = Buffer.concat([
    Buffer.from([
      TOKEN_INSTRUCTION_CONFIDENTIAL_TRANSFER_EXTENSION,
      ConfidentialTransferInstruction.Deposit,
    ]),
    u64LeBytes(amount),
    Buffer.from([decimals]),
  ]);

  return new TransactionInstruction({
    programId: tokenProgram,
    keys: [
      { pubkey: tokenAccount, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data,
  });
}

/** `ConfidentialTransferInstruction::ApplyPendingBalance`: pending -> available. */
export function buildApplyPendingBalanceInstruction(
  tokenProgram: PublicKey,
  tokenAccount: PublicKey,
  expectedPendingBalanceCreditCounter: bigint,
  newDecryptableAvailableBalance: Uint8Array,
  authority: PublicKey,
): TransactionInstruction {
  if (newDecryptableAvailableBalance.length !== 36) {
    throw new Error("newDecryptableAvailableBalance must be 36 bytes");
  }

  const data = Buffer.concat([
    Buffer.from([
      TOKEN_INSTRUCTION_CONFIDENTIAL_TRANSFER_EXTENSION,
      ConfidentialTransferInstruction.ApplyPendingBalance,
    ]),
    u64LeBytes(expectedPendingBalanceCreditCounter),
    Buffer.from(newDecryptableAvailableBalance),
  ]);

  return new TransactionInstruction({
    programId: tokenProgram,
    keys: [
      { pubkey: tokenAccount, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data,
  });
}

/**
 * Reads the raw bytes of a Token-2022 account's `ConfidentialTransferAccount`
 * extension fields this script needs (`available_balance`, 64 bytes;
 * `decryptable_available_balance`, 36 bytes) directly out of the account's
 * TLV extension data, without depending on a JS TLV parser. The base
 * account is always 165 bytes (classic `Account::LEN`); extension TLV data
 * starts at byte 166 (byte 165 is the `AccountType` discriminant Token-2022
 * inserts before any extensions). Each TLV entry is
 * `[u16 LE type][u16 LE length][... data]`; `ConfidentialTransferAccount`'s
 * extension type is 3 (confirmed against
 * `spl_token_2022_interface::extension::ExtensionType`'s declaration order).
 */
export function readConfidentialTransferAccountExtension(data: Buffer): {
  availableBalance: Uint8Array;
  decryptableAvailableBalance: Uint8Array;
} {
  // ExtensionType::ConfidentialTransferAccount's discriminant (confirmed
  // against spl_token_2022_interface::extension::ExtensionType's
  // declaration order: Uninitialized=0, TransferFeeConfig=1,
  // TransferFeeAmount=2, MintCloseAuthority=3, ConfidentialTransferMint=4,
  // ConfidentialTransferAccount=5).
  const CONFIDENTIAL_TRANSFER_ACCOUNT_EXTENSION_TYPE = 5;
  const BASE_ACCOUNT_LEN = 165;
  let offset = BASE_ACCOUNT_LEN + 1; // +1 for the AccountType byte

  while (offset + 4 <= data.length) {
    const extensionType = data.readUInt16LE(offset);
    const length = data.readUInt16LE(offset + 2);
    const valueStart = offset + 4;

    if (extensionType === CONFIDENTIAL_TRANSFER_ACCOUNT_EXTENSION_TYPE) {
      // Layout: approved(1) + elgamal_pubkey(32) + pending_balance_lo(64) +
      // pending_balance_hi(64) + available_balance(64) +
      // decryptable_available_balance(36) + ...
      const value = data.subarray(valueStart, valueStart + length);
      const availableBalanceOffset = 1 + 32 + 64 + 64;
      const decryptableOffset = availableBalanceOffset + 64;
      return {
        availableBalance: value.subarray(
          availableBalanceOffset,
          availableBalanceOffset + 64,
        ),
        decryptableAvailableBalance: value.subarray(
          decryptableOffset,
          decryptableOffset + 36,
        ),
      };
    }

    offset = valueStart + length;
  }

  throw new Error(
    "ConfidentialTransferAccount extension not found on this token account",
  );
}
