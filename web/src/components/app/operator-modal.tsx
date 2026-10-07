"use client";

import React from "react";
import { ZapIcon, ClockIcon, ShieldCheckIcon, AlertCircleIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/app/segmented";
import { WalletCountdown } from "@/components/app/wallet-countdown";
import { StatusBadge } from "@/components/app/status-badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { OPERATOR_TTL_OPTIONS } from "@/lib/chain/operator";
import { useOperator, sol, mmss } from "@/components/app/operator-context";
import { cn } from "@/lib/utils";

export function OperatorModal() {
  const {
    modalOpen,
    setModalOpen,
    settings,
    setSettings,
    status,
    balance,
    secondsLeft,
    live,
    busy,
    wallet,
    onSwitch,
    reclaim,
    ready,
  } = useOperator();

  const editable = !live && !busy;
  const shown = ready ? status : null;

  return (
    <Dialog open={modalOpen} onOpenChange={setModalOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className={cn("grid size-8 place-items-center rounded-lg transition-colors", live ? "bg-verified-soft text-verified" : "bg-primary/10 text-primary")}>
              <ZapIcon className={cn("size-4", live && "fill-verified")} />
            </div>
            <DialogTitle className="text-base font-semibold">Automatic Payroll Helper</DialogTitle>
          </div>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            Approve once up front to allow your ephemeral local helper key to sign and submit batch transfer transactions automatically without individual wallet prompts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="flex items-center justify-between rounded-xl border bg-muted/20 p-3.5">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-foreground">Helper Status</p>
                <StatusBadge tone={live ? "verified" : "neutral"} pulse={live}>
                  {live ? "Active" : busy === "authorizing" ? "Authorizing…" : "Disabled"}
                </StatusBadge>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {live
                  ? "Helper is currently authorized to sign transfers."
                  : busy === "authorizing"
                    ? "Awaiting wallet signature to activate…"
                    : "Turn on to execute transfers without popups."}
              </p>
            </div>
            <Switch
              checked={live || busy === "authorizing"}
              onCheckedChange={onSwitch}
              disabled={!ready || !!busy}
              aria-label="Toggle automatic helper"
            />
          </div>

          <div className="grid gap-3.5 rounded-xl border bg-card/60 p-3.5 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-foreground">Authorization Duration</span>
                <InfoTooltip content="Duration the helper remains valid on-chain before expiring automatically." />
              </div>
              <Segmented
                label="Helper active duration"
                value={String(settings.ttlSeconds)}
                onChange={(v) => editable && setSettings({ ...settings, ttlSeconds: Number(v) })}
                options={OPERATOR_TTL_OPTIONS.map((o) => ({ value: String(o.seconds), label: o.label }))}
                className={cn(!editable && "pointer-events-none opacity-60")}
              />
            </div>

            <div className="border-t border-border/60 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Maximum Payment Cap</p>
                  <p className="text-[11px] text-muted-foreground">Limit total payments signed by this session.</p>
                </div>
                <input
                  id="max-payments-modal"
                  type="number"
                  min={1}
                  max={500}
                  value={live && shown ? shown.paymentsLeft : (settings.maxPayments ?? 10)}
                  disabled={!editable}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxPayments: Math.max(1, Math.min(500, Math.floor(Number(e.target.value) || 10))),
                    })
                  }
                  className="h-8 w-20 rounded-lg border bg-background px-2.5 text-right font-mono text-xs tnum disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          {live && shown ? (
            <div className="rounded-xl border border-verified/30 bg-verified-soft/40 p-3.5 text-xs" role="status">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <ClockIcon className="size-3.5 text-verified" />
                  Time Remaining:
                </span>
                <span className={cn("font-mono font-bold text-sm tnum", secondsLeft <= 15 ? "text-destructive" : "text-verified")}>
                  {mmss(secondsLeft)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {shown.paymentsLeft} payments remaining. Helper holds {balance === null ? "…" : `${sol(balance)} SOL`} for rent.
              </p>
            </div>
          ) : !live && balance !== null && balance > 10_000n ? (
            <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-3 text-xs">
              <p className="text-[11.5px] text-muted-foreground">Helper retains {sol(balance)} SOL from prior run.</p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={reclaim} disabled={!!busy}>
                Reclaim SOL
              </Button>
            </div>
          ) : null}

          {wallet ? (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5 text-xs">
              {wallet.deadline ? (
                <WalletCountdown deadline={wallet.deadline} note={wallet.note} />
              ) : (
                <p className="text-primary font-medium">{wallet.note}</p>
              )}
            </div>
          ) : null}

          {!ready ? (
            <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
              <AlertCircleIcon className="size-4 shrink-0 text-muted-foreground" />
              <span>Unlock your keys to authorize the automatic helper.</span>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
