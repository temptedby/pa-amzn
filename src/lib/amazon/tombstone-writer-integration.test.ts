/**
 * PROOF that the tombstone writer works, run against the REAL schema.
 *
 * William 2026-10-06: "please prove it".
 *
 * Deploying is not proof. The writer only fires on a fresh kill with zero orders, and the 14:42
 * engine run after the deploy made 5 bid moves and no kills, so production had nothing to exercise
 * it with. Rather than claim a deploy as evidence, this drives the ACTUAL recordTombstones()
 * against an in-memory libsql database whose kw_tombstone table is created from
 * src/lib/db/schema.sql itself, not from a copy pasted here.
 *
 * That last part is what makes it proof rather than decoration: if the shipped INSERT and the
 * shipped schema ever disagree on a column name, type or NOT NULL, this test fails. A hand-copied
 * CREATE TABLE in the test file would pass happily while production threw.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { readFileSync } from "node:fs";
import { recordTombstones } from "./ad-engine";
import { deadKey } from "./ad-rules";

/** The kw_tombstone DDL, lifted out of the real schema file so code and schema are tested together. */
function realTombstoneDdl(): string {
  const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  const m = sql.match(/CREATE TABLE IF NOT EXISTS kw_tombstone\s*\([\s\S]*?\);/);
  if (!m) throw new Error("kw_tombstone is not in schema.sql any more");
  return m[0];
}

let conn: Client;
beforeEach(async () => {
  conn = createClient({ url: ":memory:" });
  await conn.execute(realTombstoneDdl());
});

const killed = (keywordId: string, text: string, matchType: string, spend: number, applied?: boolean) =>
  ({ keywordId, text, matchType, spend, ...(applied === undefined ? {} : { applied }) });
const perf = (spend: number, orders: number, sales: number) => ({ spend, orders, sales, clicks: 0 });

describe("recordTombstones, against the schema that actually ships", () => {
  it("writes a row for a word that spent the bar and never converted", async () => {
    // "retractable lanyard phone" EXACT: $5.71 spent in September, 4 clicks, zero sales.
    const n = await recordTombstones(
      [killed("k1", "retractable lanyard phone", "EXACT", 5.71)],
      new Map([["k1", perf(5.71, 0, 0)]]),
      conn,
    );
    expect(n).toBe(1);

    const r = await conn.execute("SELECT dead_key, word, match_type, reason, evidence FROM kw_tombstone");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].dead_key).toBe(deadKey("retractable lanyard phone", "EXACT"));
    expect(r.rows[0].word).toBe("retractable lanyard phone");
    expect(r.rows[0].reason).toBe("never_converted");
    // the evidence is what justified it, so a human can audit the decision later
    expect(JSON.parse(String(r.rows[0].evidence))).toMatchObject({ spend: 5.71, orders: 0 });
  });

  it("does NOT write a row for a word that converted, even badly", async () => {
    // "cell phone retractable tether" EXACT: $6.91 -> $9.49, 1.37x. Off for the month, not retired.
    const n = await recordTombstones(
      [killed("k2", "cell phone retractable tether", "EXACT", 6.91)],
      new Map([["k2", perf(6.91, 1, 9.49)]]),
      conn,
    );
    expect(n).toBe(0);
    expect((await conn.execute("SELECT 1 FROM kw_tombstone")).rows).toHaveLength(0);
  });

  it("does NOT write a row when Amazon refused the kill", async () => {
    // applied === false means the word is still ENABLED. Tombstoning it would record our intent as
    // if it were Amazon's state, which is the applied=1 fault that logged 40 phantom additions.
    const n = await recordTombstones(
      [killed("k3", "phone belt string", "BROAD", 5.27, false)],
      new Map([["k3", perf(5.27, 0, 0)]]),
      conn,
    );
    expect(n).toBe(0);
  });

  it("does NOT write a row when there is no performance evidence this run", async () => {
    // Silence is not a verdict. No row in the report means we did not look, not that it is dead.
    const n = await recordTombstones([killed("k4", "phone security tether", "PHRASE", 4.47)], new Map(), conn);
    expect(n).toBe(0);
  });

  it("is idempotent, so an hourly engine cannot double-write or throw on a repeat", async () => {
    const rows = [killed("k5", "iphone theft protection", "BROAD", 4.74)];
    const mtd = new Map([["k5", perf(4.74, 0, 0)]]);
    expect(await recordTombstones(rows, mtd, conn)).toBe(1);
    expect(await recordTombstones(rows, mtd, conn)).toBe(0);   // ON CONFLICT DO NOTHING
    expect((await conn.execute("SELECT 1 FROM kw_tombstone")).rows).toHaveLength(1);
  });

  it("writes the real September batch: 5 dead words in, 5 rows out, 1 survivor", async () => {
    const batch = [
      killed("a", "retractable lanyard phone", "EXACT", 5.71),
      killed("b", "iphone retractable lanyard", "PHRASE", 5.44),
      killed("c", "phone belt string", "BROAD", 5.27),
      killed("d", "iphone safety tether", "EXACT", 5.22),
      killed("e", "anti theft retractable phone clip", "BROAD", 5.10),
      killed("f", "cell phone retractable tether", "EXACT", 6.91),   // converted at 1.37x, survives
    ];
    const mtd = new Map([
      ["a", perf(5.71, 0, 0)], ["b", perf(5.44, 0, 0)], ["c", perf(5.27, 0, 0)],
      ["d", perf(5.22, 0, 0)], ["e", perf(5.10, 0, 0)], ["f", perf(6.91, 1, 9.49)],
    ]);
    expect(await recordTombstones(batch, mtd, conn)).toBe(5);
    const r = await conn.execute("SELECT dead_key FROM kw_tombstone ORDER BY dead_key");
    expect(r.rows.map((x) => String(x.dead_key))).not.toContain(deadKey("cell phone retractable tether", "EXACT"));
    expect(r.rows).toHaveLength(5);
  });
});
