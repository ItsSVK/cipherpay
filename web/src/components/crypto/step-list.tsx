"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/app/status-badge";

export interface Step {
  label: string;
  detail: string;
  /** Whether the amount is visible on-chain at this step. Shown honestly on every flow. */
  visibility?: "public" | "encrypted";
  /** Node icon. Steps without one show their number. */
  icon?: ReactNode;
}

type NodeState = "idle" | "active" | "waiting" | "done" | "error";

/**
 * A vertical `Flow`: round nodes joined by dashed rails. A finished rail draws itself in green, the rail into the working step
 * carries a packet, the working node wears a turning dashed ring (plus the `lock-pulse` halo while the wallet is asked), and a key
 * wash glides behind whichever row is working. `completed` steps are done; the step at `completed` works while `running`.
 * `failedAt` marks the step a run stopped on; `now` is one plain sentence of what the working step is doing.
 */
export function StepList({
  steps,
  completed,
  running,
  waiting = false,
  failedAt,
  now,
  className,
}: {
  steps: Step[];
  completed: number;
  running: boolean;
  waiting?: boolean;
  failedAt?: number | null;
  now?: string | null;
  className?: string;
}) {
  const failed = !running && failedAt != null && failedAt >= 0 && failedAt < steps.length ? failedAt : -1;
  const doneCount = failed >= 0 ? failed : completed;
  const focus = running && completed < steps.length ? completed : failed;
  const stateOf = (i: number): NodeState =>
    i === failed ? "error" : i < doneCount ? "done" : running && i === completed ? (waiting ? "waiting" : "active") : "idle";

  // The highlight is one element that slides between rows, so it is measured rather than drawn per row.
  const listRef = useRef<HTMLOListElement>(null);
  const [rows, setRows] = useState<{ top: number; height: number }[]>([]);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const items = Array.from(list.querySelectorAll<HTMLElement>(":scope > li"));
    const measure = () => setRows(items.map((el) => ({ top: el.offsetTop, height: el.offsetHeight })));
    measure();
    const ro = new ResizeObserver(measure);
    items.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [steps.length]);

  // Keep the last position while hidden, so the highlight fades out in place and fades back in where it is needed.
  const [parked, setParked] = useState<number>(Math.max(focus, 0));
  if (focus >= 0 && focus !== parked) setParked(focus);
  const box = rows[focus >= 0 ? focus : parked];

  return (
    <ol ref={listRef} className={cn("relative grid", className)} aria-label="Steps">
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 rounded-xl transition-[transform,height,opacity,background-color] duration-500 ease-out-expo",
          failed >= 0 ? "bg-failed-soft/60" : "bg-accent/45",
          focus >= 0 && box ? "opacity-100" : "opacity-0",
        )}
        style={box ? { transform: `translateY(${box.top}px)`, height: box.height } : undefined}
      />
      {steps.map((s, i) => {
        const state = stateOf(i);
        const next = i < steps.length - 1 ? stateOf(i + 1) : null;
        const busy = state === "active" || state === "waiting";
        return (
          <li key={s.label} data-state={state} aria-current={busy ? "step" : undefined} className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 px-3 py-3">
            <StepNode state={state} icon={s.icon} index={i} />
            {next ? <StepRail drawn={state === "done" && next !== "idle"} flowing={state === "done" && (next === "active" || next === "waiting")} /> : null}
            <div className="min-w-0 pt-[7px]">
              <div className="flex items-start justify-between gap-3">
                <p
                  className={cn(
                    "text-[13px] font-medium leading-tight transition-colors duration-300",
                    state === "error" ? "text-destructive" : state === "idle" && (running || failed >= 0) ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {s.label}
                </p>
                {s.visibility ? (
                  <StatusBadge tone={s.visibility === "public" ? "pending" : "key"} className="-mt-1 h-5 shrink-0 px-2 text-[10.5px]">
                    {s.visibility === "public" ? "Public" : "Encrypted"}
                  </StatusBadge>
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.detail}</p>
              <div
                className={cn("grid transition-[grid-template-rows,opacity] duration-500 ease-out-expo", busy && now ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}
                aria-hidden={!(busy && now)}
              >
                <div className="min-h-0 overflow-hidden">
                  <p className="flex items-center gap-1.5 pt-2 text-[11px] font-medium text-primary" role="status" aria-live="polite">
                    <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary [animation:dot-pulse_1.2s_ease-in-out_infinite]" />
                    {busy ? now : null}
                  </p>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepNode({ state, icon, index }: { state: NodeState; icon?: ReactNode; index: number }) {
  const busy = state === "active" || state === "waiting";
  return (
    <span className="relative z-10 size-8 self-start" aria-hidden>
      {busy ? (
        <span
          className={cn(
            "absolute -inset-1 rounded-full border-2 border-dashed animate-[spin_6s_linear_infinite]",
            state === "waiting" ? "border-primary/55" : "border-primary/35",
          )}
        />
      ) : null}
      <span
        key={state}
        className={cn(
          "relative grid size-8 place-items-center rounded-full border bg-card text-[11px] font-semibold tnum transition-[background-color,border-color,color] duration-300 [&_svg]:size-3.5 [&_svg]:shrink-0",
          state === "idle" && "border-border text-muted-foreground",
          busy && "border-primary/50 bg-primary/10 text-primary",
          state === "active" && "[animation:pop_420ms_var(--ease-out)_both]",
          state === "waiting" && "[animation:lock-pulse_1.6s_var(--ease-out)_infinite]",
          state === "done" && "border-verified bg-verified text-white [animation:pop_420ms_var(--ease-out)_both]",
          state === "error" && "border-destructive/40 bg-failed-soft text-destructive [animation:pop_420ms_var(--ease-out)_both]",
        )}
      >
        {state === "done" ? <CheckIcon strokeWidth={3} /> : state === "error" ? <XIcon strokeWidth={3} /> : (icon ?? index + 1)}
      </span>
    </span>
  );
}

/** The rail from this node down to the next one: dashed while ahead, drawn green once passed, a packet while the next step works. */
function StepRail({ drawn, flowing }: { drawn: boolean; flowing: boolean }) {
  const reduced = useReducedMotion();
  // Spans from under this node, through the row padding, to the top of the next node (rows have py-3 and no gap).
  return (
    <span aria-hidden className="pointer-events-none absolute bottom-[-0.5rem] left-[calc(0.75rem+1rem)] top-[calc(0.75rem+2rem+0.25rem)] w-0.5 -translate-x-1/2">
      <svg className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 2 100">
        <line x1="1" y1="0" x2="1" y2="100" className="stroke-border" strokeWidth={1.5} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <line
          x1="1"
          y1="0"
          x2="1"
          y2="100"
          pathLength={1}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={1}
          strokeDashoffset={drawn ? 0 : 1}
          vectorEffect="non-scaling-stroke"
          className="stroke-verified"
          style={{ transition: "stroke-dashoffset 600ms var(--ease-out)" }}
        />
      </svg>
      {flowing && !reduced ? (
        <span className="absolute left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary [animation:flow-packet-y_1.4s_var(--ease-in-out)_infinite]" />
      ) : null}
    </span>
  );
}
