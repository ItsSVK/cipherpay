import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// Call per request: bindings are only available inside a request context on Workers.
export function getDb() {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
}
