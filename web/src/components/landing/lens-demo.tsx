"use client";

import { useState } from "react";
import { Address } from "@/components/crypto/fingerprint";
import { Cipher } from "@/components/crypto/cipher";
import { Segmented } from "@/components/app/segmented";
import { LockIcon } from "@/components/crypto/lock-icon";
import { EMPLOYEES } from "@/lib/mock/data";
import { formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

type Lens = "public" | "employee" | "auditor";

const ROWS = EMPLOYEES.slice(0, 4);
const COPY: Record<Lens, { title: string; body: string }> = {
  public: { title: "Anyone on a block explorer", body: "Sees that the vault paid four wallets. Every amount is ciphertext." },
  employee: { title: "Sam, with Sam's key", body: "Decrypts only the payment addressed to Sam. The other rows stay sealed." },
  auditor: { title: "The auditor, with the mint's auditor key", body: "Decrypts every payment, so compliance has a full picture." },
};

export function LensDemo() {
  const [lens, setLens] = useState<Lens>("public");
  const keyHeld = lens !== "public";

  return (
    <div className="plate overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <p className="text-sm font-medium">October payroll</p>
          <p className="text-xs text-muted-foreground">Same four payments, three viewers</p>
        </div>
        <Segmented
          label="Viewer"
          value={lens}
          onChange={setLens}
          options={[
            { value: "public", label: "Public" },
            { value: "employee", label: "Employee" },
            { value: "auditor", label: "Auditor" },
          ]}
        />
      </div>
      <ul>
        {ROWS.map((e, i) => {
          const revealed = lens === "auditor" || (lens === "employee" && i === 0);
          return (
            <li key={e.id} className={cn("row-hover flex items-center justify-between gap-4 border-b px-4 py-3.5 last:border-b-0", revealed && "bg-verified-soft/40")}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{lens === "public" ? "Wallet" : e.name}</p>
                <Address value={e.wallet} className="text-muted-foreground" />
              </div>
              <div className="flex items-center gap-2 text-[15px]">
                <Cipher value={formatUsdc(e.salary)} seed={`landing-${e.id}`} revealed={revealed} delay={i * 110} suffix="USDC" />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-start gap-3 border-t bg-muted/50 px-4 py-3.5">
        <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-md transition-colors duration-300", keyHeld ? "bg-verified-soft text-verified" : "bg-secondary text-muted-foreground")}>
          <LockIcon open={keyHeld} className="size-4" />
        </span>
        <div key={lens} className="enter-fade min-w-0">
          <p className="text-sm font-medium">{COPY[lens].title}</p>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{COPY[lens].body}</p>
        </div>
      </div>
    </div>
  );
}
