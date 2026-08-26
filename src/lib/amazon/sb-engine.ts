// Sponsored Brands kill engine — William's $4 rule, applied to the channel that was burning the
// money while nobody could see it.
//
// Context (2026-08-07): Sponsored Brands spent $75.11 month-to-date and returned $55.45, against a
// 1.92x break-even. One word, `phone security`, took $49.20 of it and returned $18.98 — a 259% ACOS.
// It was paused by hand. The channel had never been under any automated rule at all, because v3
// reporting returns COMPLETED with zero rows for these legacy single-ad-group campaigns and we
// could not read per-keyword spend until sb-v2.ts.
//
// Three deliberate design choices:
//
//  1. EACH KEYWORD STANDS ON ITS OWN (William 2026-08-07). Spend is grouped by (text, match type)
//     because that is the unit the v2 report reports on and the unit a bid belongs to; copies of
//     the same text under a DIFFERENT match type are judged separately, never merged.
//
//  2. IT CACHES DAYS. v2 reports take one day per request and about a minute each, so a
//     month-to-date pull is N minutes and will not fit in a cron. Each run ingests only today and
//     yesterday into `sb_daily`, then aggregates the month out of our own database. Yesterday is
//     re-ingested because 14-day attribution keeps rewriting it.
//
//  3. IT RECORDS OUTCOMES, NOT INTENTIONS. Amazon answers a bulk write with 207 and a per-item
//     code; treating that as success is how one impossible keyword got logged as applied 40 times
//     while never existing. Only ids Amazon returned SUCCESS for are logged as killed.

import { db } from "@/lib/db/client";
import { recordBidRun, type LedgerObservation } from "./bid-ledger";
import { approvedCeilings, unaskedGates, markAsked, formatGateAsk } from "./bid-gate";
import { adsConfigFromEnv, getAdsAccessToken, type AdsConfig } from "./ads-api";
import {
  accountDay, fetchSbKeywordDay, fetchSbKeywords, fetchSbCampaigns, writeSbKeywords,
  type SbKeyword,
} from "./sb-v2";
import {
  shouldKill, KILL_SPEND, KILL_MIN_ROAS, planBids, killedWordsThisMonth,
  type Perf, type BidCandidate, type BidPlan,
} from "./ad-rules";

export interface SbKillRow {
  keywordId: string;
  keywordText: string; matchType: string;
  spend: number; sales: number; orders: number; clicks: number;
  acos: number | null;
  applied: boolean; refusedCode?: string;
  unwritable: boolean;   // ENABLED, but its campaign is not, so Amazon will refuse the write
}

export interface SbEngineResult {
  /** bid moves this run — the same rules Sponsored Products uses (William 2026-08-13) */
  bidPlan?: BidPlan;
  bidsApplied?: number;
  ok: boolean; dryRun: boolean;
  month: string;
  ingested: { day: string; rows: number; spend: number }[];
  monthSpend: number; monthSales: number;
  words: number;
  killed: SbKillRow[];
  survived: { keywordText: string; matchType: string; spend: number; acos: number | null }[];
  notes: string[]; errors: string[];
  durationMs: number;
  reason?: string;
}

export const wordKey = (text: string, match: string) =>
  `${text.toLowerCase().trim()}|${match.toUpperCase()}`;

/** First day of the month `day` falls in. accountDay() has already shifted for the 07:00Z reset,
 *  so this is a plain calendar truncation of an already-correct date. */
export function monthStart(day: string): string {
  return day.slice(0, 8) + "01";
}

async function ensureTables(): Promise<void> {
  await db().execute(`CREATE TABLE IF NOT EXISTS sb_daily (
    day TEXT NOT NULL, keyword_id TEXT NOT NULL, keyword_text TEXT, match_type TEXT,
    clicks INTEGER DEFAULT 0, cost REAL DEFAULT 0, sales REAL DEFAULT 0, orders INTEGER DEFAULT 0,
    fetched_at TEXT, PRIMARY KEY (day, keyword_id))`);
  await db().execute(`CREATE INDEX IF NOT EXISTS sb_daily_word ON sb_daily (keyword_text, match_type)`);
  await db().execute(`CREATE TABLE IF NOT EXISTS ad_engine_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT NOT NULL, action TEXT NOT NULL,
    keyword TEXT, match_type TEXT, from_bid REAL, to_bid REAL, acos REAL, spend REAL)`);
  // ad_product distinguishes an SB kill from an SP kill in a log that predates Sponsored Brands.
  try { await db().execute(`ALTER TABLE ad_engine_log ADD COLUMN ad_product TEXT`); } catch { /* already there */ }
  try { await db().execute(`ALTER TABLE ad_engine_log ADD COLUMN applied INTEGER DEFAULT 1`); } catch { /* already there */ }
}

