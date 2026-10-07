"use client";

import * as React from "react";
import { InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface InfoTooltipProps {
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  iconClassName?: string;
  ariaLabel?: string;
}

export function InfoTooltip({
  content,
  side = "top",
  className,
  iconClassName,
  ariaLabel = "More information",
}: InfoTooltipProps) {
  return (
    <TooltipProvider delay={100}>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
        >
          <InfoIcon className={cn("size-3.5", iconClassName)} />
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-xs rounded-lg border bg-popover/95 p-2.5 text-xs font-normal leading-relaxed text-popover-foreground shadow-md backdrop-blur-sm"
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
