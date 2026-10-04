"use client";

import { cn } from "@/lib/utils";

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}

/** Radio-style segmented control. One indicator element slides between equal-width cells. */
export function Segmented<T extends string>({ value, onChange, options, label, className }: SegmentedProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const n = options.length;
  return (
    <div role="radiogroup" aria-label={label} className={cn("relative grid rounded-lg bg-muted p-[3px]", className)} style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      <span
        aria-hidden
        className="absolute inset-y-[3px] left-[3px] rounded-md bg-card shadow-[0_1px_2px_oklch(0.3_0.03_270/0.14),0_0_0_1px_var(--border)] transition-transform duration-[420ms] ease-out-expo"
        style={{ width: `calc((100% - 6px) / ${n})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative z-10 rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-300",
            o.value === value ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