/** Pull one day of Sponsored Brands and upsert it. Re-running a day is safe: the primary key is
 *  (day, keyword_id) and the write replaces, so attribution updates land without double counting. */
async function ingestDay(cfg: AdsConfig, token: string, day: string) {
  const rows = await fetchSbKeywordDay(cfg, token, day);
  if (!rows) return null;                         // "not ready", not "no data" — leave the day alone
  const at = new Date().toISOString();
  let spend = 0;
  for (const r of rows) {
    if (!r.keywordId) continue;
    spend += r.cost;
    await db().execute({
      sql: `INSERT INTO sb_daily (day,keyword_id,keyword_text,match_type,clicks,cost,sales,orders,fetched_at)
            VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(day,keyword_id) DO UPDATE SET
              keyword_text=excluded.keyword_text, match_type=excluded.match_type,
              clicks=excluded.clicks, cost=excluded.cost, sales=excluded.sales,
              orders=excluded.orders, fetched_at=excluded.fetched_at`,
      args: [day, r.keywordId, r.keywordText, r.matchType, r.clicks, r.cost, r.sales, r.orders, at],
    });
  }
  return { day, rows: rows.length, spend: +spend.toFixed(2) };
}

export async function runSbEngine(opts: { dryRun?: boolean; ingestDays?: number } = {}): Promise<SbEngineResult> {
  const dryRun = opts.dryRun ?? false;
  const start = Date.now();
  const today = accountDay();
  const out: SbEngineResult = {
    ok: false, dryRun, month: monthStart(today), ingested: [],
    monthSpend: 0, monthSales: 0, words: 0, killed: [], survived: [],
    notes: [], errors: [], durationMs: 0,
  };
  const cfg = adsConfigFromEnv();
  if (!cfg?.profileId) { out.reason = "ADS_* env not configured"; out.durationMs = Date.now() - start; return out; }

  await ensureTables();
  const token = await getAdsAccessToken(cfg);

  // (1) refresh the tail of our own history. Two days by default: today, plus yesterday because
  //     14-day attribution keeps rewriting it after the fact.
  const back = Math.max(1, opts.ingestDays ?? 2);
  for (let i = 0; i < back; i++) {
    const day = new Date(Date.parse(today + "T00:00:00Z") - i * 864e5).toISOString().slice(0, 10);
    if (day < out.month) break;                   // never reach back past the month we are judging
    try {
      const r = await ingestDay(cfg, token, day);
      if (r) out.ingested.push(r);
      else out.notes.push(`${day}: report not ready, kept previous rows`);
    } catch (e) { out.errors.push(`ingest ${day}: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // (2) month to date, per KEYWORD ID. Each spend is judged on its own (William 2026-08-08:
  //     "i do not want you to combine the same word across all display products and brands and
  //     stop all the spending. Each spend is individual"). An earlier version summed a word across
  //     its copies and paused all of them together; that is reverted here. This matches Sponsored
  //     Products, where the $4 rule has always been per keyword id, so all three products agree.
  const q = await db().execute({
    sql: `SELECT keyword_id,
                 lower(trim(MAX(keyword_text))) AS text, upper(MAX(match_type)) AS match_type,
                 SUM(cost) AS spend, SUM(sales) AS sales, SUM(orders) AS orders, SUM(clicks) AS clicks
            FROM sb_daily
           WHERE day >= ? AND day <= ? AND keyword_text IS NOT NULL AND trim(keyword_text) <> ''
           GROUP BY keyword_id`,
    args: [out.month, today],
  });
  const perf = new Map<string, Perf & { text: string; match: string; clicks: number }>();
  for (const r of q.rows) {
    const text = String(r.text), match = String(r.match_type);
    const p = {
      text, match,
      spend: Number(r.spend ?? 0), sales: Number(r.sales ?? 0),
      orders: Number(r.orders ?? 0), clicks: Number(r.clicks ?? 0),
    };
    out.monthSpend += p.spend; out.monthSales += p.sales;
    perf.set(String(r.keyword_id), p);
  }
  out.monthSpend = +out.monthSpend.toFixed(2);
  out.monthSales = +out.monthSales.toFixed(2);
  out.words = perf.size;   // spending keyword IDs, not distinct texts

  // (3) which copies are actually writable. A keyword in a non-ENABLED campaign returns 207 and
  //     changes nothing, so it is counted and reported rather than silently attempted.
  const [live, camps] = await Promise.all([fetchSbKeywords(cfg, token), fetchSbCampaigns(cfg, token)]);
  const byId = new Map<string, SbKeyword>(live.map((k) => [k.keywordId, k]));

  // (4) decide, using the SAME rule Sponsored Products and Display use: $4+ month-to-date AND
  //     unprofitable (no sale at all, or a ROAS under KILL_MIN_ROAS, 1.5x since 2026-08-23).
  //     Brands has no bar of its own; shouldKill() is the only place the line is written down.
  const ops: { keywordId: string; adGroupId: string; state: string }[] = [];
  const pending: SbKillRow[] = [];
  for (const [keywordId, p] of perf) {
    const acos = p.orders > 0 && p.sales > 0 ? p.spend / p.sales : null;
    if (!shouldKill(p)) {
      if (p.spend >= KILL_SPEND) {
        out.survived.push({ keywordText: p.text, matchType: p.match, spend: +p.spend.toFixed(2), acos: acos === null ? null : +acos.toFixed(2) });
      }
      continue;
    }
    const k = byId.get(keywordId);
    if (!k || k.state !== "ENABLED") continue;          // already off: nothing to do
    // A keyword inside a non-ENABLED campaign returns 207 and changes nothing, so it is reported
    // rather than silently attempted (sb-keyword-write-recipe, verified live 2026-08-06).
    const writable = camps.get(k.campaignId)?.state === "ENABLED";
    if (writable) ops.push({ keywordId, adGroupId: k.adGroupId, state: "PAUSED" });
    pending.push({
      keywordId,
      keywordText: p.text, matchType: p.match,
      spend: +p.spend.toFixed(2), sales: +p.sales.toFixed(2), orders: p.orders, clicks: p.clicks,
      acos: acos === null ? null : +acos.toFixed(2),
      applied: false, unwritable: !writable,
    });
  }

  // (4b) BIDS — the same planner Sponsored Products and Display use (William 2026-08-13: "we need
  //      the rules to apply to all three different types of campaigns"). Entities the $4 rule is
  //      about to switch off are skipped inside planBids, so nothing gets two writes in one run.
  const candidates: BidCandidate[] = [];
  for (const [keywordId, p] of perf) {
    const k = byId.get(keywordId);
    if (!k || k.state !== "ENABLED") continue;
    candidates.push({
      id: keywordId, label: `${p.text} (${p.match})`, word: p.text, bid: k.bid ?? null,
      spend: p.spend, sales: p.sales, orders: p.orders, clicks: p.clicks,
      writable: camps.get(k.campaignId)?.state === "ENABLED",
    });
  }
  const ceilings = await approvedCeilings("SPONSORED_BRANDS");
  for (const c of candidates) c.approvedCeiling = ceilings.get(c.id) ?? null;
  const bidPlan = planBids(candidates, { killedWords: killedWordsThisMonth([...perf.values()]) });
  out.bidPlan = bidPlan;
  const obs: LedgerObservation[] = candidates.map((c) => ({
    entityId: c.id, label: c.label, bid: c.bid ?? 0,
    counters: { spend: c.spend, sales: c.sales, orders: c.orders, clicks: c.clicks, impressions: c.impressions ?? 0 },
  }));
  if (bidPlan.blocked) out.notes.push(`${bidPlan.blocked} bid change(s) sit in a campaign that is not ENABLED — Amazon will not take them`);
  if (bidPlan.escalated.length && !dryRun) {
    try {
      const fresh = await unaskedGates("SPONSORED_BRANDS", bidPlan.escalated);
      if (fresh.length) {
        const { sendTelegram, telegramConfigured } = await import("@/lib/notify/telegram");
        const text = formatGateAsk("SPONSORED_BRANDS", fresh);
        if (telegramConfigured()) { await sendTelegram(text); await markAsked("SPONSORED_BRANDS", fresh); out.notes.push(`asked William about ${fresh.length} keyword(s) at their ceiling`); }
        else out.notes.push(`${fresh.length} at their ceiling, but Telegram is not configured — nothing sent`);
      }
    } catch (e) { out.errors.push(`gate ask: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (bidPlan.escalated.length) {
    out.notes.push(`NEEDS YOU: ${bidPlan.escalated.length} Sponsored Brands keyword(s) are at their approved ceiling and still not spending`);
  }
  if (!dryRun && !bidPlan.moves.length) {
    try { await recordBidRun("SPONSORED_BRANDS", out.month, obs, new Map()); }
    catch (e) { out.errors.push(`sb ledger: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (!dryRun && bidPlan.moves.length) {
    try {
      const w = await writeSbKeywords(cfg, token, bidPlan.moves.map((mv) => ({
        keywordId: mv.id, adGroupId: byId.get(mv.id)!.adGroupId, bid: mv.toBid,
      })));
      out.bidsApplied = w.succeeded.length;
      if (w.failed.length) out.errors.push(`sb bids: ${w.failed.length}/${bidPlan.moves.length} refused (${w.status})`);
      // history records only the bids Amazon ACCEPTED — a refused write never happened
      const acceptedSb = new Map(bidPlan.moves.filter((mv) => w.succeeded.includes(mv.id))
        .map((mv) => [mv.id, { fromBid: mv.fromBid, toBid: mv.toBid, direction: mv.direction, reason: mv.reason }]));
      try { await recordBidRun("SPONSORED_BRANDS", out.month, obs, acceptedSb); }
      catch (e) { out.errors.push(`sb ledger: ${e instanceof Error ? e.message : String(e)}`); }
      const runAtB = new Date().toISOString();
      for (const mv of bidPlan.moves) {
        // applied reflects Amazon's own per-item verdict, never the fact that we asked.
        const okItem = w.succeeded.includes(mv.id);
        await db().execute({
          sql: `INSERT INTO ad_engine_log (run_at,action,keyword,match_type,from_bid,to_bid,acos,spend,applied,ad_product)
                VALUES (?,?,?,?,?,?,?,?,?,?)`,
          args: [runAtB, "rebid", mv.label, null, mv.fromBid, mv.toBid, null, null, okItem ? 1 : 0, "SPONSORED_BRANDS"],
        });
      }
    } catch (e) { out.errors.push(`sb bids: ${e instanceof Error ? e.message : String(e)}`); }
  }

  if (!pending.length) {
    out.notes.push(`nothing past $${KILL_SPEND} unprofitably (kill line ${KILL_MIN_ROAS.toFixed(1)}x)`);
    out.ok = true; out.durationMs = Date.now() - start; return out;
  }
  if (dryRun) {
    out.killed = pending;
    out.ok = true; out.durationMs = Date.now() - start; return out;
  }

  // (5) apply, then attribute Amazon's per-item verdict back to the word that owns each id.
  let succeeded = new Set<string>();
  let failedBy = new Map<string, string>();
  try {
    const w = await writeSbKeywords(cfg, token, ops);
    succeeded = new Set(w.succeeded);
    failedBy = new Map(w.failed.map((f) => [f.keywordId, f.code]));
    if (w.failed.length) out.errors.push(`sb kill: ${w.failed.length}/${ops.length} refused (${w.status})`);
  } catch (e) { out.errors.push(`sb kill: ${e instanceof Error ? e.message : String(e)}`); }

  const runAt = new Date().toISOString();
  for (const row of pending) {
    row.applied = succeeded.has(row.keywordId);
    if (!row.applied && failedBy.has(row.keywordId)) row.refusedCode = failedBy.get(row.keywordId);
    out.killed.push(row);
    try {
      await db().execute({
        sql: `INSERT INTO ad_engine_log (run_at,action,keyword,match_type,from_bid,to_bid,acos,spend,applied,ad_product)
              VALUES (?,?,?,?,?,?,?,?,?,?)`,
        args: [runAt, "kill", row.keywordText, row.matchType, null, null, row.acos, row.spend,
               row.applied ? 1 : 0, "SPONSORED_BRANDS"],
      });
    } catch (e) { out.errors.push(`log: ${e instanceof Error ? e.message : String(e)}`); }
  }

  out.ok = true; out.durationMs = Date.now() - start;
  return out;
}

export function summarizeSbEngine(r: SbEngineResult): string {
  const L: string[] = [];
  L.push(`Sponsored Brands ${r.month} to date: $${r.monthSpend.toFixed(2)} spend, $${r.monthSales.toFixed(2)} sales, ${r.words} words.`);
  for (const d of r.ingested) L.push(`  ingested ${d.day}: ${d.rows} rows, $${d.spend.toFixed(2)}`);
  if (r.killed.length) {
    L.push(``, `PAUSED (past $${KILL_SPEND} and unprofitable):`);
    for (const k of r.killed) {
      const acos = k.acos === null ? "no sale" : `${Math.round(k.acos * 100)}% ACOS`;
      L.push(`  $${k.spend.toFixed(2)}  ${k.orders} orders, ${acos}  ${k.matchType} "${k.keywordText}"`);
      L.push(`     id ${k.keywordId}: ${k.applied ? "PAUSED" : k.refusedCode ? `refused (${k.refusedCode})` : k.unwritable ? "not writable — campaign is not ENABLED" : "not applied"}`);
    }
  }
  if (r.survived.length) {
    L.push(``, `Over $${KILL_SPEND} but PROFITABLE, left running:`);
    for (const s of r.survived) L.push(`  $${s.spend.toFixed(2)}  ${s.acos === null ? "-" : Math.round(s.acos * 100) + "% ACOS"}  ${s.matchType} "${s.keywordText}"`);
  }
  for (const n of r.notes) L.push(`note: ${n}`);
  for (const e of r.errors) L.push(`ERROR: ${e}`);
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// Monthly reset — William, 2026-08-07: "we reset it next month and turn it back
// on next month if it has lifetime success."
//
// The kill window is one calendar month, so on the 1st every word starts clean.
// A word that was switched off is only switched back ON if its LIFETIME record
// (kw_lifetime, console exports back to 2019) clears break-even on real evidence.
// Lifetime and not a trailing window on purpose: Amazon retains 60 days of
// Sponsored Brands data, so by month four a killed word looks untested again,
// which is how 151 profitable words holding $46,283 of lifetime sales ended up
// switched off one 10% cut at a time.
// ---------------------------------------------------------------------------

/** Break-even is 1.92x, from real fees: $9.49 price - $0.62 COGS - $1.42 referral - $2.52 FBA. */
export const SB_REACTIVATE_MIN_ROAS = 1.92;
/** A 79x return built on one order and $0.25 of spend is noise, not evidence. */
export const SB_REACTIVATE_MIN_ORDERS = 2;

export interface SbReactivateRow {
  keywordId: string; keywordText: string; matchType: string;
  lifetimeSpend: number; lifetimeSales: number; lifetimeOrders: number; roas: number;
  bid: number | null;
}
export interface SbReactivationResult {
  ok: boolean; dryRun: boolean;
  pausedInEnabledCampaigns: number;
  qualified: SbReactivateRow[];
  reactivated: string[];
  refused: { keywordId: string; code: string }[];
  notes: string[]; errors: string[];
  durationMs: number;
  reason?: string;
}

export async function runSbReactivation(opts: { dryRun?: boolean; minRoas?: number; minOrders?: number } = {}): Promise<SbReactivationResult> {
  const dryRun = opts.dryRun ?? false;
  const minRoas = opts.minRoas ?? SB_REACTIVATE_MIN_ROAS;
  const minOrders = opts.minOrders ?? SB_REACTIVATE_MIN_ORDERS;
  const start = Date.now();
  const out: SbReactivationResult = {
    ok: false, dryRun, pausedInEnabledCampaigns: 0, qualified: [], reactivated: [], refused: [],
    notes: [], errors: [], durationMs: 0,
  };
  const cfg = adsConfigFromEnv();
  if (!cfg?.profileId) { out.reason = "ADS_* env not configured"; out.durationMs = Date.now() - start; return out; }

  await ensureTables();
  const token = await getAdsAccessToken(cfg);

  const lifetime = new Map<string, { spend: number; sales: number; orders: number; roas: number }>();
  try {
    const q = await db().execute(
      `SELECT word, match_type, SUM(spend) s, SUM(sales) sa, SUM(orders) o
         FROM kw_lifetime WHERE ad_product='SPONSORED_BRANDS' GROUP BY word, match_type`);
    for (const r of q.rows) {
      const spend = Number(r.s ?? 0);
      if (spend <= 0) continue;
      const sales = Number(r.sa ?? 0);
      lifetime.set(wordKey(String(r.word), String(r.match_type)),
        { spend, sales, orders: Number(r.o ?? 0), roas: sales / spend });
    }
  } catch (e) { out.errors.push(`kw_lifetime: ${e instanceof Error ? e.message : String(e)}`); }
  if (!lifetime.size) {
    out.reason = "no Sponsored Brands lifetime history — re-enabling nothing";
    out.notes.push(out.reason);
    out.ok = true; out.durationMs = Date.now() - start; return out;
  }
  out.notes.push(`${lifetime.size} words of Sponsored Brands lifetime history`);

  const [live, camps] = await Promise.all([fetchSbKeywords(cfg, token), fetchSbCampaigns(cfg, token)]);
  const ops: { keywordId: string; adGroupId: string; state: string }[] = [];
  for (const k of live) {
    // A keyword in a non-ENABLED campaign cannot be written at all, so it is not a candidate.
    if (k.state !== "PAUSED" || camps.get(k.campaignId)?.state !== "ENABLED") continue;
    out.pausedInEnabledCampaigns++;
    const lt = lifetime.get(wordKey(k.keywordText, k.matchType));
    if (!lt || lt.orders < minOrders || lt.roas < minRoas) continue;
    out.qualified.push({
      keywordId: k.keywordId, keywordText: k.keywordText, matchType: k.matchType,
      lifetimeSpend: +lt.spend.toFixed(2), lifetimeSales: +lt.sales.toFixed(2),
      lifetimeOrders: lt.orders, roas: +lt.roas.toFixed(2), bid: k.bid,
    });
    ops.push({ keywordId: k.keywordId, adGroupId: k.adGroupId, state: "ENABLED" });
  }
  out.qualified.sort((a, b) => b.lifetimeSales - a.lifetimeSales);

  if (!ops.length) {
    out.notes.push(`nothing clears ${minRoas}x lifetime on ${minOrders}+ orders`);
    out.ok = true; out.durationMs = Date.now() - start; return out;
  }
  if (dryRun) { out.ok = true; out.durationMs = Date.now() - start; return out; }

  try {
    const w = await writeSbKeywords(cfg, token, ops);
    out.reactivated = w.succeeded;
    out.refused = w.failed;
    if (w.failed.length) out.errors.push(`sb reactivate: ${w.failed.length}/${ops.length} refused (${w.status})`);
  } catch (e) { out.errors.push(`sb reactivate: ${e instanceof Error ? e.message : String(e)}`); }

  const runAt = new Date().toISOString();
  const done = new Set(out.reactivated);
  for (const q of out.qualified) {
    try {
      await db().execute({
        sql: `INSERT INTO ad_engine_log (run_at,action,keyword,match_type,from_bid,to_bid,acos,spend,applied,ad_product)
              VALUES (?,?,?,?,?,?,?,?,?,?)`,
        args: [runAt, "reactivate", q.keywordText, q.matchType, q.bid, q.bid,
               q.roas > 0 ? +(1 / q.roas).toFixed(2) : null, q.lifetimeSpend,
               done.has(q.keywordId) ? 1 : 0, "SPONSORED_BRANDS"],
      });
    } catch (e) { out.errors.push(`log: ${e instanceof Error ? e.message : String(e)}`); }
  }

  out.ok = true; out.durationMs = Date.now() - start;
  return out;
}

export function summarizeSbReactivation(r: SbReactivationResult): string {
  const L: string[] = [];
  L.push(`Sponsored Brands monthly reset: ${r.pausedInEnabledCampaigns} paused word(s) reconsidered, ${r.qualified.length} clear lifetime break-even.`);
  for (const q of r.qualified) {
    L.push(`  ${q.roas.toFixed(2)}x  $${q.lifetimeSales.toFixed(2)} lifetime sales on ${q.lifetimeOrders} orders  ${q.matchType} "${q.keywordText}"`);
  }
  if (!r.dryRun) L.push(``, `${r.reactivated.length} re-enabled${r.refused.length ? `, ${r.refused.length} refused (${r.refused[0].code})` : ""}.`);
  for (const n of r.notes) L.push(`note: ${n}`);
  for (const e of r.errors) L.push(`ERROR: ${e}`);
  return L.join("\n");
}
