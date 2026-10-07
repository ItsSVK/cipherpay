"use client";

import * as React from "react";
import { ChevronDownIcon, HelpCircleIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface DisclosureCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function DisclosureCard({
  title,
  description,
  icon,
  children,
  defaultOpen = false,
  className,
}: DisclosureCardProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "group rounded-xl border border-border/80 bg-card/60 transition-all duration-200 hover:border-border",
        className
      )}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/30">
        <div className="flex items-center gap-2.5">
          <span className="grid size-6 place-items-center rounded-md bg-secondary text-muted-foreground">
            {icon ?? <HelpCircleIcon className="size-3.5" />}
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            {description ? (
              <p className="text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out-expo group-hover:text-foreground",
            open && "rotate-180"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border/60 bg-muted/20 px-4 py-3.5 text-xs leading-relaxed text-muted-foreground">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
