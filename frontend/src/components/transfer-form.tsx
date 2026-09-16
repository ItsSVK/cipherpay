import { useState } from "react"
import { Loader2, Send, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { Party } from "@/lib/demo"
import type { SimPhase } from "@/hooks/use-transfer-simulation"

interface TransferFormProps {
  recipient: Party
  maxAmount: number
  phase: SimPhase
  onSend: (amount: number, autoDisclose: boolean) => void
  onReset: () => void
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function TransferForm({
  recipient,
  maxAmount,
  phase,
  onSend,
  onReset,
}: TransferFormProps) {
  const [amount, setAmount] = useState("50")
  const [autoDisclose, setAutoDisclose] = useState(false)

  const parsed = Number(amount)
  const isValid = amount.trim() !== "" && Number.isFinite(parsed) && parsed > 0 && parsed <= maxAmount
  const isRunning = phase === "running"
  const isIdle = phase === "idle"

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send confidentially</CardTitle>
        <CardDescription>
          The amount stays encrypted end-to-end — only proven valid on-chain, never revealed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>To</Label>
          <div className="flex items-center gap-2 rounded-lg border border-input px-2.5 py-1.5">
            <Avatar size="sm">
              <AvatarFallback>{initials(recipient.name)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">{recipient.name}</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {recipient.address}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="amount">Amount</Label>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-50"
              onClick={() => setAmount(String(maxAmount))}
              disabled={!isIdle}
            >
              Max {maxAmount.toFixed(2)}
            </button>
          </div>
          <div className="relative">
            <Input
              id="amount"
              inputMode="decimal"
              value={amount}
              disabled={!isIdle}
              onChange={(e) => setAmount(e.target.value)}
              className="pr-14"
              aria-invalid={amount.trim() !== "" && !isValid}
            />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
              USDC
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
          <div className="flex flex-col">
            <Label htmlFor="auto-disclose">Auto-disclose on arrival</Label>
            <span className="text-xs text-muted-foreground">
              Off by default — {recipient.name} discloses manually, whenever they choose.
            </span>
          </div>
          <Switch
            id="auto-disclose"
            checked={autoDisclose}
            onCheckedChange={setAutoDisclose}
            disabled={!isIdle}
          />
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        {isIdle ? (
          <Button
            className="flex-1"
            disabled={!isValid}
            onClick={() => onSend(parsed, autoDisclose)}
          >
            <Send data-icon="inline-start" />
            Send confidentially
          </Button>
        ) : (
          <>
            <Button className="flex-1" disabled>
              {isRunning ? (
                <>
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                  Processing…
                </>
              ) : (
                "Sent"
              )}
            </Button>
            <Button variant="outline" size="icon" onClick={onReset} aria-label="Reset demo">
              <RotateCcw />
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
