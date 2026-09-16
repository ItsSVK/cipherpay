import { useEffect, useRef } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Terminal } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { LogEntry } from "@/hooks/use-transfer-simulation"
import { cn } from "@/lib/utils"

interface ActivityLogProps {
  entries: LogEntry[]
}

export function ActivityLog({ entries }: ActivityLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [entries.length])

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-foreground text-background">
      <div className="flex items-center gap-1.5 border-b border-background/10 px-3 py-2">
        <Terminal className="size-3.5 text-background/60" />
        <span className="font-mono text-xs text-background/60">activity log</span>
      </div>
      <ScrollArea className="h-40">
        <div className="flex flex-col gap-1 px-3 py-2">
          {entries.length === 0 && (
            <span className="font-mono text-xs text-background/40">
              Waiting for a transfer to start…
            </span>
          )}
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "font-mono text-xs leading-relaxed",
                  entry.kind === "success" && "text-background",
                  entry.kind === "info" && "text-background/70",
                  entry.kind === "muted" && "text-background/40",
                )}
              >
                <span className="text-background/30">$ </span>
                {entry.text}
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  )
}
