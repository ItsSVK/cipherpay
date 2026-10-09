"use client";

import { CheckIcon, Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ButtonProgress {
  /** Label while working ("Approve in wallet"), or the success label once `done`. */
  label: string;
  /** How far the fill has got, 0 to 100. */
  fill: number;
  done?: boolean;
}

/**
 * A button that becomes its own progress indicator: while `progress` is set, a fill grows across it with a shimmer
 * and the label follows the steps. It keeps its size throughout, so nothing around it moves.
 */
export function ProgressButton({
  progress,
  className,
  idleClassName,
  children,
  disabled,
  ...props
}: Omit<React.ComponentProps<"button">, "type"> & { progress: ButtonProgress | null; idleClassName?: string }) {
  const done = !!progress?.done;
  return (
    <button
      type="button"
      disabled={disabled || !!progress}
      aria-busy={!!progress && !done}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl font-semibold outline-none transition-[background-color,border-color,box-shadow,color,transform] duration-200",
        "focus-visible:ring-3 focus-visible:ring-ring/50 active:enabled:translate-y-px disabled:cursor-not-allowed",
        progress ? "cursor-default border border-border/80 bg-card text-foreground disabled:cursor-default" : cn("disabled:opacity-50", idleClassName),
        className,
      )}
      {...props}
    >
      {progress ? (
        <>
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 transition-[width,background-color] duration-700 ease-out-expo",
              done ? "bg-verified/15" : "bg-primary/12",
            )}
            style={{ width: `${progress.fill}%` }}
          />
          {!done ? (
            <span aria-hidden className="absolute inset-0 overflow-hidden">
              <span className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/60 to-transparent [animation:sweep_1.6s_ease-in-out_infinite]" />
            </span>
          ) : null}
          <span className="relative flex items-center gap-2">
            {done ? (
              <CheckIcon className="size-3.5 text-verified [animation:pop_var(--dur-base)_var(--ease-out)]" strokeWidth={3} />
            ) : (
              <Loader2Icon className="size-3.5 animate-spin text-primary" />
            )}
            {progress.label}
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
