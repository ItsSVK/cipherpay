import { motion, AnimatePresence } from "motion/react"
import { Lock, Blocks, ArrowRight } from "lucide-react"
import { ScrambleText } from "@/components/scramble-text"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { Party } from "@/lib/demo"
import type { SimPhase } from "@/hooks/use-transfer-simulation"
import { cn } from "@/lib/utils"

interface FlowStageProps {
  sender: Party
  recipient: Party
  phase: SimPhase
  submitActive: boolean
  submitDone: boolean
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function FlowStage({
  sender,
  recipient,
  phase,
  submitActive,
  submitDone,
}: FlowStageProps) {
  const packetAtRecipient = submitDone
  const ledgerActive = phase !== "idle"

  return (
    <div className="relative flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-6 py-8">
      <div className="flex flex-col items-center gap-2">
        <Avatar size="lg">
          <AvatarFallback>{initials(sender.name)}</AvatarFallback>
        </Avatar>
        <span className="text-xs font-medium">{sender.name}</span>
      </div>

      <div className="relative flex flex-1 flex-col items-center gap-3 px-4">
        <div className="relative flex w-full items-center">
          <span className="h-px w-full border-t border-dashed border-border" />
          <AnimatePresence>
            {ledgerActive && (
              <motion.div
                key="packet"
                initial={{ left: "0%", opacity: 0 }}
                animate={{
                  left: packetAtRecipient ? "100%" : "50%",
                  opacity: 1,
                }}
                exit={{ opacity: 0 }}
                transition={{
                  left: { duration: submitActive ? 1.4 : 0.6, ease: "easeInOut" },
                  opacity: { duration: 0.3 },
                }}
                className="absolute top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-confidential/40 bg-background text-confidential shadow-sm"
              >
                <Lock className="size-3.5" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors",
            ledgerActive
              ? "border-confidential/30 bg-confidential-muted"
              : "border-border bg-background",
          )}
        >
          <Blocks className={cn("size-3.5", ledgerActive ? "text-confidential" : "text-muted-foreground")} />
          <span className="text-[11px] text-muted-foreground">ledger sees</span>
          <ScrambleText
            active={ledgerActive}
            length={14}
            className="font-mono text-[11px] text-confidential"
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Avatar size="lg">
          <AvatarFallback>{initials(recipient.name)}</AvatarFallback>
        </Avatar>
        <span className="text-xs font-medium">{recipient.name}</span>
      </div>

      {phase === "idle" && (
        <div className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-xl bg-background/70 text-xs text-muted-foreground backdrop-blur-[1px]">
          Enter an amount and send to watch it move
          <ArrowRight className="size-3.5" />
        </div>
      )}
    </div>
  )
}
