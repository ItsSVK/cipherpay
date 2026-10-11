import { OPERATOR_MARGIN_SECONDS, OPERATOR_TTL_OPTIONS } from "@/lib/chain/operator";

/**
 * Rough wall time for one payment on devnet (prove, 3 proof accounts, verify, pay, close). An ESTIMATE, not a measurement:
 * it is what the operator panel has always assumed. Raise it if real runs take longer.
 */
export const SECONDS_PER_PAYMENT = 30;

/** How the run will be signed, as the chain says right now. */
export type SigningState = { mode: "automatic"; secondsLeft: number; paymentsLeft: number } | { mode: "manual" };

export interface SigningCheck {
  id: "auto-count" | "auto-time" | "manual";
  label: string;
  ok: boolean;
  detail: string;
}

/** What the automatic payroll settings would need to be for this run, or null for the time when no offered window is long enough. */
export interface SigningSuggestion {
  ttlSeconds: number | null;
  maxPayments: number;
}

const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.max(0, secs) % 60).padStart(2, "0")}`;

/** Usable seconds a run of `recipients` needs. Compared with the operator's `secondsLeft`, which already excludes the expiry margin. */
export function runSeconds(recipients: number): number {
  return Math.max(1, recipients) * SECONDS_PER_PAYMENT;
}

/** How long an authorization must last to cover a run of `recipients`: the run plus the margin the engine keeps before expiry. */
export function secondsNeeded(recipients: number): number {
  return runSeconds(recipients) + OPERATOR_MARGIN_SECONDS;
}

/** The smallest settings that would cover this run. */
export function suggestSigning(recipients: number): SigningSuggestion {
  const need = secondsNeeded(recipients);
  return {
    ttlSeconds: OPERATOR_TTL_OPTIONS.find((o) => o.seconds >= need)?.seconds ?? null,
    maxPayments: Math.max(1, recipients),
  };
}

/**
 * Pre-flight checks for how the run will be signed. In automatic mode the program refuses `pay_employee` once the operator's
 * payment count or its time runs out, so a run that needs more than is left stops part way. These say so before anything is sent.
 * Manual mode always passes: the wallet approves each payment, so nothing can run out (each approval has its own ~40 s window).
 */
export function checkSigning(state: SigningState, recipients: number): SigningCheck[] {
  if (state.mode === "manual") {
    return [
      {
        id: "manual",
        label: "Your wallet will approve each payment",
        ok: true,
        detail: `${recipients} wallet approval${recipients === 1 ? "" : "s"}, each within about 40 s. Turn on automatic payroll to skip them.`,
      },
    ];
  }
  const need = runSeconds(recipients);
  const countOk = state.paymentsLeft >= recipients;
  const timeOk = state.secondsLeft >= need;
  const longest = OPERATOR_TTL_OPTIONS[OPERATOR_TTL_OPTIONS.length - 1];
  const fitsLongest = secondsNeeded(recipients) <= longest.seconds;
  return [
    {
      id: "auto-count",
      label: "Automatic payroll covers every payment",
      ok: countOk,
      detail: countOk
        ? `${state.paymentsLeft} payment${state.paymentsLeft === 1 ? "" : "s"} authorized, ${recipients} needed`
        : `Only ${state.paymentsLeft} payment${state.paymentsLeft === 1 ? "" : "s"} left, this run needs ${recipients}. It would stop after payment ${state.paymentsLeft}.`,
    },
    {
      id: "auto-time",
      label: "Automatic payroll lasts the whole run",
      ok: timeOk,
      detail: timeOk
        ? `${mmss(state.secondsLeft)} left, about ${mmss(need)} needed (est. ${SECONDS_PER_PAYMENT} s per payment)`
        : `${mmss(state.secondsLeft)} left, ${recipients} payment${recipients === 1 ? "" : "s"} need about ${mmss(need)} (est. ${SECONDS_PER_PAYMENT} s each). ${
            fitsLongest ? "It would expire part way." : `Even ${longest.label} is too short: run it with manual approvals or split the payroll.`
          }`,
    },
  ];
}
