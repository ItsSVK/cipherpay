import "server-only";
import { isAddress } from "@solana/kit";
import { z } from "zod";
import { RECEIVED_AMOUNT_PATTERN } from "@/lib/received-amount";
import { SEALED_AMOUNT_PATTERN } from "@/lib/sealed-amount";

// Every route validates its input here. Nothing client-supplied is trusted, least of all "who am I": the employer is
// always taken from the session.

export const walletSchema = z.string().refine((v) => isAddress(v), "Not a valid Solana address");
/**
 * An amount the admin's browser encrypted (lib/crypto/record-seal.ts). The server can only check its shape; whether it is a
 * positive amount is checked in the browser before sealing, and the browser refuses to open one that was changed or moved.
 */
export const sealedAmountSchema = z.string().regex(SEALED_AMOUNT_PATTERN, "Not a sealed amount");
const signatureSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/, "Not a transaction signature");

export const nonceRequest = z.object({ address: walletSchema }).strict();
export const verifyRequest = z
  .object({
    address: walletSchema,
    nonce: z.string().min(8).max(64),
    /** Base64 of the 64-byte Ed25519 signature. */
    signature: z.string().min(80).max(100),
  })
  .strict();

export const addressInput = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(80),
    wallet: walletSchema,
  })
  .strict();

export const payrollInput = z
  .object({
    /** Chosen by the browser, because every sealed amount is bound to its payroll id before it is sent. */
    id: z.string().uuid(),
    name: z.string().trim().min(1, "Enter a name for this payroll").max(80),
    entries: z
      .array(z.object({ addressId: z.string().uuid(), amountCt: sealedAmountSchema }).strict())
      .min(1, "Add at least one address")
      .max(200)
      .refine((e) => new Set(e.map((x) => x.addressId)).size === e.length, "Each address can only appear once in a payroll"),
  })
  .strict();

export const runInput = z
  .object({
    /** Chosen by the browser, because the sealed total and items are bound to the run id before they are sent. */
    id: z.string().uuid(),
    payrollId: z.string().uuid().nullable().optional(),
    label: z.string().trim().min(1).max(120),
    /** Sealed sum of the confirmed items. The server can't add up sealed amounts, so the browser does. */
    totalCt: sealedAmountSchema,
    items: z
      .array(
        z
          .object({
            wallet: walletSchema,
            name: z.string().trim().min(1).max(80),
            amountCt: sealedAmountSchema,
            /** The amount encrypted to the recipient (lib/received-amount.ts). Shape only; the recipient's browser checks it against the chain. */
            receivedAmountCt: z.string().regex(RECEIVED_AMOUNT_PATTERN, "Not a received-amount ciphertext").nullable().optional(),
            signature: signatureSchema.nullable(),
            status: z.enum(["confirmed", "failed"]),
            error: z.string().max(500).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500)
      // Each item's sealed amount is bound to (run, wallet), so a wallet may appear only once per run.
      .refine((i) => new Set(i.map((x) => x.wallet)).size === i.length, "Each wallet can only appear once in a run"),
  })
  .strict();

/** Seals rows saved before amounts were encrypted. Each value replaces that row's plaintext, which is then cleared. */
export const sealInput = z
  .object({
    entries: z.array(z.object({ payrollId: z.string().uuid(), addressId: z.string().uuid(), amountCt: sealedAmountSchema }).strict()).max(2000),
    runs: z.array(z.object({ id: z.string().uuid(), totalCt: sealedAmountSchema }).strict()).max(500),
    items: z.array(z.object({ id: z.number().int().positive(), amountCt: sealedAmountSchema }).strict()).max(5000),
  })
  .strict();
