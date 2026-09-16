import { motion } from "motion/react"
import { Eye, EyeOff } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const PUBLIC_ITEMS = [
  "That a transfer happened, and roughly when",
  "The sender and recipient account addresses",
  "That both proofs were valid (amount ≥ 0, balances consistent)",
]

const PRIVATE_ITEMS = [
  "The transfer amount",
  "The sender's resulting balance",
  "The recipient's resulting balance",
]

export function DisclosureSummary() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>What's actually hidden vs. revealed</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Eye className="size-3.5" />
              Public on-chain
            </div>
            <ul className="flex flex-col gap-1.5">
              {PUBLIC_ITEMS.map((item) => (
                <li key={item} className="text-xs leading-snug text-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-confidential/30 bg-confidential-muted p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-confidential">
              <EyeOff className="size-3.5" />
              Stays private
            </div>
            <ul className="flex flex-col gap-1.5">
              {PRIVATE_ITEMS.map((item) => (
                <li key={item} className="text-xs leading-snug text-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
