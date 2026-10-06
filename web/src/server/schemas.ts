import "server-only";
import { isAddress } from "@solana/kit";
import { z } from "zod";

// Every route validates its input here. Nothing client-supplied is trusted, least of all "who am I": the employer is
// always taken from the session.

export const walletSchema = z.string().refine((v) => isAddress(v), "Not a valid Solana address");
/** Base units as a decimal string: positive, and fits in a u64 (token amounts are u64 on-chain). */
export const amountSchema = z
  .string()
  .regex(/^[1-9]\d{0,19}$/, "Enter a positive whole number of base units")
  .refine((v) => BigInt(v) < 2n ** 64n, "Amount is too large");
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

export const employeeInput = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(80),
    role: z.string().trim().max(60).default("Team member"),
    wallet: walletSchema,
    amount: amountSchema,
  })
  .strict();

export const runInput = z
  .object({
    label: z.string().trim().min(1).max(120),
    items: z
      .array(
        z
          .object({
            wallet: walletSchema,
            name: z.string().trim().min(1).max(80),
            amount: amountSchema,
            signature: signatureSchema.nullable(),
            status: z.enum(["confirmed", "failed"]),
            error: z.string().max(500).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();
