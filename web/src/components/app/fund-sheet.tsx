"use client";

import { useState } from "react";
import { CheckIcon, LockIcon, PlusIcon, WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useChain } from "@/components/chain/chain-state";
import { USDC_FAUCET_URL, useFundTreasury } from "@/components/chain/use-fund-treasury";
import { useKeys } from "@/components/crypto/key-context";
import { ProgressButton, type ButtonProgress } from "@/components/app/progress-button";
import { SolNotice } from "@/components/app/sol-notice";
import { formatUsdc, parseUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

const QUICK_AMOUNTS = ["10", "25", "50", "100"];

type Stage = "idle" | "preparing" | "wallet" | "confirming" | "done";

const STAGE: Record<Exclude<Stage, "idle">, { label: string; fill: number; hint: string }> = {
  preparing: { label: "Preparing…", fill: 15, hint: "Reading the treasury and working out its new encrypted balance, in this tab." },
  wallet: { label: "Approve in wallet", fill: 40, hint: "One approval covers the whole deposit. Check your wallet popup." },
  confirming: { label: "Confirming on devnet…", fill: 75, hint: "Wrapping your USDC, moving it in and encrypting it." },
  done: { label: "Deposited", fill: 100, hint: "Deposited. The treasury balance updates in a moment." },
};

const IDLE_HINT = "The deposit amount is public on-chain. Inside the treasury, the balance is encrypted.";

export function FundSheet({
  variant = "outline",
  size = "default",
  className,
}: {
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
} = {}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("25");
  const keys = useKeys();
  const chain = useChain();
  const live = useFundTreasury();
  const parsed = parseUsdc(amount);
  const usdc = chain.wallet?.usdc ?? 0n;
  const invalid = parsed === null || parsed <= 0n;
  const overBalance = !invalid && parsed > usdc;
  const maxAmount = formatUsdc(usdc).replace(/,/g, "");

  const stage: Stage =
    live.phase === "preparing"
      ? "preparing"
      : live.phase === "signing"
        ? "wallet"
        : live.phase === "confirming"
          ? "confirming"
          : live.phase === "done"
            ? "done"
            : "idle";
  const busy = stage !== "idle" && stage !== "done";
  const done = stage === "done";
  const locked = busy || done;
  const error = live.error;

  const progress: ButtonProgress | null = busy ? { label: STAGE[stage].label, fill: STAGE[stage].fill } : null;
  const hint = stage === "idle" ? IDLE_HINT : STAGE[stage].hint;

  const reset = () => live.reset();

  const amountNote = invalid ? (
    <span className="text-destructive">Enter an amount with up to 6 decimals.</span>
  ) : overBalance ? (
    <span className="text-destructive">More than the {formatUsdc(usdc)} USDC in your wallet.</span>
  ) : usdc === 0n ? (
    <a href={USDC_FAUCET_URL} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
      No devnet USDC yet. Get some from Circle&apos;s faucet
    </a>
  ) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setOpen(o);
        if (!o && stage !== "idle") reset();
      }}
    >
      <SheetTrigger render={<Button variant={variant} size={size} className={cn("gap-1.5 text-xs font-medium", className)} />}>
        <PlusIcon className="size-3.5" /> Fund Treasury
      </SheetTrigger>
      <SheetContent className="w-full overflow-x-hidden overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-serif font-normal tracking-[-0.015em] text-[1.375rem]">Fund treasury</SheetTitle>
          <SheetDescription>Move devnet USDC from your wallet into the encrypted payroll treasury.</SheetDescription>
        </SheetHeader>

        <div className="grid min-w-0 grid-cols-1 gap-4 px-4 pb-6">
          <SolNotice />

          {/* Amount */}
          <div
            className={cn(
              "rounded-2xl border bg-gradient-to-b from-muted/40 to-muted/10 p-4 transition-colors focus-within:border-primary/50",
              (invalid || overBalance) && "border-destructive/40 focus-within:border-destructive/60",
              locked && "opacity-70",
            )}
          >
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor="fund-amount" className="font-semibold uppercase tracking-wider text-muted-foreground/80">
                Amount
              </label>
              <span className="text-muted-foreground">
                Wallet <span className="font-mono tnum font-medium text-foreground">{formatUsdc(usdc)}</span> USDC
              </span>
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <input
                id="fund-amount"
                // size=1 drops the input's intrinsic ~20-character width, which otherwise stretches the sheet sideways
                size={1}
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={locked}
                aria-invalid={invalid || overBalance}
                placeholder="0.00"
                className="w-full min-w-0 flex-1 bg-transparent font-mono text-4xl font-semibold tracking-tight text-foreground tnum outline-none placeholder:text-muted-foreground/40 disabled:cursor-not-allowed"
              />
              <span className="text-sm font-semibold text-muted-foreground">USDC</span>
            </div>

            <div className="mt-3 flex gap-1.5" role="group" aria-label="Quick amounts">
              {[...QUICK_AMOUNTS, ...(usdc > 0n ? ["max"] : [])].map((q) => {
                const value = q === "max" ? maxAmount : q;
                const selected = amount === value;
                return (
                  <button
                    key={q}
                    type="button"
                    disabled={locked}
                    onClick={() => setAmount(value)}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium tnum transition-colors duration-150 disabled:pointer-events-none",
                      selected ? "border-primary/50 bg-primary/10 text-primary" : "border-border/70 bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                    )}
                  >
                    {q === "max" ? "Max" : q}
                  </button>
                );
              })}
            </div>

            {/* Fixed-height note so a validation message never shifts the layout */}
            <p className="mt-2 h-4 truncate text-xs">{amountNote}</p>
          </div>

          {/* Where the money goes */}
          <div className="rounded-2xl border border-border/80 p-4">
            <div className="flex items-center gap-3">
              <FlowNode icon={<WalletIcon className="size-4" />} title="Your wallet" tag="Public" tone="pending" />
              <FlowTrack active={busy} done={done} />
              <FlowNode
                icon={done ? <CheckIcon className="size-4 [animation:pop_var(--dur-base)_var(--ease-out)]" strokeWidth={3} /> : <LockIcon className="size-4" />}
                title="Treasury"
                tag="Encrypted"
                tone="verified"
                glow={done}
              />
            </div>
            <p className="mt-3 min-h-8 text-xs leading-relaxed text-muted-foreground" role="status" aria-live="polite">
              {hint}
            </p>
          </div>

          {error ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-failed-soft p-3 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          {!live.canSign ? <p className="text-xs text-muted-foreground">{live.cannotSignReason}</p> : null}

          {done ? (
            <ProgressButton
              progress={null}
              className="h-11 w-full text-sm"
              idleClassName="border border-verified/30 bg-verified-soft text-verified hover:bg-verified/15"
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              <CheckIcon className="size-4" strokeWidth={3} /> Done
            </ProgressButton>
          ) : (
            <ProgressButton
              progress={progress}
              disabled={invalid || overBalance || !live.canSign}
              onClick={() => {
                if (!keys.requireKeys()) return;
                if (parsed === null) return;
                void live.run(parsed);
              }}
              className="h-11 w-full text-sm"
              idleClassName="bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
            >
              {!keys.ready
                ? "Unlock keys to continue"
                : error
                  ? "Retry deposit"
                  : `Deposit ${invalid ? "" : `${formatUsdc(parsed)} `}USDC`}
            </ProgressButton>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FlowNode({
  icon,
  title,
  tag,
  tone,
  glow,
}: {
  icon: React.ReactNode;
  title: string;
  tag: string;
  tone: "pending" | "verified";
  glow?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5 text-center">
      <span
        className={cn(
          "grid size-10 place-items-center rounded-xl ring-1 transition-shadow duration-500",
          tone === "pending" ? "bg-pending-soft text-pending ring-pending/25" : "bg-verified-soft text-verified ring-verified/25",
          glow && "shadow-[0_0_0_6px_color-mix(in_oklch,var(--verified)_15%,transparent)]",
        )}
      >
        {icon}
      </span>
      <span className="text-xs font-medium text-foreground">{title}</span>
      <span className={cn("text-[10px] font-semibold uppercase tracking-wider", tone === "pending" ? "text-pending" : "text-verified")}>{tag}</span>
    </div>
  );
}

/** Dashed line between the two nodes; while working, packets travel along it; once done it turns solid green. */
function FlowTrack({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div className="relative mt-3 h-4 flex-1 self-start" aria-hidden>
      <div
        className={cn(
          "absolute inset-x-0 top-1/2 h-px -translate-y-1/2 transition-colors duration-500",
          done ? "bg-verified" : "bg-[repeating-linear-gradient(90deg,var(--border)_0_6px,transparent_6px_12px)]",
          active && "bg-[repeating-linear-gradient(90deg,color-mix(in_oklch,var(--primary)_45%,transparent)_0_6px,transparent_6px_12px)] [animation:tape-feed_0.8s_linear_infinite]",
        )}
      />
      {active
        ? [0, 1, 2].map((i) => (
            <span
              key={i}
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)] [animation:flow-packet_1.8s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.6}s` }}
            />
          ))
        : null}
    </div>
  );
}
