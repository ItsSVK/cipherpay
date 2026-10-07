"use client";

import Link from "next/link";
import { useState } from "react";
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useVault } from "@/components/app/vault-context";
import type { Payroll } from "@/lib/mock/data";
import { formatUsdc, parseUsdc, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Row { key: string; addressId: string | null; amount: string }
const newRow = (): Row => ({ key: crypto.randomUUID(), addressId: null, amount: "" });

/** Create a payroll: pick saved addresses from a list and give each an amount for this payroll. */
export function AddPayroll({ onCreated, trigger }: { onCreated: (p: Payroll) => void; trigger?: React.ReactElement }) {
  const v = useVault();
  const saved = v.vault.employees; // saved addresses
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const labelOf = (id: string) => { const a = saved.find((x) => x.id === id); return a ? `${a.name} (${shortAddress(a.wallet)})` : id; };
  const items = saved.map((a) => ({ value: a.id, label: labelOf(a.id) }));
  const taken = new Set(rows.flatMap((r) => (r.addressId ? [r.addressId] : [])));

  const parsed = rows.map((r) => ({ ...r, value: parseUsdc(r.amount) }));
  const rowError = (r: (typeof parsed)[number]) => (!r.addressId ? "Choose an address." : !r.value || r.value <= 0n ? "Enter an amount above zero (up to 6 decimals)." : "");
  const nameError = name.trim() ? "" : "Give this payroll a name.";
  const valid = !nameError && parsed.every((r) => !rowError(r));
  const total = parsed.reduce((n, r) => n + (r.value ?? 0n), 0n);

  const reset = () => { setName(""); setRows([newRow()]); setTouched(false); setSaving(false); };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger ?? <Button />}>
        <PlusIcon /> Add payroll
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-lg">Add a payroll</SheetTitle>
          <SheetDescription>Choose who is paid and how much each time this payroll runs. The same address can be in more than one payroll.</SheetDescription>
        </SheetHeader>
        {saved.length === 0 ? (
          <div className="px-4 text-sm text-muted-foreground">
            <p>You have no saved addresses yet.</p>
            <Link href="/admin/addresses" className={cn(buttonVariants(), "mt-4 h-10 px-5")}>Add an address first</Link>
          </div>
        ) : (
          <form
            id="add-payroll"
            className="grid gap-4 overflow-y-auto px-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setTouched(true);
              if (!valid || saving) return;
              setSaving(true);
              try {
                const created = await v.addPayroll({ name: name.trim(), entries: parsed.map((r) => ({ addressId: r.addressId!, amount: r.value! })) });
                toast.success(`${created.name} saved`, { description: `${created.entries.length} ${created.entries.length === 1 ? "address" : "addresses"}, ${formatUsdc(total)} USDC per run.` });
                onCreated(created);
                reset();
                setOpen(false);
              } catch (err) {
                toast.error("Couldn't save the payroll", { description: err instanceof Error ? err.message : "Try again." });
                setSaving(false);
              }
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="payroll-name">Payroll name</Label>
              <Input id="payroll-name" value={name} placeholder="Monthly payroll" onChange={(e) => setName(e.target.value)} aria-invalid={touched && !!nameError} className="h-10" maxLength={80} />
              <p className="min-h-4 text-xs text-destructive" style={{ opacity: touched && nameError ? 1 : 0 }}>{nameError}</p>
            </div>

            <div className="grid gap-3">
              <Label>Addresses and amounts (USDC)</Label>
              {parsed.map((r) => {
                const err = rowError(r);
                return (
                  <div key={r.key} className="grid gap-1">
                    <div className="flex items-center gap-2">
                      <Select value={r.addressId} items={items} onValueChange={(val) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, addressId: val as string } : x)))}>
                        <SelectTrigger className="h-10 min-w-0 flex-1" aria-label="Address" aria-invalid={touched && !r.addressId}>
                          <SelectValue placeholder="Choose an address" />
                        </SelectTrigger>
                        <SelectContent>
                          {saved.map((a) => (
                            <SelectItem key={a.id} value={a.id} disabled={taken.has(a.id) && r.addressId !== a.id}>{labelOf(a.id)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input value={r.amount} inputMode="decimal" placeholder="5,000" aria-label="Amount in USDC" aria-invalid={touched && !!err} className="h-10 w-28 text-right font-mono" onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, amount: e.target.value } : x)))} />
                      <Button type="button" variant="ghost" size="icon" aria-label="Remove this row" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><XIcon /></Button>
                    </div>
                    <p className="min-h-4 text-xs text-destructive" style={{ opacity: touched && err ? 1 : 0 }}>{err}</p>
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" className="w-fit" disabled={rows.length >= saved.length} onClick={() => setRows((rs) => [...rs, newRow()])}><PlusIcon /> Add another address</Button>
            </div>
            <p className="text-sm text-muted-foreground">Total per run: <span className="font-mono tnum text-foreground">{formatUsdc(total)} USDC</span></p>
          </form>
        )}
        <SheetFooter>
          <Button type="submit" form="add-payroll" className="h-10" disabled={saving || saved.length === 0}>{saving ? "Saving…" : "Save payroll"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Choose which payroll to run, add a new one, or delete the selected one. Locked while a run is in progress. */
export function PayrollPicker({ selected, onSelect, locked }: { selected: Payroll | null; onSelect: (id: string) => void; locked: boolean }) {
  const v = useVault();
  const list = v.vault.payrolls;
  const items = list.map((p) => ({ value: p.id, label: `${p.name} (${p.entries.length})` }));
  return (
    <div className="enter mb-5 flex flex-wrap items-center gap-2" style={{ ["--i" as string]: 1 }}>
      {list.length > 0 ? (
        <Select value={selected?.id ?? null} items={items} disabled={locked} onValueChange={(id) => onSelect(id as string)}>
          <SelectTrigger className="h-10 w-72 max-w-full" aria-label="Payroll to run"><SelectValue placeholder="Choose a payroll" /></SelectTrigger>
          <SelectContent>
            {list.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.entries.length})</SelectItem>)}
          </SelectContent>
        </Select>
      ) : null}
      <AddPayroll onCreated={(p) => onSelect(p.id)} trigger={<Button variant={list.length ? "outline" : "default"} className="h-10" disabled={locked} />} />
      {selected ? (
        <Button
          variant="ghost"
          className="h-10"
          disabled={locked}
          onClick={() => {
            v.removePayroll(selected.id).then(
              () => toast(`${selected.name} deleted`, { description: "Past runs stay in your history." }),
              (err) => toast.error("Couldn't delete it", { description: err instanceof Error ? err.message : "Try again." }),
            );
          }}
        >
          <Trash2Icon /> Delete payroll
        </Button>
      ) : null}
    </div>
  );
}
