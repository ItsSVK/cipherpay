// CLIENT-ONLY. Decrypts a confidential token account's balances with the user's unlocked keys. Runs in the proof worker so the ~370 ms of
// WASM work doesn't freeze the page (lib/crypto/proof-client.ts); the decryption itself is decrypt-local.ts.
import type { DerivedKeys } from "@/lib/crypto/keys";
import { decryptOffThread } from "@/lib/crypto/proof-client";
import type { DecryptedBalance } from "./decrypt-local";
import type { ConfidentialAccountView } from "./read";

export { WrongKeyError, type DecryptedBalance } from "./decrypt-local";

export function decryptAccountBalance(view: ConfidentialAccountView, keys: DerivedKeys): Promise<DecryptedBalance> {
  return decryptOffThread(view, keys);
}
