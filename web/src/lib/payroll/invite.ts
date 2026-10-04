/** The message an admin sends someone they just added, so the one-time account setup is not a surprise. */
export function inviteMessage(company: string, origin: string): string {
  return [
    `You've been added to ${company}'s payroll.`,
    `To get paid, open ${origin}/app, connect the wallet ${company} has on file for you, and set up your account. It takes about a minute and you only do it once: it works for every company that pays this wallet.`,
    `Keep a little devnet SOL in the wallet, since setup and withdrawals pay a small network fee.`,
  ].join("\n\n");
}

/** Copies the invite to the clipboard. Returns false if the browser blocked it. */
export async function copyInvite(company: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(inviteMessage(company, window.location.origin));
    return true;
  } catch {
    return false;
  }
}
