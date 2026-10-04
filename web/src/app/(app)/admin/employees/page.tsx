"use client";

import { useMemo, useState } from "react";
import { PlusIcon, SearchIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Address } from "@/components/crypto/fingerprint";
import { CopyButton } from "@/components/app/copy-button";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { useVault } from "@/components/app/vault-context";
import type { Employee } from "@/lib/mock/data";
import { formatUsdc, parseUsdc } from "@/lib/format";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function AddEmployee({ onAdd }: { onAdd: (e: Employee) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [salary, setSalary] = useState("");
  const [touched, setTouched] = useState(false);
  const amount = parseUsdc(salary);
  const errors = {
    name: name.trim() ? "" : "Enter a name.",
    wallet: BASE58.test(wallet.trim()) ? "" : "Paste a valid Solana address (32 to 44 characters).",
    salary: amount && amount > 0n ? "" : "Enter an amount greater than zero, up to 6 decimals.",
  };
  const valid = !errors.name && !errors.wallet && !errors.salary;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>
        <PlusIcon /> Add employee
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-lg">Add an employee</SheetTitle>
          <SheetDescription>Saved in your payroll list. The employee must activate their account before they can be paid.</SheetDescription>
        </SheetHeader>
        <form
          id="add-employee"
          className="grid gap-4 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!valid || amount === null) return;
            onAdd({ id: crypto.randomUUID(), name: name.trim(), role: "Team member", wallet: wallet.trim(), salary: amount });
            toast.success(`${name.trim()} added`, { description: "Share the activation link so they can set up their account." });
            setName(""); setWallet(""); setSalary(""); setTouched(false); setOpen(false);
          }}
        >
          {[
            { id: "emp-name", label: "Name", value: name, set: setName, error: errors.name, ph: "Jordan Lee", mode: undefined },
            { id: "emp-wallet", label: "Wallet address", value: wallet, set: setWallet, error: errors.wallet, ph: "Solana address", mode: undefined },
            { id: "emp-salary", label: "Amount per run (USDC)", value: salary, set: setSalary, error: errors.salary, ph: "5,000", mode: "decimal" as const },
          ].map((f) => (
            <div key={f.id} className="grid gap-1.5">
              <Label htmlFor={f.id}>{f.label}</Label>
              <Input id={f.id} value={f.value} inputMode={f.mode} placeholder={f.ph} onChange={(e) => f.set(e.target.value)} aria-invalid={touched && !!f.error} className="h-10" />
              <p className="min-h-4 text-xs text-destructive transition-opacity duration-200" style={{ opacity: touched && f.error ? 1 : 0 }}>{f.error}</p>
            </div>
          ))}
        </form>
        <SheetFooter>
          <Button type="submit" form="add-employee" className="h-10"><UserPlusIcon /> Add to payroll</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function EmployeesPage() {
  const v = useVault();
  const rows = v.vault.employees;
  const [q, setQ] = useState("");
  const filtered = useMemo(() => rows.filter((e) => `${e.name} ${e.role} ${e.wallet}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const total = rows.reduce((n, e) => n + e.salary, 0n);
  const pending = rows.filter((e) => !v.isActivated(e.wallet)).length;

  return (
    <>
      <PageHeader
        title="Employees"
        description={`${rows.length} people, ${formatUsdc(total)} USDC per run. Names and amounts here are your own records, stored off-chain.`}
        actions={<AddEmployee onAdd={v.addEmployee} />}
      />
      {pending > 0 ? (
        <p className="enter mb-4 rounded-lg border border-pending/25 bg-pending-soft px-3.5 py-2.5 text-[13.5px] text-pending" style={{ ["--i" as string]: 1 }}>
          {pending} {pending === 1 ? "person has" : "people have"} not activated an account yet and will be skipped until they do.
        </p>
      ) : null}
      <div className="plate enter overflow-hidden" style={{ ["--i" as string]: 2 }}>
        <div className="border-b p-3">
          <div className="relative max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or address" aria-label="Search employees" className="h-9 pl-8" />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Name</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead className="text-right">Per run</TableHead>
              <TableHead className="pr-5 text-right">Account</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e, i) => (
              <TableRow key={e.id} className="row-hover enter" style={{ ["--i" as string]: Math.min(i, 8) }}>
                <TableCell className="pl-5">
                  <p className="font-medium">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.role}</p>
                </TableCell>
                <TableCell><span className="inline-flex items-center gap-1"><Address value={e.wallet} /><CopyButton value={e.wallet} label={`Copy ${e.name}'s address`} /></span></TableCell>
                <TableCell className="text-right font-mono tnum">{formatUsdc(e.salary)}</TableCell>
                <TableCell className="pr-5 text-right">
                  <StatusBadge tone={v.isActivated(e.wallet) ? "verified" : "pending"}>{v.isActivated(e.wallet) ? "Activated" : "Not activated"}</StatusBadge>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={4} className="py-12 text-center text-muted-foreground">{rows.length === 0 ? "No one on payroll yet. Add your first employee." : <>No one matches &ldquo;{q}&rdquo;.</>}</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
