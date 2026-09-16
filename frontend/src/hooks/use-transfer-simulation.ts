import { useCallback, useRef, useState } from "react"
import {
  PROOFS,
  RECIPIENT,
  SENDER,
  STEPS,
  randomCiphertext,
  type StepId,
  type StepStatus,
} from "@/lib/demo"

export type ProofStatus = "pending" | "active" | "verified"

export interface LogEntry {
  id: number
  text: string
  kind: "info" | "success" | "muted"
}

export type SimPhase = "idle" | "running" | "awaiting-disclosure" | "done"

interface State {
  phase: SimPhase
  amount: number | null
  autoDisclose: boolean
  stepStatuses: Record<StepId, StepStatus>
  proofStatuses: Record<string, ProofStatus>
  ciphertext: string
  senderPublicBalance: number
  senderConfidentialBalance: number
  recipientConfidentialBalance: number
  recipientRevealedAmount: number | null
  log: LogEntry[]
}

const INITIAL_SENDER_PUBLIC = 1240.5
const INITIAL_SENDER_CONFIDENTIAL = 500
const INITIAL_RECIPIENT_CONFIDENTIAL = 120

function initialStepStatuses(): Record<StepId, StepStatus> {
  return Object.fromEntries(STEPS.map((s) => [s.id, "pending"])) as Record<
    StepId,
    StepStatus
  >
}

function initialProofStatuses(): Record<string, ProofStatus> {
  return Object.fromEntries(
    PROOFS.map((p) => [p.id, "pending"]),
  ) as Record<string, ProofStatus>
}

function initialState(): State {
  return {
    phase: "idle",
    amount: null,
    autoDisclose: false,
    stepStatuses: initialStepStatuses(),
    proofStatuses: initialProofStatuses(),
    ciphertext: randomCiphertext(44),
    senderPublicBalance: INITIAL_SENDER_PUBLIC,
    senderConfidentialBalance: INITIAL_SENDER_CONFIDENTIAL,
    recipientConfidentialBalance: INITIAL_RECIPIENT_CONFIDENTIAL,
    recipientRevealedAmount: null,
    log: [],
  }
}

const delay = (ms: number, signal: { cancelled: boolean }) =>
  new Promise<void>((resolve) => {
    const id = window.setTimeout(() => resolve(), ms)
    if (signal.cancelled) {
      window.clearTimeout(id)
      resolve()
    }
  })

export function useTransferSimulation() {
  const [state, setState] = useState<State>(initialState)
  const cancelRef = useRef({ cancelled: false })
  const logIdRef = useRef(0)

  const pushLog = useCallback((text: string, kind: LogEntry["kind"] = "info") => {
    logIdRef.current += 1
    setState((s) => ({
      ...s,
      log: [...s.log, { id: logIdRef.current, text, kind }],
    }))
  }, [])

  const setStep = useCallback((id: StepId, status: StepStatus) => {
    setState((s) => ({
      ...s,
      stepStatuses: { ...s.stepStatuses, [id]: status },
    }))
  }, [])

  const reset = useCallback(() => {
    cancelRef.current.cancelled = true
    cancelRef.current = { cancelled: false }
    setState(initialState())
  }, [])

  const start = useCallback(
    async (amount: number, autoDisclose: boolean) => {
      cancelRef.current.cancelled = true
      const signal = { cancelled: false }
      cancelRef.current = signal
      logIdRef.current = 0

      setState((s) => ({
        ...initialState(),
        senderPublicBalance: s.senderPublicBalance,
        phase: "running",
        amount,
        autoDisclose,
      }))
      pushLog(`Preparing confidential transfer of ${amount.toFixed(2)} USDC to ${RECIPIENT.name}`, "muted")

      // 1. Encrypt
      setStep("encrypt", "active")
      pushLog("Deriving ElGamal keypair from wallet signature…", "info")
      await delay(500, signal)
      if (signal.cancelled) return
      pushLog("Encrypting amount client-side (plaintext never leaves device)", "info")
      await delay(700, signal)
      if (signal.cancelled) return
      const ciphertext = randomCiphertext(44)
      setState((s) => ({ ...s, ciphertext }))
      setStep("encrypt", "done")
      pushLog("Amount encrypted", "success")

      // 2. Proofs
      setStep("proofs", "active")
      for (const proof of PROOFS) {
        setState((s) => ({
          ...s,
          proofStatuses: { ...s.proofStatuses, [proof.id]: "active" },
        }))
        pushLog(`Generating ${proof.label.toLowerCase()}…`, "info")
        await delay(520, signal)
        if (signal.cancelled) return
        setState((s) => ({
          ...s,
          proofStatuses: { ...s.proofStatuses, [proof.id]: "verified" },
        }))
        pushLog(`${proof.label} verified`, "success")
      }
      setStep("proofs", "done")

      // 3. Submit
      setStep("submit", "active")
      pushLog("Submitting transfer instruction to Token-2022 confidential transfer…", "info")
      await delay(1500, signal)
      if (signal.cancelled) return
      setStep("submit", "done")
      pushLog("Transaction confirmed on-chain — ledger stored ciphertext only", "success")

      // 4. Settle
      setStep("settle", "active")
      await delay(500, signal)
      if (signal.cancelled) return
      setState((s) => ({
        ...s,
        senderPublicBalance: s.senderPublicBalance,
        senderConfidentialBalance: s.senderConfidentialBalance - amount,
        recipientConfidentialBalance: s.recipientConfidentialBalance + amount,
      }))
      pushLog(`${RECIPIENT.name}'s encrypted balance updated`, "success")
      await delay(400, signal)
      if (signal.cancelled) return
      setStep("settle", "done")

      // 5. Disclosure
      setStep("disclose", "active")
      if (autoDisclose) {
        pushLog(`${RECIPIENT.name} is revealing the received amount…`, "info")
        await delay(700, signal)
        if (signal.cancelled) return
        setState((s) => ({ ...s, recipientRevealedAmount: amount }))
        setStep("disclose", "done")
        pushLog(`${RECIPIENT.name} disclosed ${amount.toFixed(2)} USDC received`, "success")
        setState((s) => ({ ...s, phase: "done" }))
      } else {
        pushLog(
          `${RECIPIENT.name}'s balance stays encrypted until they choose to disclose it`,
          "muted",
        )
        setState((s) => ({ ...s, phase: "awaiting-disclosure" }))
      }
    },
    [pushLog, setStep],
  )

  const disclose = useCallback(async () => {
    if (state.amount === null) return
    const signal = cancelRef.current
    pushLog(`${RECIPIENT.name} is revealing the received amount…`, "info")
    await delay(600, signal)
    if (signal.cancelled) return
    setState((s) => ({
      ...s,
      recipientRevealedAmount: s.amount,
      phase: "done",
    }))
    setStep("disclose", "done")
    pushLog(`${RECIPIENT.name} disclosed ${state.amount.toFixed(2)} USDC received`, "success")
  }, [state.amount, pushLog, setStep])

  return {
    state,
    start,
    reset,
    disclose,
    sender: SENDER,
    recipient: RECIPIENT,
  }
}
