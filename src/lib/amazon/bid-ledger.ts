// The bid history ledger — what every bid level actually produced.
//
// William 2026-08-13:
//
//   "Can we build a database of history so we can understand what the system's doing and make sure
//    that we can go back and see were bids raised or lowered? Did that help with conversion of
//    words that weren't converting before? ... Oh, we lowered the bids, it still didn't convert, we
//    raised the bids, it still didn't convert, or it did convert. And we were able to have a ROAS
//    that was thirty percent better because we lowered the bids and the words still fired."
//
// WHY THE EXISTING TABLES CANNOT ANSWER THAT. `kw_bid_history` and `bid_changes` both record a
// CHANGE — from_bid, to_bid, and what things looked like BEFORE it. Neither ever records what the
// new bid went on to produce. So they can say "we cut this to $0.48" and never "and at $0.48 it got
// 300 impressions, 8 clicks and $19". Both have zero rows anyway, so nothing has been recorded at
// all since the account began.
//
// THE SHAPE THAT DOES ANSWER IT is an EPOCH, not a change: one row per (entity, bid level, stretch
// of time it held that bid). A change closes the current epoch and opens the next. The question
// "did lowering help?" is then a comparison of two consecutive rows, which is a query rather than a
// guess.
//
// HOW PRODUCTION IS MEASURED, and its one real limitation. Amazon's reports give MONTH-TO-DATE
// cumulative figures, not per-window ones. So an epoch's own production is (counters at close minus
// counters at open). That arithmetic is only valid inside a single calendar month, because the
// month-to-date counters reset on the 1st. Each epoch therefore stores its `month` and any epoch
// spanning a month boundary is closed at the boundary rather than differenced across it — recorded
// here rather than discovered later as a mystery negative number.
import { db } from "@/lib/db/client";

export interface EpochCounters {
  spend: number; sales: number; orders: number; clicks: number; impressions: number;
}
export interface OpenEpochInput {
  entityId: string;
  adProduct: string;
  label: string;
  matchType?: string | null;
  bid: number;
  fromBid?: number | null;
  direction?: "up" | "down" | "seed" | null;
  reason?: string | null;
  month: string;                 // "YYYY-MM"
  counters: EpochCounters;       // month-to-date AT THE MOMENT the bid changed
  at?: string;
}

export async function ensureBidLedger(): Promise<void> {
  await db().execute(`
    CREATE TABLE IF NOT EXISTS bid_epoch (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id     TEXT NOT NULL,
      ad_product    TEXT NOT NULL,
      label         TEXT,
      match_type    TEXT,
      month         TEXT NOT NULL,
      bid           REAL NOT NULL,
      from_bid      REAL,
      direction     TEXT,
      reason        TEXT,
      opened_at     TEXT NOT NULL,
      closed_at     TEXT,
      -- month-to-date counters read when this epoch OPENED
      open_spend REAL DEFAULT 0, open_sales REAL DEFAULT 0, open_orders INTEGER DEFAULT 0,
      open_clicks INTEGER DEFAULT 0, open_impressions INTEGER DEFAULT 0,
      -- month-to-date counters at the latest observation. Refreshed every run, so an epoch that is
      -- still open still has usable numbers instead of waiting for a change that may never come.
      last_spend REAL DEFAULT 0, last_sales REAL DEFAULT 0, last_orders INTEGER DEFAULT 0,
      last_clicks INTEGER DEFAULT 0, last_impressions INTEGER DEFAULT 0,
      last_seen_at  TEXT
    )`);
  await db().execute(`CREATE INDEX IF NOT EXISTS bid_epoch_entity ON bid_epoch (entity_id, ad_product, opened_at)`);
  await db().execute(`CREATE INDEX IF NOT EXISTS bid_epoch_open ON bid_epoch (entity_id, ad_product, closed_at)`);

  // MIGRATION, and the reason this whole ledger was needed. `kw_bid_history` was created with a
  // column called `acos_before`; ad-engine.ts has always INSERTed `roas_before`. SQLite rejects the
  // statement — "table kw_bid_history has no column named roas_before" — and the engine catches
  // that into out.errors, where nobody reads it. So EVERY bid-history write has failed silently
  // since the table existed, which is why it holds zero rows and why the turn-around rule, which
  // refuses to act without a baseline, has never once fired.
  //
  // Proven by replaying the exact INSERT against the live database on 2026-08-13.
  //
  // The code is right and the column name is wrong: what it writes is a ROAS (sales/spend), not an
  // ACOS. With zero rows there is nothing to lose by renaming.
  try {
    const info = await db().execute(`PRAGMA table_info(kw_bid_history)`);
    const cols = info.rows.map((r) => String(r.name));
    if (cols.includes("acos_before") && !cols.includes("roas_before")) {
      await db().execute(`ALTER TABLE kw_bid_history RENAME COLUMN acos_before TO roas_before`);
    }
  } catch { /* table may not exist yet; the engine creates it on its own path */ }
}

