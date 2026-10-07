"use client";

import * as React from "react";
import { Cipher } from "@/components/crypto/cipher";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { StatusBadge, type Tone } from "@/components/app/status-badge";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  tooltip?: string;
  value: string;
  seed: string;
  revealed: boolean;
  suffix?: string;
  badgeText?: string;
  badgeTone?: Tone;
  badgePulse?: boolean;
  subtitle?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function MetricCard({
  title,
  tooltip,
  value,
  seed,
  revealed,
  suffix = "USDC",
  badgeText,
  badgeTone = "neutral",
  badgePulse = false,
  subtitle,
  actions,
  children,
  className,
  style,
}: MetricCardProps) {
  return (
    <section
      className={cn(
        "plate relative flex flex-col justify-between p-5 transition-[box-shadow,border-color] duration-200 hover:border-primary/25 hover:shadow-md sm:p-6",
        className
      )}
      style={style}
      aria-label={title}
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
            {tooltip ? <InfoTooltip content={tooltip} /> : null}
          </div>
          {badgeText ? (
            <StatusBadge tone={badgeTone} pulse={badgePulse}>
              {badgeText}
            </StatusBadge>
          ) : null}
        </div>

        <div className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl">
          <Cipher
            value={value}
            seed={seed}
            revealed={revealed}
            suffix={suffix}
            className="[&>span:last-child]:text-sm sm:[&>span:last-child]:text-base text-foreground"
          />
        </div>

        {subtitle ? (
          <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>

      {(actions || children) && (
        <div className="mt-5 border-t border-border/60 pt-4">
          {actions ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {actions}
            </div>
          ) : null}
          {children}
        </div>
      )}
    </section>
  );
}
