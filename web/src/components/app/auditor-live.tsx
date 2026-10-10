"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { address, getAddressDecoder, getAddressEncoder, type Address } from "@solana/kit";
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, HistoryIcon, KeyRoundIcon, LockIcon, ScanSearchIcon, ScrollTextIcon, ShieldCheckIcon, VaultIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ProgressButton, type ButtonProgress } from "@/components/app/progress-button";
import { Reveal } from "@/components/app/run-payroll-parts";
import { CopyButton } from "@/components/app/copy-button";
import { Cipher } from "@/components/crypto/cipher";
import { Flow, type FlowState, type FlowStep } from "@/components/crypto/flow";
import { Address as AddressText } from "@/components/crypto/fingerprint";
import { findVaultPda } from "@/generated/vault/src/generated";
import { checkAuditorSecret, fetchAuditorPayments, openAuditorPayments, parseAuditorSecret, resolveTokenOwners, type AuditorPayment } from "@/lib/chain/auditor-decrypt";
import { DEVNET_WUSDC_MINT } from "@/lib/chain/constants";
import { readAuditorPubkey } from "@/lib/chain/read";
import { rpc } from "@/lib/chain/rpc";
import { cipherPreview, formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Payments shown per page. Each page is decrypted when it is first shown, so paging forward opens only what you look at. */
const PAGE_SIZE = 10;
/** Delay between rows of one page as they decrypt, so a page opens as a wave (DESIGN.md, Cipher). */
const WAVE_MS = 80;
/** The ciphertext is on screen at least this long before it opens, so a fast decrypt still reads as encrypted → decrypted. */
const MIN_SEALED_MS = 350;

interface Row extends AuditorPayment {
  id: string;
  /** The recipient's wallet where the chain could say, else null. */
  owner: Address | null;
  /** undefined = not decrypted yet; null = does not open under this key. */
  amount?: bigint | null;
}

interface History {
  rows: Row[];
  /** Signature to read older transactions before; null once the vault's whole history has been read. */
  before: string | null;
  done: boolean;
  /** Transactions looked at so far (including ones that were not payments). */
  scanned: number;
}

interface Session {
  admin: Address;
  vault: Address;
  /** The mint's auditor ElGamal public key. Typed as an address only because that is how the mint reports the 32 bytes. */
  auditor: Address;
}

/** Steps of opening the log, in order. They are the Flow nodes and the button's label. */
const STEPS = [
  { key: "key", label: "Check key", icon: <KeyRoundIcon />, doing: "Checking the key against the mint's registered auditor key…" },
  { key: "vault", label: "Find vault", icon: <VaultIcon />, doing: "Deriving the employer's vault address…" },
  { key: "read", label: "Read history", icon: <HistoryIcon />, doing: "Reading the vault's transactions from devnet…" },
] as const;

const EMPTY: History = { rows: [], before: null, done: false, scanned: 0 };

const when = (t: number | null) => (t === null ? "Time unknown" : new Date(t * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
const explorer = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const nextFrames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** An ElGamal key in base64, the form the program, CLI and SDK print it in (the mint reports it typed as an address). */
const toBase64 = (key: Address) => btoa(String.fromCharCode(...getAddressEncoder().encode(key)));
/** wasm-bindgen can throw bare strings, so read whatever was thrown. */
const messageOf = (e: unknown) => (e instanceof Error ? e.message : typeof e === "string" && e ? e : "Something went wrong reading the chain.");

/**
 * The real auditor view: decrypts the payments of one vault from the chain with the auditor's ElGamal secret. The secret lives in a ref
 * for as long as the page is unlocked (never state, storage or a request) and is zeroed on lock and on leaving the page.
 */
export function LiveAuditor() {
  const [employer, setEmployer] = useState("");
  const [secretText, setSecretText] = useState("");
  /** Index into STEPS while opening; -1 when not opening. */
  const [step, setStep] = useState(-1);
  const [failedStep, setFailedStep] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<History>(EMPTY);
  const [page, setPage] = useState(0);
  /** What the list is doing for the page being opened. */
  const [listBusy, setListBusy] = useState<null | "reading" | "decrypting">(null);
  const [listError, setListError] = useState<string | null>(null);

  const secretRef = useRef<Uint8Array | null>(null);
  const historyRef = useRef<History>(EMPTY);
  const runRef = useRef(0);
  const listRef = useRef<HTMLElement>(null);

  const commit = (h: History) => {
    historyRef.current = h;
    setHistory(h);
  };
  const wipe = () => {
    secretRef.current?.fill(0);
    secretRef.current = null;
  };
  useEffect(
    () => () => {
      runRef.current += 1;
      wipe();
    },
    [],
  );

  const lock = () => {
    runRef.current += 1;
    wipe();
    commit(EMPTY);
    setSession(null);
    setPage(0);
    setListBusy(null);
    setListError(null);
    setSecretText("");
    setError(null);
    setFailedStep(null);
    setStep(-1);
  };

  /** Reads older transactions until there are at least `count` payments or the history ends. False if a newer action took over. */
  async function readUntil(vault: Address, count: number, stale: () => boolean): Promise<boolean> {
    let h = historyRef.current;
    while (h.rows.length < count && !h.done) {
      const chunk = await fetchAuditorPayments(rpc, vault, { before: h.before ?? undefined });
      if (stale()) return false;
      const owners = await resolveTokenOwners(
        rpc,
        chunk.payments.map((p) => p.employeeTokenAccount),
      );
      if (stale()) return false;
      const base = h.rows.length;
      const fresh = chunk.payments.map((p, i): Row => ({ ...p, id: `${p.signature}:${base + i}`, owner: owners[p.employeeTokenAccount] ?? null }));
      h = { rows: [...h.rows, ...fresh], before: chunk.nextBefore, done: chunk.nextBefore === null, scanned: h.scanned + chunk.scanned };
      commit(h);
    }
    return true;
  }

  /** Decrypts the rows of page `n` that are still sealed. They are already on screen as ciphertext; opening them plays the wave. */
  async function openPage(n: number, stale: () => boolean) {
    const sealed = historyRef.current.rows.slice(n * PAGE_SIZE, (n + 1) * PAGE_SIZE).filter((r) => r.amount === undefined);
    const secret = secretRef.current;
    if (!sealed.length || !secret) return;
    setListBusy("decrypting");
    const started = performance.now();
    await nextFrames();
    const amounts = await openAuditorPayments(sealed, secret);
    const left = MIN_SEALED_MS - (performance.now() - started);
    if (left > 0) await sleep(left);
    if (stale() || !secretRef.current) return;
    const opened = new Map(sealed.map((r, i) => [r.id, amounts[i]]));
    commit({ ...historyRef.current, rows: historyRef.current.rows.map((r) => (opened.has(r.id) ? { ...r, amount: opened.get(r.id) } : r)) });
  }

  async function unlock() {
    const mine = ++runRef.current;
    const stale = () => mine !== runRef.current;
    let at = 0;
    setError(null);
    setFailedStep(null);
    setStep(0);
    try {
      let admin: Address;
      try {
        admin = address(employer.trim());
      } catch {
        throw new Error("That doesn't look like a wallet address. Paste the employer's admin wallet.");
      }
      const secret = parseAuditorSecret(secretText);
      if (!secret) throw new Error("The auditor secret should be 32 bytes, as base64, hex or a JSON array.");
      const onMint = await readAuditorPubkey(rpc);
      if (stale()) return secret.fill(0);
      if (getAddressDecoder().decode(secret) === onMint) {
        secret.fill(0);
        throw new Error("That is the auditor PUBLIC key (the one on the mint). Paste the matching secret key instead.");
      }
      let matches: boolean;
      try {
        matches = await checkAuditorSecret(secret, onMint);
      } catch (e) {
        secret.fill(0);
        throw e;
      }
      if (!matches) {
        secret.fill(0);
        throw new Error(`This is not the secret behind the auditor key on the WUSDC mint (${toBase64(onMint)}), so it cannot decrypt these payments.`);
      }
      wipe();
      secretRef.current = secret;
      setSecretText("");

      at = 1;
      setStep(1);
      const [vault] = await findVaultPda({ admin, mint: address(DEVNET_WUSDC_MINT) });
      if (stale()) return;

      at = 2;
      setStep(2);
      commit(EMPTY);
      if (!(await readUntil(vault, PAGE_SIZE, stale))) return;

      // The log is open: the list shows page 1 as ciphertext, then decrypts it in place.
      setPage(0);
      setSession({ admin, vault, auditor: onMint });
      setStep(-1);
    } catch (e) {
      if (stale()) return;
      wipe();
      setFailedStep(at);
      setStep(-1);
      setError(messageOf(e));
      return;
    }
    try {
      await openPage(0, stale);
    } catch (e) {
      if (!stale()) setListError(e instanceof Error ? e.message : "Couldn't decrypt this page.");
    } finally {
      if (!stale()) setListBusy(null);
    }
  }

  async function goTo(n: number) {
    if (!session || n < 0) return;
    const mine = ++runRef.current;
    const stale = () => mine !== runRef.current;
    setListError(null);
    try {
      if (historyRef.current.rows.length < (n + 1) * PAGE_SIZE && !historyRef.current.done) {
        setListBusy("reading");
        if (!(await readUntil(session.vault, (n + 1) * PAGE_SIZE, stale))) return;
      }
      if (n * PAGE_SIZE >= historyRef.current.rows.length && n > 0) {
        // The history ended exactly on the previous page: there is nothing further back.
        setListBusy(null);
        return;
      }
      setPage(n);
      const top = listRef.current?.getBoundingClientRect().top;
      if (top !== undefined && top < 0) listRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      await openPage(n, stale);
    } catch (e) {
      if (stale()) return;
      setListError(messageOf(e));
    } finally {
      if (!stale()) setListBusy(null);
    }
  }

  const unlocked = session !== null;
  const opening = step >= 0;
  const rows = history.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(history.rows.length / PAGE_SIZE));
  const hasOlder = (page + 1) * PAGE_SIZE < history.rows.length || !history.done;
  const opened = useMemo(() => history.rows.filter((r) => r.amount !== undefined), [history.rows]);
  const total = useMemo(() => opened.reduce((n, r) => n + (r.amount ?? 0n), 0n), [opened]);
  const unreadable = opened.filter((r) => r.amount === null).length;
  const decrypting = listBusy === "decrypting";
  const auditorB64 = useMemo(() => (session ? toBase64(session.auditor) : ""), [session]);

  const flowSteps: FlowStep[] = STEPS.map((s, i) => {
    let state: FlowState = "idle";
    if (failedStep !== null) state = i < failedStep ? "done" : i === failedStep ? "error" : "idle";
    else if (opening) state = i < step ? "done" : i === step ? "active" : "idle";
    return { key: s.key, label: s.label, icon: s.icon, state };
  });
  const progress: ButtonProgress | null = opening ? { label: STEPS[step].label + "…", fill: ((step + 1) / (STEPS.length + 1)) * 100 } : null;

  const listBadge = !unlocked ? (
    <StatusBadge tone="key">Encrypted on-chain</StatusBadge>
  ) : listBusy === "reading" ? (
    <StatusBadge tone="key" pulse>
      Reading devnet…
    </StatusBadge>
  ) : decrypting ? (
    <StatusBadge tone="key" pulse>
      Decrypting…
    </StatusBadge>
  ) : (
    <StatusBadge tone="verified">Decrypted locally</StatusBadge>
  );

  return (
    <div className="space-y-2">
      <PageHeader
        title="Audit log"
        description="Decrypt the payment amounts of one vault straight from devnet with the mint's auditor key. Everything happens in this tab."
        badge={unlocked ? <StatusBadge tone="verified">Auditor key matched</StatusBadge> : null}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)] lg:items-start">
        {/* Work: the vault's payments, one page at a time. */}
        <div className="grid min-w-0 gap-4">
          <section ref={listRef} className="plate enter relative scroll-mt-6 overflow-hidden p-0" style={{ ["--i" as string]: 1 }} aria-label="Payments">
            <div className="flex items-center justify-between gap-3 p-5 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary shadow-2xs">
                  <ScrollTextIcon className="size-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">Payments</h2>
                  <p className="truncate text-[11px] text-muted-foreground">
                    Every <span className="font-mono">pay_employee</span> this vault received, newest first
                  </p>
                </div>
              </div>
              {listBadge}
            </div>

            {/* A hairline track that sweeps while the list is working on real chain or decrypt work. */}
            <div aria-hidden className="relative h-px overflow-hidden bg-border/70">
              {listBusy || opening ? <span className="absolute inset-y-0 left-0 w-1/3 bg-primary/70" style={{ animation: "sweep 1.3s var(--ease-out) infinite" }} /> : null}
            </div>

            {!unlocked ? (
              <ListMessage
                icon={step === 2 ? <HistoryIcon className="size-5" /> : <LockIcon className="size-5" />}
                title={step === 2 ? "Reading the vault's history" : "Payments appear here, encrypted"}
                body={
                  step === 2
                    ? `${plural(history.scanned, "transaction")} read so far. Amounts stay sealed until the key opens them.`
                    : "Give the employer wallet and the auditor key. Each amount is read from devnet as ciphertext and opened in this tab."
                }
                busy={step === 2}
              />
            ) : history.rows.length === 0 ? (
              <ListMessage
                icon={<ShieldCheckIcon className="size-5" />}
                title="No payments in this vault's history"
                body={`Read all ${plural(history.scanned, "transaction")} of this vault. None of them was a pay_employee.`}
              />
            ) : listBusy === "reading" ? (
              <ListMessage
                icon={<HistoryIcon className="size-5" />}
                title="Reading older transactions"
                body={`${plural(history.scanned, "transaction")} read so far. Page ${page + 2} decrypts as soon as it arrives.`}
                busy
              />
            ) : (
              <>
                <div className="hidden grid-cols-[1.25fr_1fr_minmax(9rem,0.9fr)] gap-4 border-b border-border/60 bg-muted/30 px-5 py-2 text-[11px] font-medium text-muted-foreground sm:px-6 md:grid">
                  <span>Recipient</span>
                  <span className="flex items-center gap-1">
                    Transaction
                    <InfoTooltip content="Each amount comes from the pay_employee instruction in this transaction. Its auditor ciphertexts are what is decrypted." />
                  </span>
                  <span className="text-right">Amount</span>
                </div>
                <ul className="divide-y divide-border/60" aria-busy={decrypting}>
                  {rows.map((r, i) => (
                    <li
                      key={`${page}:${r.id}`}
                      className={cn(
                        "enter row-hover grid gap-x-4 gap-y-1.5 px-5 py-3.5 sm:px-6 md:grid-cols-[1.25fr_1fr_minmax(9rem,0.9fr)] md:items-center",
                        r.amount === null && "bg-failed-soft/50",
                      )}
                      style={{ ["--i" as string]: Math.min(i, 8) }}
                    >
                      <div className="min-w-0">
                        <AddressText value={r.owner ?? r.employeeTokenAccount} head={6} tail={6} className="text-[13px] text-foreground" />
                        <p className="truncate text-[11px] text-muted-foreground">
                          {r.owner ? "Wallet" : "Token account"} · {r.signer === session.admin ? "paid by the employer" : "paid by the payroll operator"}
                        </p>
                      </div>
                      <div className="flex min-w-0 items-baseline justify-between gap-3 md:block">
                        <a
                          href={explorer(r.signature)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-xs text-primary underline-offset-4 tnum hover:underline"
                        >
                          {r.signature.slice(0, 6)}…{r.signature.slice(-4)} <ExternalLinkIcon className="size-3" />
                        </a>
                        <p className="text-[11px] text-muted-foreground">{when(r.blockTime)}</p>
                      </div>
                      <div className="flex items-center md:justify-end">
                        {r.amount === null ? (
                          <StatusBadge tone="failed">Doesn&apos;t decrypt</StatusBadge>
                        ) : (
                          <Cipher
                            value={r.amount === undefined ? "sealed" : formatUsdc(r.amount)}
                            seed={r.id}
                            cipherText={cipherPreview(r.lo)}
                            revealed={r.amount !== undefined}
                            delay={i * WAVE_MS}
                            suffix="USDC"
                            size="row"
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-5 py-3 sm:px-6" aria-label="Pages">
                  <p className="text-[11px] text-muted-foreground" aria-live="polite">
                    <span className="font-medium text-foreground">
                      Page {page + 1}
                      {history.done ? ` of ${pages}` : ""}
                    </span>{" "}
                    · payments {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + rows.length}
                    {history.done ? "" : " · older history still on devnet"}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-8 gap-1 px-2.5 text-xs" onClick={() => goTo(page - 1)} disabled={page === 0 || !!listBusy}>
                      <ChevronLeftIcon className="size-3.5" /> Newer
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1 px-2.5 text-xs" onClick={() => goTo(page + 1)} disabled={!hasOlder || !!listBusy}>
                      Older <ChevronRightIcon className="size-3.5" />
                    </Button>
                  </div>
                </nav>
              </>
            )}

            {listError ? (
              <p role="alert" className="border-t border-destructive/30 bg-failed-soft px-5 py-3 text-xs text-destructive sm:px-6">
                {listError}
              </p>
            ) : null}
          </section>

        <p className="px-1 text-[11.5px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">What is public and what is not.</span> Recipients, signers and times are public on devnet. Amounts are encrypted and are opened
          here with the auditor key; they are what the program was given to move, and recipients&apos; balances stay encrypted to them. Covers every top-level{" "}
          <span className="font-mono">pay_employee</span>, made through this app or not. Withdrawals and unwraps are already public and are not shown.
        </p>
        </div>

        {/* Control: the auditor key, then the session it opened. */}
        <aside className={cn("plate enter p-5 sm:p-6 lg:sticky lg:top-6", !unlocked && "order-first lg:order-none")} style={{ ["--i" as string]: 2 }} aria-label="Auditor key">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-verified/10 text-verified shadow-2xs">
                <KeyRoundIcon className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">Auditor key</h2>
                <p className="truncate text-[11px] text-muted-foreground">{unlocked ? "Opened in this tab" : "The mint's registered auditor"}</p>
              </div>
            </div>
            {unlocked ? (
              <StatusBadge tone="verified">Unlocked</StatusBadge>
            ) : opening ? (
              <StatusBadge tone="key" pulse>
                Opening…
              </StatusBadge>
            ) : (
              <StatusBadge>Locked</StatusBadge>
            )}
          </div>

          <Reveal open={!unlocked}>
            <form
              className="grid gap-4 pt-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!opening && employer.trim() && secretText.trim()) void unlock();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="auditor-employer" className="text-xs font-semibold">
                  Employer wallet
                </Label>
                <Input
                  id="auditor-employer"
                  value={employer}
                  onChange={(e) => setEmployer(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="The admin wallet that owns the vault"
                  className="h-9 font-mono text-xs"
                  disabled={opening}
                />
                <p className="text-[11px] text-muted-foreground">Public. The vault address is derived from it.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="auditor-secret-live" className="text-xs font-semibold">
                  Auditor secret key
                </Label>
                <Input
                  id="auditor-secret-live"
                  type="password"
                  value={secretText}
                  onChange={(e) => setSecretText(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="32 bytes as base64, hex or a JSON array"
                  className="h-9 font-mono text-xs"
                  disabled={opening}
                />
                <p className="text-[11px] text-muted-foreground">Checked against the key on the mint before anything is read.</p>
              </div>

              <Reveal open={opening || failedStep !== null}>
                <div className="rounded-2xl border border-border/80 bg-muted/20 p-4">
                  <Flow steps={flowSteps} label="Opening the audit log" className="justify-between" />
                  <p className={cn("mt-3 text-center text-[11px] leading-relaxed", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : "status"}>
                    {error ?? (opening ? STEPS[step].doing : "")}
                  </p>
                </div>
              </Reveal>

              <ProgressButton
                progress={progress}
                onClick={() => void unlock()}
                disabled={!employer.trim() || !secretText.trim()}
                className="h-11 w-full text-sm"
                idleClassName="bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
              >
                <ScanSearchIcon className="size-4" /> Decrypt payments
              </ProgressButton>
            </form>
          </Reveal>

          <Reveal open={unlocked}>
            {session ? (
              <div className="grid gap-4 pt-5">
                <div className="space-y-2.5 rounded-2xl border border-border/80 bg-muted/20 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Decrypted so far</span>
                    <StatusBadge tone={decrypting ? "key" : "verified"} pulse={decrypting}>
                      {decrypting ? "Decrypting…" : "Opened here"}
                    </StatusBadge>
                  </div>
                  <Cipher value={formatUsdc(total)} seed={`audit-total-${session.vault}`} revealed={opened.length > 0} suffix="USDC" size="hero" />
                  <p className="text-[11px] text-muted-foreground">
                    {plural(opened.length - unreadable, "payment")} in {plural(history.scanned, "transaction")} read
                    {unreadable ? ` · ${unreadable} did not decrypt` : ""}
                    {history.done ? " · whole history" : ""}
                  </p>
                </div>

                <dl className="grid gap-2.5 text-xs">
                  {(
                    [
                      ["Employer", session.admin],
                      ["Vault", session.vault],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="flex min-w-0 items-center gap-1">
                        <AddressText value={value} head={5} tail={5} className="text-xs text-foreground" />
                        <CopyButton value={value} label={`Copy ${label.toLowerCase()} address`} />
                      </dd>
                    </div>
                  ))}
                </dl>

                {/* Not an account: the ElGamal key on the mint. Shown in base64, the form the program, CLI and SDK print ElGamal keys in. */}
                <div className="grid gap-1 border-t border-border/50 pt-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      Auditor public key
                      <InfoTooltip content="The ElGamal key registered on the WUSDC mint. Every payment's amount is also encrypted to it, and your secret matched it. It is an encryption key, not a wallet." />
                    </span>
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="font-mono text-xs text-foreground tnum" title={auditorB64}>
                        {auditorB64.slice(0, 6)}…{auditorB64.slice(-6)}
                      </span>
                      <CopyButton value={auditorB64} label="Copy auditor public key" />
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Encryption key on the mint, shared by every employer on WUSDC.</p>
                </div>

                <Button onClick={lock} variant="outline" className="h-10 w-full gap-1.5 text-xs font-semibold">
                  <LockIcon className="size-3.5" /> Lock and clear
                </Button>
              </div>
            ) : null}
          </Reveal>

          <p className="mt-5 flex items-start gap-1.5 border-t border-border/50 pt-4 text-[11px] leading-relaxed text-muted-foreground">
            <LockIcon className="mt-0.5 size-3 shrink-0" />
            The key is held in this tab&apos;s memory only, never stored or sent, and is wiped on lock or when you leave.
          </p>
        </aside>
      </div>
    </div>
  );
}

/** The list area's single message: what to do, or what is being read. Not a nested card: icon, title and one sentence in the plate. */
function ListMessage({ icon, title, body, busy }: { icon: ReactNode; title: string; body: string; busy?: boolean }) {
  return (
    <div className="enter-fade flex min-h-[300px] flex-col items-center justify-center px-6 py-12 text-center" role={busy ? "status" : undefined} aria-busy={busy}>
      <div className="relative grid size-12 place-items-center">
        {busy ? <span aria-hidden className="absolute inset-0 rounded-2xl bg-primary/15" style={{ animation: "orb-ripple 1.8s var(--ease-out) infinite" }} /> : null}
        <span className={cn("relative grid size-12 place-items-center rounded-2xl border", busy ? "border-primary/15 bg-accent text-accent-foreground" : "border-border bg-muted/40 text-muted-foreground")}>{icon}</span>
      </div>
      <h3 className="mt-4 text-sm font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
