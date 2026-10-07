"use client";

import Link from "next/link";
import { useState } from "react";
import { LayersIcon, MoreVerticalIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useVault } from "@/components/app/vault-context";
import type { Payroll } from "@/lib/mock/data";
import { formatUsdc, parseUsdc, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface Row { key: string; addressId: string | null; amount: string }
const newRow = (): Row => ({ key: crypto.randomUUID(), addressId: null, amount: "" });

/** Create a payroll template: pick saved addresses and assign payout amounts. */
export function AddPayroll({ onCreated, trigger }: { onCreated: (p: Payroll) => void; trigger?: React.ReactElement }) {
  const v = useVault();
  const saved = v.vault.employees;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const labelOf = (id: string) => {
    const a = saved.find((x) => x.id === id);
    return a ? `${a.name} (${shortAddress(a.wallet)})` : id;
  };
  const items = saved.map((a) => ({ value: a.id, label: labelOf(a.id) }));
  const taken = new Set(rows.flatMap((r) => (r.addressId ? [r.addressId] : [])));

  const parsed = rows.map((r) => ({ ...r, value: parseUsdc(r.amount) }));
  const rowError = (r: (typeof parsed)[number]) =>
    !r.addressId ? "Choose an address." : !r.value || r.value <= 0n ? "Enter an amount above zero (up to 6 decimals)." : "";
  const nameError = name.trim() ? "" : "Give this template a name.";
  const valid = !nameError && parsed.every((r) => !rowError(r));
  const total = parsed.reduce((n, r) => n + (r.value ?? 0n), 0n);

  const reset = () => {
    setName("");
    setRows([newRow()]);
    setTouched(false);
    setSaving(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger ?? <Button className="h-9 gap-1.5 text-xs font-medium" />}>
        <PlusIcon className="size-3.5" /> New Template
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-lg">Create Payroll Template</SheetTitle>
          <SheetDescription>
            Group saved addresses into a recurring distribution batch with predefined USDC allocations.
          </SheetDescription>
        </SheetHeader>
        {saved.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            <p>You have no saved addresses in your directory yet.</p>
            <Link href="/admin/addresses" className={cn(buttonVariants(), "mt-4 h-10 px-5")}>
              Add an address first
            </Link>
          </div>
        ) : (
          <form
            id="add-payroll"
            className="grid gap-4 overflow-y-auto px-4 py-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setTouched(true);
              if (!valid || saving) return;
              setSaving(true);
              try {
                const created = await v.addPayroll({
                  name: name.trim(),
                  entries: parsed.map((r) => ({ addressId: r.addressId!, amount: r.value! })),
                });
                toast.success(`Template "${created.name}" created`, {
                  description: `${created.entries.length} recipients, ${formatUsdc(total)} USDC total.`,
                });
                onCreated(created);
                reset();
                setOpen(false);
              } catch (err) {
                toast.error("Couldn't save template", { description: err instanceof Error ? err.message : "Try again." });
                setSaving(false);
              }
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="payroll-name">Template Name</Label>
              <Input
                id="payroll-name"
                value={name}
                placeholder="e.g. Core Engineering, October Payout"
                onChange={(e) => setName(e.target.value)}
                aria-invalid={touched && !!nameError}
                className="h-10"
                maxLength={80}
              />
              {touched && nameError ? <p className="text-xs text-destructive">{nameError}</p> : null}
            </div>

            <div className="grid gap-3 pt-2">
              <div className="flex items-center justify-between">
                <Label>Recipients & Allocations (USDC)</Label>
                <span className="font-mono text-xs font-semibold tnum text-foreground">
                  Total: {formatUsdc(total)} USDC
                </span>
              </div>
              {parsed.map((r) => {
                const err = rowError(r);
                return (
                  <div key={r.key} className="grid gap-1 rounded-xl border bg-muted/20 p-2.5">
                    <div className="flex items-center gap-2">
                      <Select
                        value={r.addressId}
                        items={items}
                        onValueChange={(val) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, addressId: val as string } : x)))}
                      >
                        <SelectTrigger className="h-9 min-w-0 flex-1 text-xs" aria-label="Address">
                          <SelectValue placeholder="Select team member" />
                        </SelectTrigger>
                        <SelectContent>
                          {saved.map((a) => (
                            <SelectItem key={a.id} value={a.id} disabled={taken.has(a.id) && r.addressId !== a.id}>
                              {labelOf(a.id)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={r.amount}
                        inputMode="decimal"
                        placeholder="5,000"
                        aria-label="Amount in USDC"
                        className="h-9 w-28 text-right font-mono text-xs"
                        onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, amount: e.target.value } : x)))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove recipient row"
                        disabled={rows.length === 1}
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        className="size-8 text-muted-foreground hover:text-destructive"
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    </div>
                    {touched && err ? <p className="text-xs text-destructive">{err}</p> : null}
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit text-xs"
                disabled={rows.length >= saved.length}
                onClick={() => setRows((rs) => [...rs, newRow()])}
              >
                <PlusIcon className="mr-1 size-3" /> Add Recipient
              </Button>
            </div>
          </form>
        )}
        <SheetFooter>
          <Button type="submit" form="add-payroll" className="h-10 w-full" disabled={saving || saved.length === 0}>
            {saving ? "Saving Template…" : "Save Template"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Modern batch template selection bar with integrated actions menu. */
export function PayrollPicker({ selected, onSelect, locked }: { selected: Payroll | null; onSelect: (id: string) => void; locked: boolean }) {
  const v = useVault();
  const list = v.vault.payrolls;
  const items = list.map((p) => ({ value: p.id, label: `${p.name} (${p.entries.length} recipients)` }));
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleDelete = async () => {
    if (!selected) return;
    try {
      await v.removePayroll(selected.id);
      toast.success(`Template "${selected.name}" deleted`);
    } catch (err) {
      toast.error("Couldn't delete template", { description: err instanceof Error ? err.message : "Try again." });
    }
  };

  if (list.length === 0) return null;

  return (
    <>
      <div className="enter rounded-xl border border-border/80 bg-card/70 p-3 sm:px-4 shadow-2xs backdrop-blur-sm" style={{ ["--i" as string]: 1 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <LayersIcon className="size-3.5 text-primary" />
              <span>Active Template:</span>
            </div>
            <Select
              value={selected?.id ?? null}
              items={items}
              disabled={locked}
              onValueChange={(id) => onSelect(id as string)}
            >
              <SelectTrigger className="h-9 w-60 sm:w-72 bg-background font-medium text-xs shadow-2xs" aria-label="Select payroll template">
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                {list.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.entries.length} recipients)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selected ? (
              <span className="hidden sm:inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {selected.entries.length} recipients
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <AddPayroll
              onCreated={(p) => onSelect(p.id)}
              trigger={
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium" disabled={locked}>
                  <PlusIcon className="size-3" /> New Template
                </Button>
              }
            />

            {selected ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={locked}
                      className="size-8 text-muted-foreground hover:text-foreground"
                      aria-label="Template actions"
                    />
                  }
                >
                  <MoreVerticalIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive text-xs gap-2"
                  >
                    <Trash2Icon className="size-3.5" /> Delete Template
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Payroll Template?"
        description={`Are you sure you want to delete "${selected?.name}"? Past completed payroll runs will remain safely in your history.`}
        confirmLabel="Delete Template"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
