"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Fingerprint } from "./fingerprint";
import { useKeys } from "./key-context";
import { LockIcon } from "./lock-icon";

export function KeyChip({ seed }: { seed: string }) {
  const { status, ready, lock, setDialogOpen } = useKeys();
  const label = ready ? "Keys active" : status === "deriving" ? "Deriving…" : "Keys locked";
  return (
    <button
      type="button"
      onClick={() => {
        if (ready) {
          lock();
          toast("Keys cleared from memory", { description: "Encrypted values are hidden again." });
        } else {
          setDialogOpen(true);
        }
      }}
      aria-label={ready ? "Keys active. Clear keys from memory" : "Keys locked. Unlock keys"}
      title={ready ? "Clear keys from memory" : "Unlock keys with your wallet"}
      className={cn(
        "group inline-flex h-8 items-center gap-2 rounded-full border pl-2.5 pr-3 text-[13px] font-medium",
        "transition-[background-color,border-color,color,transform] duration-300 ease-out-expo active:scale-[0.97]",
        ready
          ? "border-verified/30 bg-verified-soft text-verified hover:border-verified/50"
          : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
        status === "locked" && "[animation:lock-pulse_2.6s_var(--ease-out)_infinite]",
      )}
    >
      <LockIcon open={ready} className="size-4" />
      <span>{label}</span>
      <span
        className={cn(
          "grid transition-[grid-template-columns,opacity] duration-300 ease-out-expo",
          ready ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0",
        )}
      >
        <span className="overflow-hidden">
          <Fingerprint seed={`${seed}:ElGamal key`} size={12} />
        </span>
      </span>
    </button>
  );
}
