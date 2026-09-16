import { motion, AnimatePresence } from "motion/react"
import { Lock, Unlock, Wallet } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { ScrambleText } from "@/components/scramble-text"
import { formatUsdc, type Party } from "@/lib/demo"
import { cn } from "@/lib/utils"

interface WalletCardProps {
  party: Party
  publicBalance?: number
  confidentialBalance: number
  confidentialEncrypted: boolean
  pulse?: boolean
  balanceDelta?: number | null
  selfView?: boolean
  className?: string
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function WalletCard({
  party,
  publicBalance,
  confidentialBalance,
  confidentialEncrypted,
  pulse,
  balanceDelta,
  selfView = false,
  className,
}: WalletCardProps) {
  return (
    <Card className={cn("relative", className)}>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <Avatar>
          <AvatarFallback>{initials(party.name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{party.name}</span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {party.address}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {publicBalance !== undefined && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="size-3.5" />
              Public USDC
            </div>
            <span className="font-mono text-sm tabular-nums">
              {formatUsdc(publicBalance)}
            </span>
          </div>
        )}

        <div
          className={cn(
            "relative flex flex-col gap-2 rounded-lg border px-3 py-2 transition-colors",
            confidentialEncrypted
              ? "border-confidential/30 bg-confidential-muted"
              : "border-border bg-muted/40",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {confidentialEncrypted ? (
                <Lock className="size-3.5 text-confidential" />
              ) : (
                <Unlock className="size-3.5 text-confidential" />
              )}
              Confidential balance
            </div>
            <AnimatePresence>
              {pulse && (
                <motion.span
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="size-1.5 rounded-full bg-confidential"
                />
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-baseline justify-between">
            {confidentialEncrypted ? (
              <ScrambleText
                active={false}
                length={18}
                className="truncate font-mono text-sm text-confidential"
              />
            ) : (
              <motion.span
                key={confidentialBalance}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="font-mono text-sm tabular-nums"
              >
                {formatUsdc(confidentialBalance)} USDC
              </motion.span>
            )}
            <AnimatePresence>
              {balanceDelta != null && balanceDelta !== 0 && (
                <motion.span
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    balanceDelta > 0 ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {balanceDelta > 0 ? "+" : ""}
                  {formatUsdc(balanceDelta)}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <span className="text-[11px] leading-tight text-muted-foreground">
            {confidentialEncrypted
              ? "Only decryptable with this wallet's own key"
              : selfView
                ? "Visible only to you — encrypted on-chain"
                : "Disclosed by the account holder"}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
