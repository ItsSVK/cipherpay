export type StepId =
  | "encrypt"
  | "proofs"
  | "submit"
  | "settle"
  | "disclose"

export type StepStatus = "pending" | "active" | "done"

export interface StepDef {
  id: StepId
  title: string
  description: string
}

export const STEPS: StepDef[] = [
  {
    id: "encrypt",
    title: "Encrypt amount",
    description:
      "The amount is encrypted client-side with an ElGamal key derived from your wallet signature. Nothing plaintext ever leaves your device.",
  },
  {
    id: "proofs",
    title: "Generate ZK proofs",
    description:
      "Three zero-knowledge proofs are generated: the amount is well-formed, the sender's new balance is consistent, and both are non-negative — without revealing the amount.",
  },
  {
    id: "submit",
    title: "Submit confidential transfer",
    description:
      "The proofs and ciphertexts are submitted on-chain. Token-2022's confidential transfer extension verifies everything homomorphically — the ledger only ever stores ciphertext.",
  },
  {
    id: "settle",
    title: "Recipient balance updates",
    description:
      "The recipient's encrypted balance updates on-chain. Only they hold the key that can decrypt it — the amount stays hidden by default.",
  },
  {
    id: "disclose",
    title: "Disclosure (optional)",
    description:
      "Confidential transfer hides the transfer, not the balance forever. The recipient can choose to reveal a specific amount at a time of their choosing.",
  },
]

export interface Proof {
  id: "equality" | "validity" | "range"
  label: string
  detail: string
}

export const PROOFS: Proof[] = [
  {
    id: "equality",
    label: "Equality proof",
    detail: "new balance ciphertext = old balance − amount",
  },
  {
    id: "validity",
    label: "Ciphertext validity proof",
    detail: "amount ciphertext is well-formed for sender, recipient",
  },
  {
    id: "range",
    label: "Range proof",
    detail: "amount and resulting balance are non-negative u64s",
  },
]

export interface Party {
  name: string
  address: string
  avatarSeed: string
}

export const SENDER: Party = {
  name: "You",
  address: "8xJk...4mQp",
  avatarSeed: "sender-alice",
}

export const RECIPIENT: Party = {
  name: "Bob",
  address: "3vNr...9wLd",
  avatarSeed: "recipient-bob",
}

const CIPHER_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

export function randomCipherChar(): string {
  return CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)]
}

export function randomCiphertext(length = 44): string {
  return Array.from({ length }, randomCipherChar).join("")
}

export function truncateMiddle(value: string, keep = 10): string {
  if (value.length <= keep * 2) return value
  return `${value.slice(0, keep)}…${value.slice(-keep)}`
}

export function formatUsdc(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
