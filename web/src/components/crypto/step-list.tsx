"use client";

import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/app/status-badge";
import { HexTicker } from "./hex-ticker";
import { StageMark } from "./key-derivation";

export interface Step {
  label: string;
  detail: string;
  /** Whether the amount is visible on-chain at this step. Shown honestly on every flow. */
  visibility?: "public" | "encrypted";
}

/** Vertical list of steps. `completed` steps check off; the step at `completed` pulses and churns hex while `running`. */
export function StepList({ steps, completed, running, className }: { steps: Step[]; completed: number; running: boolean; className?: string }) {
  return (
    <ol className={cn("grid gap-2", className)}>
      {steps.map((s, i) => {
        const done = i < completed;
        const active = running && i === completed;
        return (
          <li
            key={s.label}
            data-state={done ? "done" : active ? "running" : "idle"}
            className={cn(
              "rounded-lg border px-3 py-2.5 transition-[background-color,border-color] duration-300 ease-out-expo",
              done && "border-verified/30 bg-verified-soft",
              active && "border-primary/40 bg-accent",
            )}
          >
            <div className="flex items-center gap-3">
              <StageMark done={done} running={active} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-tight">{s.label}</p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{s.detail}</p>
              </div>
              {s.visibility ? (
                <StatusBadge tone={s.visibility === "public" ? "pending" : "verified"} className="shrink-0">
                  {s.visibility === "public" ? "Public" : "Encrypted"}
                </StatusBadge>
              ) : null}
            </div>
            <div className={cn("grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out-expo", active ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0")}>
              <div className="overflow-hidden">
                <HexTicker active={active} length={40} className="block truncate" />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
