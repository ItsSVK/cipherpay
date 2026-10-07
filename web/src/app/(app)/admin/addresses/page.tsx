"use client";

import { useMemo, useState } from "react";
import { PlusIcon, SearchIcon, Trash2Icon, UserPlusIcon } from "lucide-react";
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
import { PayrollGate } from "@/components/data/payroll-gate";
import { useVault } from "@/components/app/vault-context";
import { copyInvite } from "@/lib/payroll/invite";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function AddAddress({ onAdd, company }: { onAdd: (a: { name: string; wallet: string }) => Promise<void>; company: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const errors = {
    name: name.trim() ? "" : "Enter a name.",
    wallet: BASE58.test(wallet.trim()) ? "" : "Paste a valid Solana address (32 to 44 characters).",
  };
  const valid = !errors.name && !errors.wallet;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>
        <PlusIcon /> Add address
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-lg">Add an address</SheetTitle>
          <SheetDescription>Saved to your list. You choose the amount each time you run payroll. The owner must activate their account before they can be paid.</SheetDescription>
        </SheetHeader>
        <form
          id="add-address"
          className="grid gap-4 px-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setTouched(true);
            if (!valid || saving) return;
            setSaving(true);
            try {
              await onAdd({ name: name.trim(), wallet: wallet.trim() });
            } catch (err) {
              // Saved to the database for real wallets, so this can legitimately fail: duplicate address, signed out, offline.
              toast.error("Couldn't add it", { description: err instanceof Error ? err.message : "Try again." });
              setSaving(false);
              return;
            }
            toast.success(`${name.trim()} added`, {
              description: "They need to set up their account once before they can be paid. Send them the invite.",
              action: { label: "Copy invite", onClick: () => { void copyInvite(company).then((ok) => toast(ok ? "Invite copied" : "Could not copy. Select the text manually.")); } },
            });
            setName(""); setWallet(""); setTouched(false); setSaving(false); setOpen(false);
          }}
        >
          {[
            { id: "addr-name", label: "Name", value: name, set: setName, error: errors.name, ph: "Jordan Lee" },
            { id: "addr-wallet", label: "Address", value: wallet, set: setWallet, error: errors.wallet, ph: "Solana address" },
          ].map((f) => (
            <div key={f.id} className="grid gap-1.5">
              <Label htmlFor={f.id}>{f.label}</Label>
              <Input id={f.id} value={f.value} placeholder={f.ph} onChange={(e) => f.set(e.target.value)} aria-invalid={touched && !!f.error} className="h-10" />
              <p className="min-h-4 text-xs text-destructive transition-opacity duration-200" style={{ opacity: touched && f.error ? 1 : 0 }}>{f.error}</p>
            </div>
          ))}
        </form>
        <SheetFooter>
          <Button type="submit" form="add-address" className="h-10" disabled={saving}><UserPlusIcon /> {saving ? "Saving…" : "Save address"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function AddressesPage() {
  return (
    <PayrollGate title="Addresses">
      <Addresses />
    </PayrollGate>
  );
}

function Addresses() {
  const v = useVault();
  const rows = v.vault.employees;
  const [q, setQ] = useState("");
  const filtered = useMemo(() => rows.filter((e) => `${e.name} ${e.wallet}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const pending = rows.filter((e) => !v.isActivated(e.wallet)).length;

  return (
    <>
      <PageHeader
        title="Addresses"
        description={`${rows.length} saved ${rows.length === 1 ? "address" : "addresses"}. Names and addresses here are your own records, stored off-chain. Amounts are chosen when you run payroll.`}
        actions={<AddAddress onAdd={v.addAddress} company={v.vault.name} />}
      />
      {pending > 0 ? (
        <p className="enter mb-4 rounded-lg border border-pending/25 bg-pending-soft px-3.5 py-2.5 text-[13.5px] text-pending" style={{ ["--i" as string]: 1 }}>
          {pending} {pending === 1 ? "person has" : "people have"} not set up an account yet, so they can&apos;t be paid and will be skipped until they do. Use Copy invite to tell them how.
        </p>
      ) : null}
      <div className="plate enter overflow-hidden" style={{ ["--i" as string]: 2 }}>
        <div className="border-b p-3">
          <div className="relative max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or address" aria-label="Search addresses" className="h-9 pl-8" />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead className="text-right">Account</TableHead>
              <TableHead className="w-12 pr-4"><span className="sr-only">Remove</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e, i) => (
              <TableRow key={e.id} className="row-hover enter" style={{ ["--i" as string]: Math.min(i, 8) }}>
                <TableCell className="pl-5">
                  <p className="font-medium">{e.name}</p>
                </TableCell>
                <TableCell><span className="inline-flex items-center gap-1"><Address value={e.wallet} /><CopyButton value={e.wallet} label={`Copy ${e.name}'s address`} /></span></TableCell>
                <TableCell className="text-right">
                  {v.isActivated(e.wallet) ? (
                    <StatusBadge tone="verified">Activated</StatusBadge>
                  ) : (
                    <span className="inline-flex flex-wrap items-center justify-end gap-2">
                      <StatusBadge tone="pending">Not activated, can&apos;t be paid yet</StatusBadge>
                      <Button size="sm" variant="outline" onClick={() => { void copyInvite(v.vault.name).then((ok) => toast(ok ? `Invite for ${e.name} copied` : "Could not copy. Select the text manually.")); }}>
                        Copy invite
                      </Button>
                    </span>
                  )}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${e.name}`}
                    title={`Remove ${e.name}`}
                    onClick={() => {
                      v.removeAddress(e.id).then(
                        () => toast(`${e.name} removed from your addresses`),
                        (err) => toast.error("Couldn't remove it", { description: err instanceof Error ? err.message : "Try again." }),
                      );
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={4} className="py-12 text-center text-muted-foreground">{rows.length === 0 ? "No addresses saved yet. Add your first address." : <>No one matches &ldquo;{q}&rdquo;.</>}</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
