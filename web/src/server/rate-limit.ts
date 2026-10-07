import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { NextRequest } from "next/server";
import { jsonError } from "./http";

/**
 * Who the request is from, for rate limiting. On Cloudflare this is the real client address in `cf-connecting-ip`, which Cloudflare sets
 * itself and a caller cannot forge. Locally there is no such header, so everything shares one bucket, which is fine for development.
 */
const clientKey = (request: NextRequest) => request.headers.get("cf-connecting-ip") ?? "local";

/**
 * Applies the per-IP limit to an unauthenticated route. Returns a 429 response when the caller is over the limit, or null to carry on.
 * `scope` keeps the routes in separate buckets (so a burst of nonce requests doesn't eat into someone else's verify).
 *
 * If the limiter binding is missing, development carries on, but production refuses: a security limit that silently stops applying is
 * worse than a sign-in outage that someone notices and fixes.
 */
export async function rateLimited(request: NextRequest, scope: string): Promise<Response | null> {
  const limiter = getCloudflareContext().env.AUTH_LIMITER;
  if (!limiter) {
    if (process.env.NODE_ENV === "production") {
      console.error("AUTH_LIMITER binding is missing: refusing unauthenticated requests until it is configured in wrangler.jsonc.");
      return jsonError("Sign-in is temporarily unavailable.", 503);
    }
    return null;
  }
  const { success } = await limiter.limit({ key: `${scope}:${clientKey(request)}` });
  if (success) return null;
  const res = jsonError("Too many sign-in attempts. Wait a minute and try again.", 429);
  res.headers.set("Retry-After", "60");
  return res;
}
