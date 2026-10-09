"use client";

import { Fragment, type ReactNode } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * A horizontal chain of steps in the same visual language as the key-derivation diagram: round icon nodes joined by
 * dashed rails. A finished rail draws itself in green; the rail into the step that is working carries a moving packet;
 * the working node wears a slowly turning dashed ring. Nothing here is decorative noise: every state is a real step.
 */
export type FlowState = "idle" | "active" | "waiting" | "done" | "error";

export interface FlowStep {
  key: string;
  icon: ReactNode;
  label: string;
  sub?: ReactNode;
  state: FlowState;
}

function FlowNode({ step, size }: { step: FlowStep; size: "sm" | "md" }) {
  const { state } = step;
  const busy = state === "active" || state === "waiting";
  return (
    <div className="flex min-w-0 flex-col items-center" aria-current={busy ? "step" : undefined}>
      <div className="relative">
        {busy ? (
          <span
            className={cn(
              "absolute rounded-full border-2 border-dashed animate-[spin_6s_linear_infinite]",
              size === "sm" ? "-inset-1" : "-inset-1.5",
              state === "waiting" ? "border-primary/55" : "border-primary/35",
            )}
            aria-hidden
          />
        ) : null}
        <div
          key={state}
          className={cn(
            "relative grid place-items-center rounded-full border bg-card transition-[background-color,border-color,color] duration-300 [&_svg]:shrink-0",
            size === "sm" ? "size-8 [&_svg]:size-3.5" : "size-10 [&_svg]:size-4",
            state === "idle" && "border-border text-muted-foreground",
            busy && "border-primary/50 bg-primary/10 text-primary",
            state === "waiting" && "[animation:lock-pulse_1.6s_var(--ease-out)_infinite]",
            state === "done" && "border-verified bg-verified text-white [animation:pop_420ms_var(--ease-out)_both]",
            state === "error" && "border-destructive/40 bg-failed-soft text-destructive",
          )}
        >
          {state === "done" ? <CheckIcon strokeWidth={3} /> : state === "error" ? <XIcon strokeWidth={3} /> : step.icon}
        </div>
      </div>
      <span className={cn("mt-1.5 max-w-full truncate text-center text-[10px] font-medium sm:text-[11px] transition-colors duration-300", state === "idle" ? "text-muted-foreground" : state === "error" ? "text-destructive" : "text-foreground")}>
        {step.label}
      </span>
      {step.sub ? <span className="max-w-full truncate text-center text-[10px] text-muted-foreground">{step.sub}</span> : null}
    </div>
  );
}

/** The rail between two nodes. `drawn` draws it solid; `flowing` sends a packet along it toward the next node. */
function FlowRail({ drawn, flowing, size }: { drawn: boolean; flowing: boolean; size: "sm" | "md" }) {
  const reduced = useReducedMotion();
  return (
    <div className={cn("relative mx-0.5 min-w-2 flex-1 sm:mx-1.5", size === "sm" ? "mt-4" : "mt-5")} aria-hidden>
      <svg className="absolute inset-x-0 -top-px h-0.5 w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 2">
        <line x1="0" y1="1" x2="100" y2="1" className="stroke-border" strokeWidth={1.5} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <line
          x1="0"
          y1="1"
          x2="100"
          y2="1"
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
      {flowing && !reduced ? <span className="absolute top-0 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary [animation:flow-packet_1.4s_var(--ease-in-out)_infinite]" /> : null}
    </div>
  );
}

export function Flow({ steps, size = "sm", className, label }: { steps: FlowStep[]; size?: "sm" | "md"; className?: string; label: string }) {
  return (
    <ol className={cn("flex w-full items-start", className)} aria-label={label}>
      {steps.map((s, i) => {
        const next = steps[i + 1];
        return (
          <Fragment key={s.key}>
            <li className="flex w-12 min-w-0 flex-none justify-center sm:w-16">
              <FlowNode step={s} size={size} />
            </li>
            {next ? (
              <li className="contents" aria-hidden>
                <FlowRail size={size} drawn={s.state === "done" && next.state !== "idle"} flowing={s.state === "done" && (next.state === "active" || next.state === "waiting")} />
              </li>
            ) : null}
          </Fragment>
        );
      })}
    </ol>
  );
}
