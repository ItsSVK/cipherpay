"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Shown while the wallet is waiting for an approval. Devnet only keeps a transaction valid for about 40 seconds, so the user
 * should see the clock instead of finding out afterwards.
 */
export function WalletCountdown({ note, deadline }: { note?: string; deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <p className="enter-fade flex flex-wrap items-center gap-x-2 text-xs font-medium text-primary" role="status">
      <span>{note ?? "Approve in your wallet."}</span>
      <span className={cn("font-mono tnum", left <= 10 ? "text-pending" : "text-muted-foreground")}>{left > 0 ? `Expires in ${left}s` : "Expired, asking again…"}</span>
    </p>
  );
}
