"use client";

import { LockIcon } from "lucide-react";
import { useKeys } from "@/components/crypto/key-context";
import type { RecordsStatus } from "@/components/data/use-open-records";
import { cn } from "@/lib/utils";

/**
 * Stands in for a saved amount that is encrypted and not open. Locked: a button that asks for the keys. Opening: a quiet
 * placeholder. Open but still sealed: this wallet's keys can't decrypt it (changed, or saved under different keys).
 */
export function SealedAmount({ status, className }: { status: RecordsStatus; className?: string }) {
  const keys = useKeys();
  if (status === "locked") {
    return (
      <button
        type="button"
        onClick={() => keys.requireKeys()}
        className={cn("inline-flex items-center gap-1 rounded-md bg-cipher px-1.5 py-0.5 font-mono text-xs text-cipher-ink hover:opacity-80", className)}
        title="Encrypted with your keys. Unlock to read it."
        aria-label="Encrypted amount. Unlock keys to read it."
      >
        <LockIcon className="size-3" aria-hidden /> ••••••
      </button>
    );
  }
  if (status === "opening") return <span className={cn("font-mono text-xs text-muted-foreground", className)} aria-label="Decrypting">••••••</span>;
  return (
    <span className={cn("text-xs text-destructive", className)} title="This amount can't be decrypted with this wallet's keys, or it was changed after it was saved.">
      Unreadable
    </span>
  );
}
