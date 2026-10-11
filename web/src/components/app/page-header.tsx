"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  badge,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "enter flex flex-wrap items-end justify-between gap-4 pb-6 sm:pb-8",
        className
      )}
      style={{ ["--i" as string]: 0 }}
    >
      <div className="min-w-0 max-w-2xl">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-serif font-normal tracking-[-0.015em] text-[1.875rem] leading-[1.1] text-foreground sm:text-[2.5rem]">
            {title}
          </h1>
          {badge}
        </div>
        {description ? (
          <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-2.5">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
