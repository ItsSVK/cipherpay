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
            "inline-flex items-center justify-center rounded-full p-0.5 align-middle text-muted-foreground/70 transition-colors duration-150 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-popup-open:text-primary",
            className
          )}
        >
          <InfoIcon className={cn("size-3.5", iconClassName)} />
        </TooltipTrigger>
        <TooltipContent side={side}>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
