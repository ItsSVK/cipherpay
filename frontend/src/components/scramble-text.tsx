import { useEffect, useRef, useState } from "react"
import { randomCiphertext } from "@/lib/demo"

interface ScrambleTextProps {
  active: boolean
  length?: number
  intervalMs?: number
  className?: string
  settledText?: string
}

export function ScrambleText({
  active,
  length = 44,
  intervalMs = 45,
  className,
  settledText,
}: ScrambleTextProps) {
  const [text, setText] = useState(() => randomCiphertext(length))

  useEffect(() => {
    if (!active) {
      if (settledText) setText(settledText)
      return
    }
    const id = window.setInterval(() => {
      setText(randomCiphertext(length))
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [active, length, intervalMs, settledText])

  return <span className={className}>{text}</span>
}

interface RevealAmountProps {
  from: string
  to: string
  durationMs?: number
  className?: string
}

/** Cross-fades a scrambled ciphertext string into a real plaintext value, character by character. */
export function RevealAmount({
  from,
  to,
  durationMs = 900,
  className,
}: RevealAmountProps) {
  const [display, setDisplay] = useState(from)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    let frame: number
    const step = (t: number) => {
      if (startRef.current === null) startRef.current = t
      const elapsed = t - startRef.current
      const progress = Math.min(1, elapsed / durationMs)
      const settledCount = Math.floor(progress * to.length)
      const settled = to.slice(0, settledCount)
      const noise = Array.from(
        { length: Math.max(0, to.length - settledCount) },
        () => randomCiphertext(1),
      ).join("")
      setDisplay(settled + noise)
      if (progress < 1) {
        frame = requestAnimationFrame(step)
      } else {
        setDisplay(to)
      }
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [to, durationMs])

  return <span className={className}>{display}</span>
}
