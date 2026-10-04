"use client";

import { PlayIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HexTicker } from "@/components/crypto/hex-ticker";
import { PipelineTrack } from "@/components/crypto/pipeline-track";
import { PIPELINE_STAGES, TRANSFER_STAGE } from "@/lib/mock/data";
import { useRunSimulation } from "@/lib/payroll/use-run-simulation";

const IDS = ["sample"];
const NOTES = [
  "Your browser generates three zero-knowledge proofs. Nothing leaves the tab.",
  "Each proof is written into its own context account, in its own transaction.",
  "The proof program verifies each one on-chain.",
  "pay_employee moves the encrypted amount from the vault to the employee.",
  "Context accounts close and the rent comes back.",
];

export function PipelineDemo() {
  const { rows, running, done, start, reset } = useRunSimulation(IDS, PIPELINE_STAGES.length, TRANSFER_STAGE);
  const r = rows[0];
  const active = r.status === "running";
  const idx = Math.min(r.completed, PIPELINE_STAGES.length - 1);

  return (
    <div className="plate p-5 sm:p-6">
      <PipelineTrack stages={PIPELINE_STAGES} completed={r.completed} status={r.status} />
      <div className="mt-6 min-h-[88px] rounded-lg border bg-muted/50 p-4">
        <div key={`${r.status}-${idx}`} className="enter-fade">
          <p className="text-sm font-medium">
            {r.status === "pending" ? "Ready" : done ? "Paid. Amount stayed encrypted throughout." : PIPELINE_STAGES[idx]}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {r.status === "pending" ? "Run a sample payout for one employee and watch each stage complete." : done ? "The public saw one transfer between two wallets, and nothing about how much." : NOTES[idx]}
          </p>
        </div>
        <div className="mt-2 h-4">
          <HexTicker active={active} length={44} />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Simulated. About seven transactions per employee on devnet.</p>
        {done ? (
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcwIcon /> Replay
          </Button>
        ) : (
          <Button size="sm" onClick={() => start()} disabled={running}>
            <PlayIcon /> {running ? "Running…" : "Run sample payout"}
          </Button>
        )}
      </div>
    </div>
  );
}
