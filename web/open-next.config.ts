import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache override yet: the app is wallet-gated and dynamic.
// Add R2/KV caching here only if we start using ISR/`use cache`.
export default defineCloudflareConfig();
