"use client";

import * as React from "react";
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { cn } from "@/lib/utils";

function Collapsible({
  ...props
}: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({
  className,
  ...props
}: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn("outline-none", className)}
      {...props}
    />
  );
}

function CollapsibleContent({
  className,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className={cn(
        "overflow-hidden transition-all duration-300 ease-out-expo data-[ending-style]:h-0 data-[starting-style]:h-0",
        className
      )}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