/** The epoch currently in force for an entity, if any. */
async function currentEpoch(entityId: string, adProduct: string) {
  const r = await db().execute({
    sql: `SELECT * FROM bid_epoch WHERE entity_id = ? AND ad_product = ? AND closed_at IS NULL
          ORDER BY opened_at DESC LIMIT 1`,
    args: [entityId, adProduct],
  });
  return r.rows[0] ?? null;
}

/**
 * Record the current month-to-date figures against whatever epoch is open.
 *
 * Called every run for every entity we have numbers for, changed or not. This is what makes a
 * long-running bid level readable without waiting for it to end.
 */
export async function touchEpoch(
  entityId: string, adProduct: string, month: string, counters: EpochCounters, at = new Date().toISOString(),
): Promise<void> {
  const cur = await currentEpoch(entityId, adProduct);
  if (!cur || String(cur.month) !== month) return;   // no open epoch this month: nothing to attach to
  await db().execute({
    sql: `UPDATE bid_epoch SET last_spend=?, last_sales=?, last_orders=?, last_clicks=?,
                 last_impressions=?, last_seen_at=? WHERE id = ?`,
    args: [counters.spend, counters.sales, counters.orders, counters.clicks, counters.impressions, at, cur.id as number],
  });
}

/**
 * Close the epoch in force and open a new one at the new bid.
 *
 * Idempotent on the bid: if the open epoch is already at this bid, nothing is closed and nothing is
 * opened, so a run that re-reports an unchanged bid cannot fragment the history into noise.
 */
