"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, BuildingIcon, CheckIcon, CompassIcon, WalletIcon, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ProgressButton } from "@/components/app/progress-button";
import { Reveal } from "@/components/app/run-payroll-parts";
import { cn } from "@/lib/utils";

interface StartOption {
  id: string;
  href: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
  /** What the first visit asks of them, shown once the option is picked. */
  steps: string[];
  cta: string;
}

/** One row per kind of user. The auditor gets a row here once its view is designed. */
const OPTIONS: StartOption[] = [
  {
    id: "pay",
    href: "/pay",
    icon: WalletIcon,
    title: "Receive pay",
    blurb: "You're being paid by a company that uses Cipherpay.",
    steps: [
      "Activate a confidential account (one wallet approval, needs a little SOL)",
      "Payments arrive encrypted; only your key decrypts them",
      "Withdraw what you choose, when you choose",
    ],
    cta: "Continue to My pay",
  },
  {
    id: "company",
    href: "/admin",
    icon: BuildingIcon,
    title: "Send payouts",
    blurb: "You run payroll or pay contributors for a company.",
    steps: [
      "Create your payroll vault and treasury (one wallet approval)",
      "Fund the treasury with devnet USDC; funding is public",
      "Save addresses and run payroll; each payment is encrypted",
    ],
    cta: "Set up my company",
  },
];

/**
 * Asks a wallet with nothing set up on chain (no activated account, no company) where it wants to start. It comes
 * back on every page load and every new connection until one side exists on chain: closing it only hides it for
 * the current page (nothing is stored), and the shell keys it by address so a reconnect starts fresh.
 */
export function StartChooser({ eligible }: { eligible: boolean }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const open = eligible && !dismissed;

  const close = () => setDismissed(true);

  const picked = OPTIONS.find((o) => o.id === choice) ?? null;

  const go = () => {
    if (!picked) return;
    router.push(picked.href);
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        {/* Header */}
        <div className="border-b border-border/60 px-6 pt-6 pb-5">
          <div className="flex items-center gap-3 pr-8">
            <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary shadow-2xs">
              <CompassIcon className="size-4" />
            </div>
            <DialogTitle className="text-sm font-semibold tracking-tight">Where would you like to start?</DialogTitle>
          </div>
          <DialogDescription className="mt-3 text-xs leading-relaxed text-muted-foreground">
            This wallet has nothing set up yet. Pick what you came to do; the other side stays one click away in the sidebar.
          </DialogDescription>
        </div>

        {/* Body */}
        <div role="radiogroup" aria-label="Where to start" className="grid gap-2 px-6 py-5">
          {OPTIONS.map((o, i) => {
            const selected = o.id === choice;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setChoice(o.id)}
                style={{ "--i": i } as React.CSSProperties}
                className={cn(
                  "enter group grid gap-0 rounded-xl border p-3 text-left outline-none transition-[background-color,border-color,box-shadow] duration-200",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected ? "border-primary/30 bg-accent/60 shadow-xs" : "border-border/80 bg-card row-hover hover:border-border",
                )}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg transition-colors duration-200",
                      selected ? "bg-primary text-primary-foreground shadow-2xs" : "bg-muted text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    <o.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold tracking-tight text-foreground">{o.title}</span>
                    <span className="block text-[11px] leading-relaxed text-muted-foreground">{o.blurb}</span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-200",
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
                    )}
                  >
                    {selected ? <CheckIcon className="size-3 [animation:pop_260ms_var(--ease-out)]" strokeWidth={3} /> : null}
                  </span>
                </span>
                <Reveal open={selected}>
                  <ol className="mt-3 grid gap-1.5 border-t border-primary/15 pt-3 pl-11">
                    {o.steps.map((s, n) => (
                      <li key={s} className="flex gap-2 text-xs leading-relaxed text-accent-foreground">
                        <span className="font-mono text-[11px] tnum text-accent-foreground/70">{n + 1}</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                </Reveal>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="grid gap-3 border-t border-border/60 bg-muted/20 px-6 py-4">
          <ProgressButton
            progress={null}
            disabled={!picked}
            onClick={go}
            className="h-11 w-full text-sm"
            idleClassName="bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
          >
            {picked ? (
              <>
                {picked.cta} <ArrowRightIcon className="size-4" />
              </>
            ) : (
              "Choose one to continue"
            )}
          </ProgressButton>
          <p className="text-center text-[11px] text-muted-foreground">One wallet can do both: get paid and run a company.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
