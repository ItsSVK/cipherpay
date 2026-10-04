import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Keep this empty until the WASM proof worker is proven (see CLAUDE.md "Where the WASM bites").
};

export default nextConfig;

// Exposes Cloudflare bindings (D1, env) to `next dev`.
initOpenNextCloudflareForDev();
