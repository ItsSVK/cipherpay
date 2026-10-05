"use client";

import { useState } from "react";
import { ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyDerivation } from "./key-derivation";
import { useKeys } from "./key-context";
import { LockIcon } from "./lock-icon";

const DEMO_SECRET = "devnet-demo-auditor-secret (burned)";

export function UnlockDialog({ seed }: { seed: string }) {
  const { dialogOpen, setDialogOpen, status, stage, unlock, mode, real, error, elgamalPubkey } = useKeys();
  const [secret, setSecret] = useState("");
  const busy = status === "deriving";
  const importing = mode === "import";
  const canStart = status === "locked" && (!importing || secret.trim().length > 0);

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => !busy && setDialogOpen(open)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
            <LockIcon open={status === "ready"} className="size-5" />
          </div>
          <DialogTitle className="text-base">{importing ? "Import the auditor key" : "Unlock your keys"}</DialogTitle>
          <DialogDescription>
            {importing
              ? "The auditor key is a standalone secret set on the mint. It cannot be derived from your wallet, so paste it here. It stays in memory for this session only and is cleared when you disconnect."
              : "Your wallet signs one fixed message, which costs nothing and sends nothing. Your encryption keys are derived from that signature, held in memory for this session only, and cleared when you disconnect. They never leave this browser."}
          </DialogDescription>
        </DialogHeader>
        {importing && status === "locked" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="auditor-secret">Auditor secret key</Label>
            <Input id="auditor-secret" type="password" autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Paste the secret key" className="h-10 font-mono" />
            <button type="button" onClick={() => setSecret(DEMO_SECRET)} className="w-fit text-[13px] text-primary underline-offset-4 hover:underline">
              Use the devnet demo key
            </button>
          </div>
        ) : null}
        <KeyDerivation status={status} stage={stage} seed={elgamalPubkey ?? seed} mode={mode} />
        {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-failed-soft px-3 py-2 text-[13px] text-destructive">{error}</p> : null}
        <Button
          onClick={() => {
            unlock();
            setSecret("");
          }}
          disabled={!canStart}
          size="lg"
          className="h-10 w-full text-sm"
        >
          {status === "ready" ? (
            <>
              <ShieldCheckIcon /> Keys active
            </>
          ) : busy ? (
            importing ? "Checking key…" : "Deriving keys…"
          ) : importing ? (
            "Import key"
          ) : (
            error ? "Try again" : "Sign message and derive keys"
          )}
        </Button>
        {real ? (
          <p className="text-center text-xs leading-relaxed text-muted-foreground">Your wallet may show the message as unreadable text starting with <span className="font-mono">solana-conf-bal/v1</span>. That is expected.</p>
        ) : (
          <p className="text-center text-xs text-muted-foreground">Demo wallet: no real {importing ? "key check" : "signature"} happens.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
