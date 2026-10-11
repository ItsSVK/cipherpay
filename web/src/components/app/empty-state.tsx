"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "plate flex flex-col items-center justify-center p-8 text-center sm:p-12",
        className
      )}
    >
      <div className="grid size-12 place-items-center rounded-xl bg-secondary text-muted-foreground ring-1 ring-border">
        {icon}
      </div>
      <h3 className="mt-4 font-serif font-normal tracking-[-0.015em] text-xl text-foreground">
        {title}
      </h3>
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground sm:text-sm">
        {description}
      </p>
      {action ? <div className="mt-5 flex flex-wrap gap-2.5">{action}</div> : null}
    </div>
  );
}
