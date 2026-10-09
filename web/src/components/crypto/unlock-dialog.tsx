"use client";

import { useState } from "react";
import { KeyIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyDerivation } from "./key-derivation";
import { useKeys } from "./key-context";
import { LockIcon } from "./lock-icon";
import { cn } from "@/lib/utils";

const DEMO_SECRET = "devnet-demo-auditor-secret (burned)";

export function UnlockDialog() {
  const { dialogOpen, setDialogOpen, status, stage, unlock, mode, real, error, elgamalPubkey } = useKeys();
  const [secret, setSecret] = useState("");
  const busy = status === "deriving";
  const ready = status === "ready";
  const importing = mode === "import";
  const canStart = status === "locked" && (!importing || secret.trim().length > 0);

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => !busy && setDialogOpen(open)}>
      <DialogContent className="bg-white text-foreground border border-border/80 shadow-2xl sm:max-w-[500px] w-full p-6 space-y-4 rounded-2xl overflow-hidden min-w-0">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            {/* Orbital Cryptographic Chamber */}
            <div className="relative grid size-12 shrink-0 place-items-center rounded-2xl border border-border/80 bg-gradient-to-b from-muted/40 to-muted/10 shadow-inner">
              {busy ? (
                <div
                  className="absolute -inset-1 rounded-full border-2 border-dashed border-primary/40 animate-[spin_8s_linear_infinite] pointer-events-none"
                  aria-hidden
                />
              ) : null}
              {ready ? (
                <div className="absolute inset-0 rounded-2xl bg-verified/10 animate-ping opacity-30 pointer-events-none" aria-hidden />
              ) : null}
              <LockIcon
                open={ready}
                className={cn(
                  "size-5.5 transition-colors duration-300",
                  ready ? "text-verified" : busy ? "text-primary" : "text-foreground"
                )}
              />
            </div>

            <div>
              <DialogTitle className="text-base font-semibold tracking-tight text-foreground">
                {importing ? "Import Mint Auditor Key" : "Authorize Encryption Keys"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {ready
                  ? "Keys verified & held in browser memory"
                  : busy
                  ? "Deriving zero-knowledge keypairs…"
                  : "Zero-cost signature • Discarded on disconnect"}
              </p>
            </div>
          </div>

          <DialogDescription className="text-xs leading-relaxed text-muted-foreground text-left">
            {importing
              ? "The auditor key is a standalone secret set on the mint for regulatory compliance. It cannot be derived from a personal wallet signature."
              : "Your wallet signs one fixed challenge message. Encryption keys are derived client-side from that signature and held in ephemeral memory for this session only."}
          </DialogDescription>
        </DialogHeader>

        {importing && status === "locked" ? (
          <div className="grid gap-2 rounded-xl border border-border/70 bg-muted/20 p-3.5 text-xs">
            <Label htmlFor="auditor-secret" className="text-xs font-medium">Auditor secret key</Label>
            <Input
              id="auditor-secret"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Paste the secret key"
              className="h-9 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setSecret(DEMO_SECRET)}
              className="w-fit text-[11px] text-primary underline-offset-4 hover:underline font-medium"
            >
              Fill devnet demo key
            </button>
          </div>
        ) : null}

        {/* Real-Time Live Crypting Engine & Pipeline with Single Status Card */}
        <KeyDerivation status={status} stage={stage} seed={elgamalPubkey ?? ""} mode={mode} error={error} />

        <div className="space-y-2 pt-1">
          <Button
            onClick={() => {
              unlock();
              setSecret("");
            }}
            disabled={!canStart}
            size="lg"
            className={cn(
              "h-11 w-full text-sm font-semibold gap-2 shadow-xs transition-all duration-300",
              ready
                ? "bg-verified text-white hover:bg-verified"
                : busy
                ? "bg-primary/90 text-primary-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {ready ? (
              <>
                <ShieldCheckIcon className="size-4" /> Keys Active in Session
              </>
            ) : busy ? (
              <>
                <span className="size-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {importing ? "Validating key…" : stage === 0 ? "Waiting for your wallet…" : "Deriving keys…"}
              </>
            ) : importing ? (
              <>
                <KeyIcon className="size-4" /> Import and verify key
              </>
            ) : error ? (
              "Try again"
            ) : (
              <>
                <KeyIcon className="size-4" /> Sign message and derive keys
              </>
            )}
          </Button>

          {real ? (
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              Your wallet will prompt for signature challenge <span className="font-mono text-foreground">solana-conf-bal/v1</span>.
            </p>
          ) : (
            <p className="text-center text-[11px] text-muted-foreground">
              Demo session: fast client-side derivation & mock zero-knowledge proofs.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
