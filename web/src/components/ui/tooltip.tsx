"use client"

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { cn } from "cn"

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 8,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={16}
        className="isolate z-50"
      >
        {/* A small white plate: hairline border, plate-style soft shadow, ink text. No glass, no dark fill (DESIGN.md). */}
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "relative z-50 w-fit max-w-[17rem] origin-(--transform-origin) rounded-xl border border-border bg-popover px-3 py-2 text-left text-xs leading-relaxed font-normal text-pretty text-popover-foreground",
            "shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-8px_rgb(0_0_0/0.12)]",
            "transition-[opacity,transform] duration-150 ease-(--ease-out) data-starting-style:scale-[0.97] data-starting-style:opacity-0 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-ending-style:duration-100",
            className
          )}
          {...props}
        >
          {children}
          {/* Arrow: same white as the popup, bordered only on its two outward edges so it reads as part of the plate. */}
          <TooltipPrimitive.Arrow className="size-2.5 rotate-45 rounded-[2px] border-border bg-popover data-[side=top]:-bottom-[5px] data-[side=top]:border-r data-[side=top]:border-b data-[side=bottom]:-top-[5px] data-[side=bottom]:border-t data-[side=bottom]:border-l data-[side=left]:-right-[5px] data-[side=left]:border-t data-[side=left]:border-r data-[side=right]:-left-[5px] data-[side=right]:border-b data-[side=right]:border-l" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
