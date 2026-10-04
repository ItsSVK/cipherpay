import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// NON-SECRET data only (see web/CLAUDE.md). No keys, no signatures from signMessage.
// Token amounts are stored as base-10 strings of base units (bigint-safe), never floats.

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

export const employees = sqliteTable(
  "employees",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employer: text("employer").notNull(), // admin wallet address
    name: text("name").notNull(),
    wallet: text("wallet").notNull(),
    amount: text("amount"), // base units, string
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("employees_employer_wallet").on(t.employer, t.wallet)],
);

export const payrollRuns = sqliteTable("payroll_runs", {
  id: text("id").primaryKey(), // uuid
  employer: text("employer").notNull(),
  // draft | pending_approval | approved | executing | done | failed
  status: text("status").notNull().default("draft"),
  createdAt: createdAt(),
});

export const payrollRunItems = sqliteTable("payroll_run_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id")
    .notNull()
    .references(() => payrollRuns.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(),
  amount: text("amount").notNull(), // base units, string
  // pending | proofs_ready | sent | confirmed | failed
  status: text("status").notNull().default("pending"),
  signature: text("signature"), // pay_employee tx signature (auditor view reads these)
  error: text("error"),
  updatedAt: createdAt(),
});
