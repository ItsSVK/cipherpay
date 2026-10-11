import { Assembly } from "@/components/landing/assembly";
import { Hero } from "@/components/landing/hero";
import { LensDemo } from "@/components/landing/lens-demo";
import { BackToTop, ClosingSection, DisclosureSection, FactsSection, JourneySection, LandingFooter, LandingNav, ViewersSection } from "@/components/landing/sections";

/*
 * THESIS: a confidential payment, shown being built. The page assembles one real payroll payment piece by piece as
 * you scroll (treasury, keys, proofs, encrypted transfer, the right key opening it), instead of a dark neon crypto hero.
 * OWN-WORLD: LANDING_DESIGN.md (white paper, Source Serif display at one weight with italic emphasis, ink pill pairs,
 * one peach card) around product fragments in the app's own language (indigo key, green decrypted, Cipher, Flow).
 * STORY: the public sees payroll happened, never how much; each employee and the auditor open what is theirs; funding
 * and withdrawal are public, and disclosure is the employee's choice. Then: launch the app.
 * FIRST VIEWPORT: centred two-line serif headline, subhead, Launch app + See a payment pills, four product fragments
 * floating at the corners (ciphertext ledger, a payment that opens, proof flow, approve & run composer), two cursors.
 */
export default function Home() {
  return (
    <div className="landing min-h-dvh">
      <LandingNav />
      <main>
        <Hero />
        <Assembly />
        <ViewersSection demo={<LensDemo />} />
        <JourneySection />
        <DisclosureSection />
        <FactsSection />
        <ClosingSection />
      </main>
      <LandingFooter />
      <BackToTop />
    </div>
  );
}
