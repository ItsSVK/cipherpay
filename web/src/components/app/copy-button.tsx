"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          /* clipboard can be blocked; still show the confirmation state */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className={cn("relative grid size-6 place-items-center rounded-md text-muted-foreground transition-[color,background-color,transform] duration-200 ease-out-expo hover:bg-muted hover:text-foreground active:scale-90", className)}
    >
      <CopyIcon className={cn("absolute size-3.5 transition-[opacity,transform] duration-300 ease-out-expo", copied ? "scale-50 opacity-0" : "scale-100 opacity-100")} />
      <CheckIcon className={cn("absolute size-3.5 text-verified transition-[opacity,transform] duration-300 ease-out-expo", copied ? "scale-100 opacity-100" : "scale-50 opacity-0")} strokeWidth={2.5} />
    </button>
  );
}
