import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into ./drizzle; apply with `bun run db:migrate:local` / `db:migrate:remote`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
});
