"use client";

import { CheckIcon } from "lucide-react";
import { Fingerprint } from "./fingerprint";
import { HexTicker } from "./hex-ticker";
import { KEY_COPY, type KeyMode, type KeyStatus } from "./key-context";
import { cn } from "@/lib/utils";

/** The three-row derivation animation. Rows go idle -> running (hex churn) -> done (fingerprint). */
export function KeyDerivation({ status, stage, seed, mode = "signature" }: { status: KeyStatus; stage: number; seed: string; mode?: KeyMode }) {
  const { stages, descriptions } = KEY_COPY[mode];
  return (
    <ol className="grid gap-2" aria-label="Key derivation progress">
      {stages.map((label, i) => {
        const done = stage > i || status === "ready";
        const running = status === "deriving" && stage === i;
        return (
          <li
            key={label}
            data-state={done ? "done" : running ? "running" : "idle"}
            className={cn(
              "relative overflow-hidden rounded-lg border px-3 py-2.5 transition-[background-color,border-color] duration-300 ease-out-expo",
              done && "border-verified/30 bg-verified-soft",
              running && "border-primary/40 bg-accent",
              !done && !running && "bg-card",
            )}
          >
            <div className="flex items-center gap-3">
              <StageMark done={done} running={running} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-tight">{label}</p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{descriptions[i]}</p>
              </div>
              <div className="flex w-[84px] justify-end">
                {done && i > 0 ? <Fingerprint seed={`${seed}:${label}`} className="enter-fade" /> : null}
                {done && i === 0 ? <span className="enter-fade font-mono text-[11px] text-verified">signed</span> : null}
              </div>
            </div>
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out-expo",
                running ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <HexTicker active={running} length={40} className="block truncate" />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function StageMark({ done, running }: { done: boolean; running: boolean }) {
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full border text-[10px] transition-[background-color,border-color,color] duration-300 ease-out-expo",
        done ? "border-verified bg-verified text-white [animation:pop_420ms_var(--ease-out)]" : running ? "border-primary text-primary" : "border-input text-muted-foreground",
      )}
    >
      {done ? (
        <CheckIcon className="size-3.5" strokeWidth={3} />
      ) : running ? (
        <span className="size-2 rounded-full bg-primary [animation:dot-pulse_900ms_ease-in-out_infinite]" />
      ) : (
        <span className="size-1.5 rounded-full bg-input" />
      )}
    </span>
  );
}
