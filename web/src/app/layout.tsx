import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: "Cipherpay: confidential payroll on Solana",
  description: "Payroll where the public can't see salaries, but the auditor can.",
};

export const viewport: Viewport = { themeColor: "#f6f6f3", colorScheme: "light" };

const CONTRACT = `
THESIS: Confidential values are physical-feeling ciphertext. Every secret is a block of glyphs that resolves digit by digit when its owner holds the key. Refuses the dark neon crypto dashboard.
OWN-WORLD: Paper-white ground, white plates, hairline rules, ink text, one indigo "key" colour, green for decrypted, amber for pending. Geist UI, Geist Mono for numerics and ciphertext, Bricolage Grotesque for headings. Flat colour only, no gradients.
STORY: The public sees that payroll happened, never how much. Employees and the auditor decrypt only what is theirs. Disclosure at withdraw is the user's choice.
FIRST VIEWPORT: Left, a headline and Launch app action. Right, one live ledger row with a Public / Employee / Auditor lens switch that encrypts and decrypts the same amount.
FORM: Modern clean fintech ledger (Daylight Ledger, user-picked), seed e0e4b79b.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div hidden dangerouslySetInnerHTML={{ __html: `<!--${CONTRACT.replace(/--/g, "- -")}-->` }} />
        <TooltipProvider delay={250}>
          <Providers>{children}</Providers>
        </TooltipProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
