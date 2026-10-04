"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Runs through `count` steps on a timer. MOCK stand-in for sequential transaction sends. */
export function useStepper(count: number, stepMs = 1000, onDone?: () => void) {
  const [completed, setCompleted] = useState(0);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const run = useCallback(() => {
    stop();
    setCompleted(0);
    setRunning(true);
    const advance = (n: number) => {
      timer.current = setTimeout(() => {
        setCompleted(n + 1);
        if (n + 1 >= count) {
          setRunning(false);
          doneRef.current?.();
        } else advance(n + 1);
      }, stepMs + (n % 2) * 220);
    };
    advance(0);
  }, [count, stepMs]);

  const reset = useCallback(() => {
    stop();
    setRunning(false);
    setCompleted(0);
  }, []);

  return { completed, running, done: completed >= count, run, reset };
}