export async function openEpoch(input: OpenEpochInput): Promise<void> {
  const at = input.at ?? new Date().toISOString();
  const cur = await currentEpoch(input.entityId, input.adProduct);
  if (cur && Math.round(Number(cur.bid) * 100) === Math.round(input.bid * 100) && String(cur.month) === input.month) {
    await touchEpoch(input.entityId, input.adProduct, input.month, input.counters, at);
    return;
  }
  if (cur) {
    await db().execute({
      sql: `UPDATE bid_epoch SET closed_at=?, last_spend=?, last_sales=?, last_orders=?,
                   last_clicks=?, last_impressions=?, last_seen_at=? WHERE id = ?`,
      args: [at, input.counters.spend, input.counters.sales, input.counters.orders,
             input.counters.clicks, input.counters.impressions, at, cur.id as number],
    });
  }
  await db().execute({
    sql: `INSERT INTO bid_epoch
            (entity_id, ad_product, label, match_type, month, bid, from_bid, direction, reason,
             opened_at, open_spend, open_sales, open_orders, open_clicks, open_impressions,
             last_spend, last_sales, last_orders, last_clicks, last_impressions, last_seen_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [input.entityId, input.adProduct, input.label, input.matchType ?? null, input.month,
           input.bid, input.fromBid ?? null, input.direction ?? null, input.reason ?? null, at,
           input.counters.spend, input.counters.sales, input.counters.orders, input.counters.clicks, input.counters.impressions,
           input.counters.spend, input.counters.sales, input.counters.orders, input.counters.clicks, input.counters.impressions, at],
  });
}

// ---------------------------------------------------------------------------
// Reading it back
// ---------------------------------------------------------------------------

/** What one bid level actually produced, which is the DIFFERENCE between its open and last counters. */
export interface EpochProduction {
  entityId: string; adProduct: string; label: string; month: string;
  bid: number; fromBid: number | null; direction: string | null; reason: string | null;
  openedAt: string; closedAt: string | null; hours: number;
  spend: number; sales: number; orders: number; clicks: number; impressions: number;
  roas: number | null;
}

const num = (v: unknown) => Number(v ?? 0);

export function productionOf(row: Record<string, unknown>): EpochProduction {
  const spend = +(num(row.last_spend) - num(row.open_spend)).toFixed(4);
  const sales = +(num(row.last_sales) - num(row.open_sales)).toFixed(4);
  const opened = String(row.opened_at);
  const end = row.closed_at ? String(row.closed_at) : (row.last_seen_at ? String(row.last_seen_at) : opened);
  return {
    entityId: String(row.entity_id), adProduct: String(row.ad_product),
    label: String(row.label ?? ""), month: String(row.month),
    bid: num(row.bid), fromBid: row.from_bid === null ? null : num(row.from_bid),
    direction: row.direction === null ? null : String(row.direction),
    reason: row.reason === null ? null : String(row.reason),
    openedAt: opened, closedAt: row.closed_at ? String(row.closed_at) : null,
    hours: Math.max(0, (Date.parse(end) - Date.parse(opened)) / 3.6e6),
    spend, sales,
    orders: Math.round(num(row.last_orders) - num(row.open_orders)),
    clicks: Math.round(num(row.last_clicks) - num(row.open_clicks)),
    impressions: Math.round(num(row.last_impressions) - num(row.open_impressions)),
    roas: spend > 0 ? +(sales / spend).toFixed(2) : null,
  };
}

/** Every bid level an entity has held, oldest first. */
export async function epochsFor(entityId: string, adProduct?: string): Promise<EpochProduction[]> {
  const r = await db().execute({
    sql: `SELECT * FROM bid_epoch WHERE entity_id = ?${adProduct ? " AND ad_product = ?" : ""}
          ORDER BY opened_at ASC`,
    args: adProduct ? [entityId, adProduct] : [entityId],
  });
  return r.rows.map((x) => productionOf(x as Record<string, unknown>));
}

export type Helped = "helped" | "hurt" | "no change" | "too early";

/**
 * Did the move that ENDED `before` and started `after` help?
 *
 * The verdict is deliberately conservative. A bid level with no clicks has not been given the
 * chance to answer, so it returns "too early" rather than a number — the failure mode this whole
 * ledger exists to stop is reading a quiet window as a bad result.
 */
export function didItHelp(before: EpochProduction, after: EpochProduction): {
  verdict: Helped; roasDelta: number | null; clicksDelta: number; note: string;
} {
  if (after.clicks === 0 || before.clicks === 0) {
    return { verdict: "too early", roasDelta: null, clicksDelta: after.clicks - before.clicks,
      note: `${before.clicks} clicks at $${before.bid.toFixed(2)} vs ${after.clicks} at $${after.bid.toFixed(2)} — not enough to judge` };
  }
  const clicksDelta = after.clicks - before.clicks;
  if (before.roas === null || after.roas === null) {
    return { verdict: "too early", roasDelta: null, clicksDelta, note: "no spend at one of the two levels" };
  }
  const roasDelta = +(after.roas - before.roas).toFixed(2);
  const pct = before.roas > 0 ? (after.roas / before.roas - 1) * 100 : 0;
  if (Math.abs(pct) < 5) return { verdict: "no change", roasDelta, clicksDelta, note: `ROAS within 5%` };
  const dir = after.bid > before.bid ? "raising" : "lowering";
  return {
    verdict: pct > 0 ? "helped" : "hurt",
    roasDelta, clicksDelta,
    note: `${dir} $${before.bid.toFixed(2)} -> $${after.bid.toFixed(2)} moved ROAS ${before.roas}x -> ${after.roas}x (${pct > 0 ? "+" : ""}${pct.toFixed(0)}%), clicks ${before.clicks} -> ${after.clicks}`,
  };
}


// ---------------------------------------------------------------------------
// The one call each engine makes
// ---------------------------------------------------------------------------

/** What an engine knows about one entity this run. */
export interface LedgerObservation {
  entityId: string; label: string; matchType?: string | null;
  bid: number; counters: EpochCounters;
}

/**
 * Record a whole run: open a new epoch for anything whose bid moved, and refresh the numbers on
 * everything else.
 *
 * Deliberately called with the bid the entity is ON, not the bid we asked for. A write Amazon
 * refused must not appear in the history as a bid that was in force — that is the same mistake as
 * `applied=1` recording intent instead of outcome (2026-08-04), and it would poison every
 * did-it-help comparison downstream.
 */
export async function recordBidRun(
  adProduct: string,
  month: string,
  observations: LedgerObservation[],
  appliedMoves: Map<string, { fromBid: number; toBid: number; direction: "up" | "down"; reason: string }>,
  at = new Date().toISOString(),
): Promise<{ opened: number; touched: number }> {
  await ensureBidLedger();
  let opened = 0, touched = 0;
  for (const o of observations) {
    const mv = appliedMoves.get(o.entityId);
    if (mv) {
      await openEpoch({
        entityId: o.entityId, adProduct, label: o.label, matchType: o.matchType,
        bid: mv.toBid, fromBid: mv.fromBid, direction: mv.direction, reason: mv.reason,
        month, counters: o.counters, at,
      });
      opened++;
    } else {
      const cur = await currentEpoch(o.entityId, adProduct);
      if (!cur || String(cur.month) !== month) {
        // First sighting this month: seed an epoch at the bid it is already on, so the very first
        // change has something to be compared against instead of starting blind.
        await openEpoch({
          entityId: o.entityId, adProduct, label: o.label, matchType: o.matchType,
          bid: o.bid, fromBid: null, direction: "seed", reason: "first seen at this bid",
          month, counters: o.counters, at,
        });
        opened++;
      } else {
        await touchEpoch(o.entityId, adProduct, month, o.counters, at);
        touched++;
      }
    }
  }
  return { opened, touched };
}
