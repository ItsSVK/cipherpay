import type { ComponentType } from "react"
import { motion } from "motion/react"
import { Check, Lock, ShieldCheck, ArrowRightLeft, RefreshCw, Eye } from "lucide-react"
import { PROOFS, STEPS, type StepId, type StepStatus } from "@/lib/demo"
import type { ProofStatus } from "@/hooks/use-transfer-simulation"
import { cn } from "@/lib/utils"

const STEP_ICONS: Record<StepId, ComponentType<{ className?: string }>> = {
  encrypt: Lock,
  proofs: ShieldCheck,
  submit: ArrowRightLeft,
  settle: RefreshCw,
  disclose: Eye,
}

interface StepRailProps {
  stepStatuses: Record<StepId, StepStatus>
  proofStatuses: Record<string, ProofStatus>
  awaitingDisclosure: boolean
  onDisclose: () => void
}

function StatusDot({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
        <Check className="size-3" strokeWidth={3} />
      </span>
    )
  }
  if (status === "active") {
    return (
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full bg-confidential/25"
          animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
        />
        <span className="size-2.5 rounded-full bg-confidential" />
      </span>
    )
  }
  return (
    <span className="size-5 shrink-0 rounded-full border border-border" />
  )
}

export function StepRail({
  stepStatuses,
  proofStatuses,
  awaitingDisclosure,
  onDisclose,
}: StepRailProps) {
  return (
    <ol className="flex flex-col">
      {STEPS.map((step, i) => {
        const status = stepStatuses[step.id]
        const Icon = STEP_ICONS[step.id]
        const isLast = i === STEPS.length - 1
        return (
          <li key={step.id} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast && (
              <span
                className={cn(
                  "absolute top-5 left-2.5 h-[calc(100%-1rem)] w-px -translate-x-1/2",
                  status === "done" ? "bg-foreground/30" : "bg-border",
                )}
              />
            )}
            <StatusDot status={status} />
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-px">
              <div className="flex items-center gap-1.5">
                <Icon
                  className={cn(
                    "size-3.5",
                    status === "pending" ? "text-muted-foreground" : "text-foreground",
                  )}
                />
                <span
                  className={cn(
                    "text-sm font-medium",
                    status === "pending" && "text-muted-foreground",
                  )}
                >
                  {step.title}
                </span>
              </div>
              <p className="text-xs leading-snug text-muted-foreground">
                {step.description}
              </p>

              {step.id === "proofs" && status !== "pending" && (
                <div className="mt-1 flex flex-col gap-1.5">
                  {PROOFS.map((proof) => {
                    const pStatus = proofStatuses[proof.id]
                    return (
                      <div
                        key={proof.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2 py-1"
                      >
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">{proof.label}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {proof.detail}
                          </span>
                        </div>
                        {pStatus === "verified" ? (
                          <Check className="size-3.5 shrink-0 text-foreground" />
                        ) : pStatus === "active" ? (
                          <motion.span
                            className="size-1.5 shrink-0 rounded-full bg-confidential"
                            animate={{ opacity: [1, 0.3, 1] }}
                            transition={{ duration: 0.9, repeat: Infinity }}
                          />
                        ) : (
                          <span className="size-1.5 shrink-0 rounded-full bg-border" />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {step.id === "disclose" && awaitingDisclosure && (
                <button
                  type="button"
                  onClick={onDisclose}
                  className="mt-1 w-fit rounded-md border border-confidential/40 bg-confidential-muted px-2 py-1 text-xs font-medium text-confidential transition-colors hover:bg-confidential/15"
                >
                  Reveal to recipient
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
