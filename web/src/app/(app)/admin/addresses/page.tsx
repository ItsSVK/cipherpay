"use client";

import { useMemo, useState } from "react";
import { PlusIcon, SearchIcon, Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react";
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
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { DisclosureCard } from "@/components/app/disclosure-card";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function AddAddress({ onAdd, company }: { onAdd: (a: { name: string; wallet: string }) => Promise<void>; company: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const errors = {
    name: name.trim() ? "" : "Enter a recipient name.",
    wallet: BASE58.test(wallet.trim()) ? "" : "Paste a valid Solana address (32 to 44 base58 characters).",
  };
  const valid = !errors.name && !errors.wallet;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button className="h-9 gap-1.5 text-xs font-medium" />}>
        <PlusIcon className="size-3.5" /> Add Address
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-serif font-normal tracking-[-0.015em] text-[1.375rem]">Add saved address</SheetTitle>
          <SheetDescription>
            Saved to your company directory. Payout amounts are chosen when you create or execute payroll.
          </SheetDescription>
        </SheetHeader>
        <form
          id="add-address"
          className="grid gap-4 px-4 py-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setTouched(true);
            if (!valid || saving) return;
            setSaving(true);
            try {
              await onAdd({ name: name.trim(), wallet: wallet.trim() });
            } catch (err) {
              toast.error("Couldn't add address", { description: err instanceof Error ? err.message : "Try again." });
              setSaving(false);
              return;
            }
            toast.success(`${name.trim()} added to directory`, {
              description: "Send them the invite link so they can activate their confidential account.",
              action: {
                label: "Copy invite",
                onClick: () => {
                  void copyInvite(company).then((ok) => toast(ok ? "Invite link copied" : "Could not copy link"));
                },
              },
            });
            setName("");
            setWallet("");
            setTouched(false);
            setSaving(false);
            setOpen(false);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="addr-name">Recipient Name</Label>
            <Input
              id="addr-name"
              value={name}
              placeholder="e.g. Jordan Lee"
              onChange={(e) => setName(e.target.value)}
              aria-invalid={touched && !!errors.name}
              className="h-10"
            />
            {touched && errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="addr-wallet">Solana Wallet Address</Label>
            <Input
              id="addr-wallet"
              value={wallet}
              placeholder="e.g. 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
              onChange={(e) => setWallet(e.target.value)}
              aria-invalid={touched && !!errors.wallet}
              className="h-10 font-mono text-xs"
            />
            {touched && errors.wallet ? <p className="text-xs text-destructive">{errors.wallet}</p> : null}
          </div>
        </form>
        <SheetFooter>
          <Button type="submit" form="add-address" className="h-10 w-full" disabled={saving}>
            <UserPlusIcon className="mr-1.5 size-4" /> {saving ? "Saving…" : "Save to Directory"}
          </Button>
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const filtered = useMemo(
    () => rows.filter((e) => `${e.name} ${e.wallet}`.toLowerCase().includes(q.toLowerCase())),
    [rows, q]
  );
  const pending = rows.filter((e) => !v.isActivated(e.wallet)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saved Addresses"
        description={`${rows.length} team member${rows.length === 1 ? "" : "s"} in directory. Stored off-chain and mapped to confidential token accounts.`}
        actions={<AddAddress onAdd={v.addAddress} company={v.vault.name} />}
      />

      {pending > 0 ? (
        <div className="enter flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pending/30 bg-pending-soft/70 px-4 py-3 text-xs text-pending" style={{ ["--i" as string]: 1 }}>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-pending [animation:dot-pulse_1.5s_ease-in-out_infinite]" />
            <span>
              {pending} recipient{pending === 1 ? " has" : "s have"} not yet activated their confidential account and cannot be paid until activated.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-pending/30 bg-card text-xs text-pending hover:bg-pending-soft"
            onClick={() => {
              void copyInvite(v.vault.name).then((ok) => toast(ok ? "Invite instructions copied" : "Could not copy"));
            }}
          >
            Copy Activation Invite
          </Button>
        </div>
      ) : null}

      <div className="plate enter overflow-hidden" style={{ ["--i" as string]: 2 }}>
        <div className="border-b p-3 bg-muted/20">
          <div className="relative max-w-sm">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or Solana address…"
              aria-label="Search addresses"
              className="h-9 pl-9 text-xs"
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="size-5" />}
            title="No addresses saved"
            description="Add your team members to the directory so you can include them in confidential payroll runs."
            action={<AddAddress onAdd={v.addAddress} company={v.vault.name} />}
          />
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            No recipients matching &ldquo;{q}&rdquo;.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 text-xs">Name</TableHead>
                <TableHead className="text-xs">Solana Address</TableHead>
                <TableHead className="text-right text-xs">Account Status</TableHead>
                <TableHead className="w-12 pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e, i) => (
                <TableRow key={e.id} className="row-hover enter" style={{ ["--i" as string]: Math.min(i, 8) }}>
                  <TableCell className="pl-5">
                    <p className="font-medium text-sm text-foreground">{e.name}</p>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 font-mono text-xs">
                      <Address value={e.wallet} />
                      <CopyButton value={e.wallet} label={`Copy ${e.name}'s address`} />
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {v.isActivated(e.wallet) ? (
                      <StatusBadge tone="verified">Activated</StatusBadge>
                    ) : (
                      <span className="inline-flex flex-wrap items-center justify-end gap-2">
                        <StatusBadge tone="pending" className="text-[10.5px]">Pending setup</StatusBadge>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-primary hover:text-primary"
                          onClick={() => {
                            void copyInvite(v.vault.name).then((ok) => toast(ok ? `Invite for ${e.name} copied` : "Could not copy"));
                          }}
                        >
                          Send invite
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
                      onClick={() => setDeleteTarget({ id: e.id, name: e.name })}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <DisclosureCard
        title="Directory Storage & Privacy"
        description="How address mappings and recipient names are preserved securely."
      >
        <p className="mb-2">
          Recipient names and wallet pairings are held in encrypted local or database storage, tied strictly to your company&apos;s vault administrator wallet.
        </p>
        <p>
          On-chain, only anonymous Token-2022 confidential accounts interact. The public cannot associate recipient identities with confidential transaction logs.
        </p>
      </DisclosureCard>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove Saved Address?"
        description={`Are you sure you want to remove ${deleteTarget?.name ?? "this address"} from your saved directory? They can be re-added anytime.`}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await v.removeAddress(deleteTarget.id);
            toast.success(`${deleteTarget.name} removed from directory`);
          } catch (err) {
            toast.error("Couldn't remove address", { description: err instanceof Error ? err.message : "Try again." });
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
