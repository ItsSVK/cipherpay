import { AnimatePresence } from "motion/react"
import { Lock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { WalletCard } from "@/components/wallet-card"
import { TransferForm } from "@/components/transfer-form"
import { FlowStage } from "@/components/flow-stage"
import { StepRail } from "@/components/step-rail"
import { ActivityLog } from "@/components/activity-log"
import { DisclosureSummary } from "@/components/disclosure-summary"
import { useTransferSimulation } from "@/hooks/use-transfer-simulation"

export default function App() {
  const { state, start, reset, disclose, sender, recipient } = useTransferSimulation()

  const isIdle = state.phase === "idle"
  const isDone = state.phase === "done"
  const settling = state.stepStatuses.settle !== "pending"

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
              <Lock className="size-3.5" />
            </span>
            <span className="text-sm font-semibold">Confidential Pay</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Simulated demo</Badge>
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              Solana · Token-2022 confidential transfer
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Send USDC without broadcasting the amount
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            This walks through what actually happens on-chain during a confidential P2P
            transfer — encryption, zero-knowledge proofs, and settlement — using simulated
            wallets and balances so you can watch every step.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
          <div className="flex flex-col gap-4">
            <WalletCard
              party={sender}
              publicBalance={state.senderPublicBalance}
              confidentialBalance={state.senderConfidentialBalance}
              confidentialEncrypted={false}
              selfView
              balanceDelta={
                settling ? -(state.amount ?? 0) : null
              }
            />
            <TransferForm
              recipient={recipient}
              maxAmount={state.senderConfidentialBalance}
              phase={state.phase}
              onSend={start}
              onReset={reset}
            />
          </div>

          <div className="flex flex-col gap-4">
            <FlowStage
              sender={sender}
              recipient={recipient}
              phase={state.phase}
              submitActive={state.stepStatuses.submit === "active"}
              submitDone={state.stepStatuses.submit === "done"}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_260px]">
              <Card>
                <CardHeader>
                  <CardTitle>How this transfer moves</CardTitle>
                </CardHeader>
                <CardContent>
                  <StepRail
                    stepStatuses={state.stepStatuses}
                    proofStatuses={state.proofStatuses}
                    awaitingDisclosure={state.phase === "awaiting-disclosure"}
                    onDisclose={disclose}
                  />
                </CardContent>
              </Card>

              <div className="flex flex-col gap-4">
                <WalletCard
                  party={recipient}
                  confidentialBalance={state.recipientConfidentialBalance}
                  confidentialEncrypted={state.recipientRevealedAmount === null}
                  pulse={state.stepStatuses.settle === "active"}
                  balanceDelta={settling ? state.amount ?? null : null}
                />
                <ActivityLog entries={state.log} />
              </div>
            </div>

            <AnimatePresence>{isDone && <DisclosureSummary />}</AnimatePresence>
          </div>
        </div>

        {isIdle && (
          <p className="text-center text-xs text-muted-foreground">
            No wallet connection or real funds are involved — this is a visual walkthrough of
            the protocol.
          </p>
        )}
      </main>
    </div>
  )
}
