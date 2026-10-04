import Link from "next/link";
import { cn } from "@/lib/utils";

/** Mark: a ledger square whose centre line is cut by a key notch. Flat, one colour. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={cn("size-7", className)} aria-hidden>
      <rect x="1" y="1" width="26" height="26" rx="7" fill="var(--primary)" />
      <path d="M8 10.5h12M8 14h12M8 17.5h5" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.95" />
      <circle cx="19.2" cy="17.5" r="2.3" fill="white" />
    </svg>
  );
}

export function Brand({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5 rounded-md", className)}>
      <BrandMark className="transition-transform duration-500 ease-out-expo group-hover:rotate-[-6deg] group-hover:scale-105" />
      <span className="font-display text-[17px] font-semibold tracking-tight">Cipherpay</span>
    </Link>
  );
}
