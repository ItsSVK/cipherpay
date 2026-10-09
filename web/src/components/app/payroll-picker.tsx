"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckIcon, KeyRoundIcon, LockIcon, MoreVerticalIcon, PlusIcon, SearchIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { Cipher } from "@/components/crypto/cipher";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { sealedTotalPreview } from "@/lib/sealed-amount";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ProgressButton } from "@/components/app/progress-button";
import { useKeys } from "@/components/crypto/key-context";

const PEOPLE_SEARCH_FROM = 7;
const SAVED_HOLD_MS = 700;

/**
 * Create a payroll: a name, then the people from your saved addresses with what each is paid. Every saved address is one
 * row of a checklist; ticking it opens its amount field in place, so there is no dropdown and no "add row" step. The footer
 * stays in view with the running total, says plainly that amounts are encrypted before they leave the tab, and the save
 * button shows its own progress.
 */
export function AddPayroll({ onCreated, trigger, children }: { onCreated: (p: Payroll) => void; trigger?: React.ReactElement; children?: React.ReactNode }) {
  const v = useVault();
  const keys = useKeys();
  const saved = v.vault.employees;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [touched, setTouched] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  const values = new Map(picked.map((id) => [id, parseUsdc(amounts[id] ?? "")]));
  const amountError = (id: string) => {
    const value = values.get(id);
    return !value || value <= 0n ? "Enter an amount above zero, up to 6 decimals." : "";
  };
  const nameError = name.trim() ? "" : "Give this payroll a name.";
  const pickError = picked.length ? "" : "Pick at least one person.";
  const valid = !nameError && !pickError && picked.every((id) => !amountError(id));
  const total = picked.reduce((n, id) => n + (values.get(id) ?? 0n), 0n);
  const needsKeys = v.isLive && !keys.ready;

  const q = query.trim().toLowerCase();
  const shown = q ? saved.filter((a) => a.name.toLowerCase().includes(q) || a.wallet.toLowerCase().includes(q)) : saved;

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const reset = () => {
    setName("");
    setPicked([]);
    setAmounts({});
    setQuery("");
    setTouched(false);
    setState("idle");
  };

  const save = async () => {
    setTouched(true);
    if (!valid || state !== "idle") return;
    if (needsKeys) {
      keys.requireKeys();
      return;
    }
    setState("saving");
    try {
      const created = await v.addPayroll({ name: name.trim(), entries: picked.map((id) => ({ addressId: id, amount: values.get(id)! })) });
      setState("saved");
      toast.success(`Payroll "${created.name}" saved`, { description: `${created.entries.length} ${created.entries.length === 1 ? "person" : "people"}, ${formatUsdc(total)} USDC per run.` });
      onCreated(created);
      setTimeout(() => {
        setOpen(false);
        reset();
      }, SAVED_HOLD_MS);
    } catch (err) {
      toast.error("Couldn't save payroll", { description: err instanceof Error ? err.message : "Try again." });
      setState("idle");
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o && state !== "saving") reset();
      }}
    >
      <SheetTrigger render={trigger ?? <Button className="h-9 gap-1.5 text-xs font-medium" />}>
        {children ?? (
          <>
            <PlusIcon className="size-3.5" /> New payroll
          </>
        )}
      </SheetTrigger>
      <SheetContent className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="gap-0 border-b border-border/60 px-6 pt-6 pb-5">
          <div className="flex items-center gap-3 pr-8">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary shadow-2xs">
              <UsersIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold tracking-tight">New payroll</SheetTitle>
              <SheetDescription className="text-xs">Who you pay and how much. Run it whenever payday comes around.</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {saved.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
              <UsersIcon className="size-4" />
            </div>
            <p className="text-sm font-medium text-foreground">No saved addresses yet</p>
            <p className="max-w-60 text-xs text-muted-foreground">A payroll is built from the people in your address book. Add someone first.</p>
            <Link href="/admin/addresses" className={cn(buttonVariants(), "mt-1 h-9 px-4 text-xs")}>
              Go to addresses
            </Link>
          </div>
        ) : (
          <form
            id="add-payroll"
            className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="payroll-name" className="text-xs font-semibold">
                Name
              </Label>
              <Input
                id="payroll-name"
                value={name}
                placeholder="e.g. Engineering, Monthly salaries"
                onChange={(e) => setName(e.target.value)}
                aria-invalid={touched && !!nameError}
                className="h-10"
                maxLength={80}
                disabled={state !== "idle"}
              />
              {touched && nameError ? <p className="text-xs text-destructive">{nameError}</p> : null}
            </div>

            <div className="grid gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-foreground">
                  People <span className="ml-1 font-normal text-muted-foreground tnum">{picked.length} of {saved.length}</span>
                </p>
                <button
                  type="button"
                  disabled={state !== "idle"}
                  onClick={() => setPicked(picked.length === saved.length ? [] : saved.map((a) => a.id))}
                  className="text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
                >
                  {picked.length === saved.length ? "Clear all" : "Select all"}
                </button>
              </div>

              {touched && pickError ? <p className="-mt-1 text-xs text-destructive">{pickError}</p> : null}

              {saved.length >= PEOPLE_SEARCH_FROM ? (
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or address" aria-label="Search people" className="h-8 pl-8 text-xs" />
                </div>
              ) : null}

              <ul className="grid gap-1.5" aria-label="People to pay">
                {shown.map((a) => {
                  const on = picked.includes(a.id);
                  const err = touched && on ? amountError(a.id) : "";
                  return (
                    <li
                      key={a.id}
                      className={cn(
                        "rounded-xl border transition-[border-color,background-color] duration-200",
                        on ? "border-primary/40 bg-accent/30" : "border-border/80 bg-card hover:border-primary/25",
                        err && "border-destructive/40",
                      )}
                    >
                      <div className="flex items-center gap-2 py-1.5 pr-1.5 pl-1">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          disabled={state !== "idle"}
                          onClick={() => toggle(a.id)}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span
                            className={cn(
                              "grid size-[18px] shrink-0 place-items-center rounded-md border transition-colors duration-200",
                              on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
                            )}
                            aria-hidden
                          >
                            {on ? <CheckIcon className="size-3 [animation:pop_var(--dur-base)_var(--ease-out)]" strokeWidth={3.5} /> : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-foreground">{a.name}</span>
                            <span className="block font-mono text-[11px] text-muted-foreground tnum">{shortAddress(a.wallet)}</span>
                          </span>
                        </button>
                        {on ? (
                          <label className="enter-fade relative w-32 shrink-0">
                            <span className="sr-only">Amount for {a.name}, in USDC</span>
                            <Input
                              autoFocus
                              value={amounts[a.id] ?? ""}
                              inputMode="decimal"
                              placeholder="0.00"
                              disabled={state !== "idle"}
                              aria-invalid={!!err}
                              onChange={(e) => setAmounts((m) => ({ ...m, [a.id]: e.target.value }))}
                              className="h-9 pr-11 text-right font-mono text-sm tnum"
                            />
                            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground">USDC</span>
                          </label>
                        ) : null}
                      </div>
                      {err ? <p className="px-3.5 pb-2 text-[11px] text-destructive">{err}</p> : null}
                    </li>
                  );
                })}
                {shown.length === 0 ? <li className="px-1 py-3 text-xs text-muted-foreground">Nobody matches &ldquo;{query.trim()}&rdquo;.</li> : null}
              </ul>
            </div>
          </form>
        )}

        {saved.length > 0 ? (
          <SheetFooter className="mt-0 gap-3 border-t border-border/60 bg-muted/20 px-6 py-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] text-muted-foreground">
                  Total per run · {picked.length} {picked.length === 1 ? "person" : "people"}
                </p>
                <p className="font-mono text-xl font-bold tracking-tight text-foreground tnum">
                  {formatUsdc(total)} <span className="font-sans text-xs font-semibold text-muted-foreground">USDC</span>
                </p>
              </div>
            </div>
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <LockIcon className="mt-0.5 size-3 shrink-0" />
              {needsKeys ? "Unlock your keys to save. Amounts are encrypted with them before they leave this tab." : "Amounts are encrypted with your keys before they leave this tab. Only your wallet can read them."}
            </p>
            <ProgressButton
              form="add-payroll"
              onClick={() => void save()}
              progress={state === "saving" ? { label: "Encrypting & saving…", fill: 60 } : state === "saved" ? { label: "Saved", fill: 100, done: true } : null}
              className="h-11 w-full text-sm"
              idleClassName="bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
            >
              {needsKeys ? (
                <>
                  <KeyRoundIcon className="size-3.5" /> Unlock keys to save
                </>
              ) : (
                "Save payroll"
              )}
            </ProgressButton>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

const SEARCH_FROM = 6;

/**
 * "Your payrolls": the left column of the batch card. A vertical list scales to any number of payrolls (it scrolls inside
 * the column, and a search box appears once there are several), and "New" stays pinned at the top where it is always seen.
 * Choosing one fills the recipient list beside it. Totals are ciphertext until the keys are unlocked.
 */
export function PayrollRail({ selected, onSelect, revealed }: { selected: Payroll | null; onSelect: (id: string) => void; revealed: boolean }) {
  const v = useVault();
  const list = v.vault.payrolls;
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <p className="text-xs font-semibold text-foreground">
          Your payrolls <span className="ml-1 font-normal text-muted-foreground tnum">{list.length}</span>
        </p>
        <AddPayroll
          onCreated={(p) => onSelect(p.id)}
          trigger={<Button variant="outline" size="sm" className="h-7 gap-1 rounded-lg px-2.5 text-[11px] font-semibold" />}
        >
          <PlusIcon className="size-3" /> New
        </AddPayroll>
      </div>
      {list.length >= SEARCH_FROM ? (
        <div className="relative px-4 pb-2">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-6.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search payrolls" aria-label="Search payrolls" className="h-8 pl-7.5 text-xs" />
        </div>
      ) : null}
      <div role="radiogroup" aria-label="Payroll to run" className="grid max-h-72 content-start gap-1 overflow-y-auto px-2 pb-3 lg:max-h-[min(28rem,60vh)]">
        {shown.map((p, i) => {
          const on = p.id === selected?.id;
          const total = p.entries.reduce((n, e) => n + e.amount, 0n);
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onSelect(p.id)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-ring/50",
                on ? "bg-accent/60" : "hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-semibold transition-colors duration-200",
                  on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-foreground",
                )}
                aria-hidden
              >
                {initials(p.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[13px]", on ? "font-semibold text-foreground" : "font-medium text-foreground/85")}>{p.name}</span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="shrink-0">{p.entries.length} people ·</span>
                  {p.sealed && v.recordsStatus === "open" ? (
                    <span className="text-destructive">unreadable</span>
                  ) : (
                    <Cipher value={formatUsdc(total)} seed={`rail-${p.id}`} cipherText={sealedTotalPreview(p.entries.map((e) => e.amountCt))} revealed={revealed && !p.sealed} delay={i * 70} className="min-w-0 truncate text-[11px]" />
                  )}
                </span>
              </span>
              {on ? <CheckIcon className="size-3.5 shrink-0 text-primary [animation:pop_var(--dur-base)_var(--ease-out)]" strokeWidth={3} /> : null}
            </button>
          );
        })}
        {shown.length === 0 ? <p className="px-2.5 py-3 text-xs text-muted-foreground">No payroll matches &ldquo;{query.trim()}&rdquo;.</p> : null}
      </div>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map((w) => w.replace(/[^a-z0-9]/gi, "")[0]?.toUpperCase() ?? "")
    .join("") || "P";

/** Deletes the chosen payroll, behind a confirmation. Past runs made from it stay in history. */
export function DeletePayroll({ payroll, disabled }: { payroll: Payroll; disabled?: boolean }) {
  const v = useVault();
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" disabled={disabled} className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Actions for ${payroll.name}`} />}
        >
          <MoreVerticalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setOpen(true)} className="gap-2 text-xs text-destructive focus:bg-destructive/10 focus:text-destructive">
            <Trash2Icon className="size-3.5" /> Delete payroll
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this payroll?"
        description={`"${payroll.name}" will be deleted. Runs already made from it stay in your history.`}
        confirmLabel="Delete payroll"
        variant="destructive"
        onConfirm={async () => {
          try {
            await v.removePayroll(payroll.id);
            toast.success(`Payroll "${payroll.name}" deleted`);
          } catch (err) {
            toast.error("Couldn't delete payroll", { description: err instanceof Error ? err.message : "Try again." });
          }
        }}
      />
    </>
  );
}
