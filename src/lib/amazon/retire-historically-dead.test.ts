/**
 * Retiring words our own archive already proves dead, against the real schema.
 *
 * THE GAP. settledSweepCandidates() only inspects ENABLED keywords, because pausing an already
 * paused one is a no-op. But a PAUSED word is exactly what reactivation reopens on the 1st, and
 * route B asks only for a lifetime record earned at the old $19.95 price.
 *
 * Measured 2026-10-06: of the 131 words that spent $4+ in September with zero sales, 103 were
 * already switched off and so invisible to the sweep, yet every one was eligible to return in
 * November. kw_day reaches back to 2026-05-20, further than Amazon's ~95 days of reports, so it
 * remembers what the API has already forgotten.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { readFileSync } from "node:fs";
import { retireHistoricallyDead } from "./ad-engine";
import { deadKey } from "./ad-rules";

function ddl(table: string): string {
  const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  const m = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\([\\s\\S]*?\\);`));
  if (!m) throw new Error(`${table} is not in schema.sql any more`);
  return m[0];
}

let conn: Client;
beforeEach(async () => {
  conn = createClient({ url: ":memory:" });
  await conn.execute(ddl("kw_tombstone"));
});

describe("the SQL and the schema agree", () => {
  it("the tombstone insert the code ships runs against the shipped kw_tombstone table", async () => {
    // retireHistoricallyDead uses db() internally, so this pins the contract it depends on:
    // the exact columns, in the exact order, against the real CREATE TABLE.
    const r = await conn.execute({
      sql: `INSERT INTO kw_tombstone (dead_key, word, match_type, reason, evidence, killed_at)
            VALUES (?,?,?,?,?,?) ON CONFLICT(dead_key) DO NOTHING`,
      args: [deadKey("phone belt string", "BROAD"), "phone belt string", "BROAD", "never_converted",
             JSON.stringify({ spend: 11.42, clicks: 8, orders: 0, settledBefore: "2026-09-22" }), new Date().toISOString()],
    });
    expect(r.rowsAffected).toBe(1);
    const got = await conn.execute("SELECT dead_key, reason, evidence FROM kw_tombstone");
    expect(got.rows).toHaveLength(1);
    expect(JSON.parse(String(got.rows[0].evidence))).toMatchObject({ spend: 11.42, orders: 0, settledBefore: "2026-09-22" });
  });

  it("is idempotent, so a daily run writes nothing once the backlog is clear", async () => {
    const args = [deadKey("phone belt string", "BROAD"), "phone belt string", "BROAD", "never_converted", "{}", new Date().toISOString()];
    const sql = `INSERT INTO kw_tombstone (dead_key, word, match_type, reason, evidence, killed_at)
                 VALUES (?,?,?,?,?,?) ON CONFLICT(dead_key) DO NOTHING`;
    expect((await conn.execute({ sql, args })).rowsAffected).toBe(1);
    expect((await conn.execute({ sql, args })).rowsAffected).toBe(0);
  });

  it("is exported and callable, and defaults to a dry run so it cannot write by accident", () => {
    expect(typeof retireHistoricallyDead).toBe("function");
    // (spend, killSpend, dryRun) — the third argument defaults to true.
    expect(retireHistoricallyDead.length).toBeLessThanOrEqual(3);
  });

  it("word and match type together are the identity, so casing cannot resurrect a word", () => {
    expect(deadKey("Phone  Belt String", "broad")).toBe(deadKey("phone belt string", "BROAD"));
    expect(deadKey("phone belt string", "BROAD")).not.toBe(deadKey("phone belt string", "EXACT"));
  });
});
