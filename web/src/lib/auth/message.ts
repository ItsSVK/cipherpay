// Shared by the browser (to show/sign) and the server (to rebuild and verify). Pure: no I/O.
// Sign-in with Solana style: the message names the site, the wallet and a single-use nonce, so a signature
// collected for one site (or one login) can't be replayed against another.

export const SIGN_IN_TTL_SECONDS = 5 * 60;

export interface SignInFields {
  /** The site the user is signing in to (the request host). */
  domain: string;
  address: string;
  nonce: string;
  /** Unix seconds. */
  issuedAt: number;
  expiresAt: number;
}

const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

export function buildSignInMessage(f: SignInFields): string {
  return [
    `${f.domain} wants you to sign in with your Solana account:`,
    f.address,
    "",
    "Sign in to read and edit your payroll list. This does not move any funds and costs nothing.",
    "",
    `Nonce: ${f.nonce}`,
    `Issued At: ${iso(f.issuedAt)}`,
    `Expiration Time: ${iso(f.expiresAt)}`,
  ].join("\n");
}
