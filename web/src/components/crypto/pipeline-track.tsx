"use client";

import { cn } from "@/lib/utils";
import { HexTicker } from "./hex-ticker";

export type TrackStatus = "pending" | "running" | "done" | "failed";

interface PipelineTrackProps {
  stages: readonly string[];
  /** Number of stages fully completed (0..stages.length). */
  completed: number;
  status: TrackStatus;
  compact?: boolean;
  className?: string;
}

/**
 * Stations on a line. Each completed station fills in and the connecting segment draws toward the
 * next one. The running station pulses and churns hex, which is the "proof is being generated" cue.
 */
export function PipelineTrack({ stages, completed, status, compact, className }: PipelineTrackProps) {
  const failed = status === "failed";
  return (
    <ol className={cn("flex w-full items-start", className)} aria-label="Payout stages">
      {stages.map((stage, i) => {
        const done = i < completed;
        const running = status === "running" && i === completed;
        const failedHere = failed && i === completed;
        const last = i === stages.length - 1;
        return (
          <li key={stage} className={cn("relative flex min-w-0 flex-1 flex-col", last && "flex-none")}>
            <div className="flex items-center">
              <span
                data-state={done ? "done" : running ? "running" : failedHere ? "failed" : "idle"}
                className={cn(
                  "relative z-10 grid shrink-0 place-items-center rounded-full border-2 bg-card transition-[background-color,border-color,transform] duration-500 ease-out-expo",
                  compact ? "size-3" : "size-4",
                  done && "border-verified bg-verified",
                  running && "border-primary [animation:lock-pulse_1.4s_var(--ease-out)_infinite]",
                  failedHere && "border-destructive bg-destructive",
                  !done && !running && !failedHere && "border-input",
                )}
              >
                {running ? <span className="size-1 rounded-full bg-primary [animation:dot-pulse_700ms_ease-in-out_infinite]" /> : null}
              </span>
              {!last ? (
                <span className="relative mx-1 h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                  <span
                    className="absolute inset-y-0 left-0 w-full origin-left bg-verified transition-transform duration-700 ease-out-expo"
                    style={{ transform: `scaleX(${done ? 1 : running ? 0.45 : 0})` }}
                  />
                </span>
              ) : null}
            </div>
            {!compact ? (
              <span
                className={cn(
                  "mt-1.5 pr-1 text-[11px] leading-tight transition-colors duration-300",
                  done ? "text-foreground" : running ? "font-medium text-primary" : "text-muted-foreground",
                )}
              >
                {stage}
              </span>
            ) : null}
          </li>
        );
      })}
      {!compact && status === "running" ? null : null}
    </ol>
  );
}

export function RunningLine({ stage, active, waiting }: { stage: string; active: boolean; waiting?: boolean }) {
  if (waiting) {
    return <p className="text-xs text-muted-foreground">Waiting for the previous transfer to land. Transfers from one treasury go one at a time.</p>;
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="min-w-[88px] font-medium text-foreground">{active ? stage : "—"}</span>
      <HexTicker active={active} length={24} />
    </div>
  );
}
