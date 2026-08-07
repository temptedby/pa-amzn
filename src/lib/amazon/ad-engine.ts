import { adsConfigFromEnv, getAdsAccessToken, type AdsConfig } from "./ads-api";
import { db } from "@/lib/db/client";
import { getReport, type ReportSpec } from "./ads-reports";
import {
  decide, shouldKill, isValidKeywordText, shortenToValidKeyword, selectReintroductions, deadKey, isProtected,
  ladderVerdict, BID_LADDER_MAX, BID_LADDER_STEP,
  BID_FLOOR, REINTRO_PER_DAY, KILL_SPEND,
  type Perf, type ReintroCandidate, type ReintroState, type ReintroPick,
} from "./ad-rules";

// Autonomous Sponsored-Products engine. Designed to run every few hours via cron,
// so every action is SAFE TO REPEAT:
//   - KILL switch: ENABLED keyword, >= $4 spend & 0 orders (30d)  -> pause (idempotent)
//   - HARVEST: a search term with >= $4 spend AND ACOS <= 50% (ROAS >= 2x) over the trailing
//          ~60d -> add it as EXACT + PHRASE keywords IN THE AD GROUP IT CONVERTED IN (H1 fix:
//          was a single global anchor ad group, so 18/19 campaigns could never receive a harvest).
//          Rule: ad-engine-harvest-rule.md (William 2026-06-26); deduped per ad group; idempotent.
//   - BID: target-ACOS convergence, capped ±25%/run (whole-cent, never breaches the cap -> C1 fix),
//          floor/cap. NOT compounding WITHIN a run (does ratchet across runs -> audit R1, parked).
// Apply is gated behind dryRun. Reuses the LWA token + region from ads-api.ts.

const BASE = "https://advertising-api.amazon.com";
const KW_CT = "application/vnd.spKeyword.v3+json";
const RPT_CT = "application/vnd.createasyncreportrequest.v3+json";
// Kill + bid rules now live in ad-rules.ts (William 2026-07-24): $4-MTD kill + ±10% bid at the 50%
// ACOS pivot. Break-even ~52% (VALIDATED via SP-API getMyFeesEstimate: $9.49 - COGS $0.62 - referral
// $1.42 - FBA $2.52 = $4.93 contribution; 4.93/9.49), so the 50% pivot keeps every kept keyword profitable.
const FLOOR = 0.10, CAP = 2.50, MAX_STEP = 0.25; // ±25% per run
const NEW_KW_BID = 0.50;
// Harvest rule (.agent/ad-engine-rules-2026-08-02.md Rule 3, William 2026-08-02): a search term
// qualifies as soon as it CONVERTS — no spend bar. It is added as PHRASE + EXACT into the ad group
// it converted in, and then lives under the kill rule ($4 of rope, then off). Harvesting only after
// $4 of spend added just 3 keywords in six weeks; converting terms are the whole point.
// HARVEST_MIN_SPEND / HARVEST_MAX_ACOS remain the bar for monthly REACTIVATION of paused keywords.
export const HARVEST_MIN_SPEND = 4;          // $ spend bar for reactivating a PAUSED keyword
export const HARVEST_MAX_ACOS = 0.50;        // reactivation bar: proven ACOS <= 50% (ROAS >= 2x)
const HARVEST_WINDOW_DAYS = 60;              // trailing window (chunked into <=31d Ads-API reports)
// Monthly REACTIVATION (ad-engine-harvest-rule.md step 4, William 2026-06-26): once a month, re-enable
// any PAUSED keyword whose trailing 65 days still holds cost >= $4 AND ACOS <= 50% (ROAS >= 2x) -
// same winner bar as harvest, so a keyword the kill-switch paused but that has since recovered comes back.
export const REACT_WINDOW_DAYS = 65;
// Reintroduction history window. Amazon's Ads API retains SP report history for roughly 60-95 days;
// true lifetime figures exist only in the Campaign Manager console. 90d is the longest we can
// reliably stitch, so "lifetime" in Rule 4 means "the longest window the API will give us".
export const REINTRO_HISTORY_DAYS = 90;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d: Date) => d.toISOString().slice(0, 10);

interface Kw { keywordId: string; keywordText: string; matchType: string; state: string; bid: number; campaignId: string; adGroupId: string }
interface Row { keywordId?: string; keyword?: string; searchTerm?: string; matchType?: string; clicks?: number; cost?: number; sales14d?: number; purchases14d?: number; campaignId?: string | number; adGroupId?: string | number }
export interface SearchTermRow { searchTerm?: string; campaignId?: string | number; adGroupId?: string | number; cost?: number; sales14d?: number; purchases14d?: number }
export interface HarvestAdd { campaignId: string; adGroupId: string; keywordText: string; matchType: "EXACT" | "PHRASE"; state: "ENABLED"; bid: number }
export interface ReactivationCandidate { keywordId: string; keywordText: string; matchType: string; cost: number; acos: number }
export interface ReactivationResult {
  ok: boolean; dryRun: boolean;
  reactivated: { text: string; matchType: string; cost: number; acos: number }[];
  notes: string[];
  errors: string[]; durationMs: number; reason?: string;
}
export interface AdEngineResult {
  ok: boolean; dryRun: boolean;
  killed: { text: string; spend: number; matchType: string; copies: number; paused?: number }[];
  bids: { text: string; from: number; to: number; acos: number }[];
  added: { text: string; matchType: string }[];
  /** Report-readiness lines. A pass with data still queued is normal, so it is a note, not an error. */
  notes: string[];
  errors: string[]; durationMs: number; reason?: string;
}

async function ads(cfg: AdsConfig, token: string, path: string, method: string, body: unknown, ct = "application/json") {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Amazon-Advertising-API-ClientId": cfg.clientId,
      "Amazon-Advertising-API-Scope": cfg.profileId!,
      "Content-Type": ct, Accept: ct,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, json: text ? JSON.parse(text) : null };
}


// Deferred report accessor. Wraps ads-reports.getReport so an engine pass NEVER blocks on Amazon's
// queue (measured ~9 min on this account against the old 140s inline budget). Returns [] plus a
// human-readable note when the data is not ready yet — that is a normal outcome, not an error.
const SP_COLS = ["keywordId", "keyword", "clicks", "cost", "sales14d", "purchases14d"];
async function deferredRows(
  cfg: AdsConfig, token: string, notes: string[],
  purpose: string, reportTypeId: string, groupBy: string[], columns: string[], sd: string, ed: string,
): Promise<{ rows: Row[]; ready: boolean }> {
  const spec: ReportSpec = { purpose, adProduct: "SPONSORED_PRODUCTS", reportTypeId, groupBy, columns, startDate: sd, endDate: ed };
  const r = await getReport<Row>(cfg, token, spec);
  if (r.state === "ready") { notes.push(`${purpose}: ready (${r.rows.length} rows, ${r.ageHours}h old)`); return { rows: r.rows, ready: true }; }
  if (r.state === "failed") { notes.push(`${purpose}: FAILED — ${r.reason}`); return { rows: [], ready: false }; }
  notes.push(`${purpose}: ${r.state}, collect on a later run`);
  return { rows: [], ready: false };
}

// Per-item outcome of a Sponsored Products bulk write.
//
// Amazon answers /sp/keywords with HTTP 207 and a body that splits the batch:
//   { keywords: { success: [{index, keywordId}], error: [{index, errors:[{errorType, errorValue}]}] } }
// 207 is inside the 2xx range, so `res.ok` is TRUE even when EVERY item failed. That is the bug
// behind `applied=1` on a keyword Amazon refused 40 times in a row: the log recorded that we asked,
// not that it happened. Proved live 2026-08-07 by submitting one valid id and one invalid one — the
// response carried both a success and an error under a single ok status.
export interface BulkOutcome {
  succeededIdx: Set<number>;
  failed: { index: number; reason: string; message: string }[];
}
export function parseBulkOutcome(json: unknown, opCount: number): BulkOutcome {
  const out: BulkOutcome = { succeededIdx: new Set(), failed: [] };
  const node = (json as { keywords?: { success?: unknown[]; error?: unknown[] } } | null)?.keywords;
  if (!node || (!node.success && !node.error)) {
    // Unrecognised body: claim nothing. Silence must read as failure, never as success.
    return out;
  }
  for (const s of node.success ?? []) {
    const i = (s as { index?: number }).index;
    if (typeof i === "number") out.succeededIdx.add(i);
  }
  for (const e of node.error ?? []) {
    const row = e as { index?: number; errors?: { errorType?: string; errorValue?: Record<string, { reason?: string; message?: string }> }[] };
    const first = row.errors?.[0];
    const detail = first?.errorValue ? Object.values(first.errorValue)[0] : undefined;
    out.failed.push({
      index: typeof row.index === "number" ? row.index : -1,
      reason: detail?.reason ?? first?.errorType ?? "UNKNOWN",
      message: detail?.message ?? "",
    });
  }
  // An item Amazon mentioned in neither list did not succeed, so it is never counted as applied.
  void opCount;
  return out;
}

// Clamp a raw target bid to the ±MAX_STEP/run band and global [FLOOR, CAP], rounded to whole cents.
// C1 fix (ad-engine-audit-2026-06-25.md): round the band edges INWARD - lo UP, hi DOWN - so rounding
// a small bid to cents can never push it past the ±25%/run cap (e.g. 0.10->0.13 was +30%; now <=0.12).
export function clampBidStep(currentBid: number, rawTarget: number): number {
  const base = currentBid || NEW_KW_BID;
  const lo = Math.max(FLOOR, Math.ceil(base * (1 - MAX_STEP) * 100) / 100);
  const hi = Math.min(CAP, Math.floor(base * (1 + MAX_STEP) * 100) / 100);
  return Math.max(lo, Math.min(hi, +rawTarget.toFixed(2)));
}

// Trailing window split into non-overlapping <=31-day chunks (Ads API caps reports at ~31 days).
// HARVEST_WINDOW_DAYS=60 -> [now-30, now] and [now-60, now-31].
export function harvestWindows(days: number, now: number): [string, string][] {
  const MS = 864e5, CHUNK = 30, wins: [string, string][] = [];
  for (let end = 0; end < days; end += CHUNK + 1) {
    wins.push([iso(new Date(now - Math.min(end + CHUNK, days) * MS)), iso(new Date(now - end * MS))]);
  }
  return wins;
}

// Pure harvest selector (H1 fix). Aggregates spSearchTerm rows by (campaign|adGroup|term), then
// applies William's rule (ad-engine-harvest-rule.md): cost >= HARVEST_MIN_SPEND AND ACOS <= HARVEST_MAX_ACOS.
// Each qualifying term is harvested as EXACT + PHRASE INTO THE AD GROUP IT CONVERTED IN, skipping any
// (adGroup, matchType, text) already present. `existing` keys are `${adGroupId}|${matchType}|${lowerText}`.
export function harvestCandidates(rows: SearchTermRow[], existing: Set<string>, bid = NEW_KW_BID): HarvestAdd[] {
  const agg = new Map<string, { cid: string; agid: string; term: string; cost: number; sales: number; orders: number }>();
  for (const r of rows) {
    const term = (r.searchTerm || "").trim();
    const cid = r.campaignId != null ? String(r.campaignId) : "";
    const agid = r.adGroupId != null ? String(r.adGroupId) : "";
    if (!term || !cid || !agid) continue;            // need the source ad group to harvest into
    if (/^b0[a-z0-9]{8}$/i.test(term)) continue;     // ASIN, not a customer search phrase
    const key = `${cid}|${agid}|${term.toLowerCase()}`;
    const o = agg.get(key) ?? { cid, agid, term, cost: 0, sales: 0, orders: 0 };
    o.cost += r.cost ?? 0; o.sales += r.sales14d ?? 0; o.orders += r.purchases14d ?? 0;
    agg.set(key, o);
  }
  const adds: HarvestAdd[] = [];
  for (const o of agg.values()) {
    if (!(o.orders > 0)) continue;                   // Rule 3: harvest on the FIRST conversion
    // Amazon caps keyword text at 80 chars / 10 words and rejects anything longer, so shorten an
    // over-long term to its longest valid leading root instead of retrying it forever (the live
    // 2026-08-01 loop: a 98-char, 14-word term re-submitted every run). Skip only if no root fits.
    // Normalise first, then validate. A term Amazon will not take must never be submitted twice:
    // "…tether – durable clip-on leash for" was resubmitted 40 times, logged applied=1 every run.
    const text = isValidKeywordText(o.term) ? o.term : shortenToValidKeyword(o.term);
    if (!text || !isValidKeywordText(text)) continue;   // belt and braces: never emit an invalid op
    const t = text.toLowerCase();
    for (const mt of ["EXACT", "PHRASE"] as const) {
      if (existing.has(`${o.agid}|${mt}|${t}`)) continue;
      adds.push({ campaignId: o.cid, adGroupId: o.agid, keywordText: text, matchType: mt, state: "ENABLED", bid });
    }
  }
  return adds;
}

// Pure reactivation selector (ad-engine-harvest-rule.md step 4). From the currently PAUSED keywords
// + their trailing-window performance (aggregated per keywordId), pick those to re-enable: a paused
// keyword qualifies when its trailing 65d holds cost >= HARVEST_MIN_SPEND AND ACOS <= HARVEST_MAX_ACOS
// (same winner bar as harvest). Only PAUSED keywords are considered, so re-running is idempotent.
export function reactivationCandidates(
  paused: { keywordId: string; keywordText: string; matchType: string; state: string }[],
  perfById: Map<string, { cost: number; sales: number }>,
): ReactivationCandidate[] {
  const out: ReactivationCandidate[] = [];
  for (const k of paused) {
    if (k.state !== "PAUSED") continue;                         // never touch an already-ENABLED keyword
    const p = perfById.get(String(k.keywordId));
    if (!p) continue;                                            // no recent spend -> nothing to prove it recovered
    if (p.cost < HARVEST_MIN_SPEND) continue;                   // >= $4 spend
    if (!(p.sales > 0 && p.cost / p.sales <= HARVEST_MAX_ACOS)) continue; // ACOS <= 50% (ROAS >= 2x)
    out.push({ keywordId: String(k.keywordId), keywordText: k.keywordText, matchType: k.matchType, cost: +p.cost.toFixed(2), acos: +(p.cost / p.sales).toFixed(4) });
  }
  return out;
}

export async function runAdEngine(opts: { dryRun?: boolean } = {}): Promise<AdEngineResult> {
  const dryRun = opts.dryRun ?? false;
  const start = Date.now();
  const out: AdEngineResult = { ok: false, dryRun, killed: [], bids: [], added: [], notes: [], errors: [], durationMs: 0 };
  const cfg = adsConfigFromEnv();
  if (!cfg || !cfg.profileId) { out.reason = "ADS_* env not configured"; out.durationMs = Date.now() - start; return out; }
  const token = await getAdsAccessToken(cfg);

  // keywords
  const kws: Kw[] = [];
  let next: string | undefined;
  do {
    const r = await ads(cfg, token, "/sp/keywords/list", "POST", { maxResults: 1000, ...(next ? { nextToken: next } : {}) }, KW_CT);
    (r.json?.keywords ?? []).forEach((k: Kw) => kws.push(k));
    next = r.json?.nextToken;
  } while (next);
  const byId = new Map(kws.map((k) => [String(k.keywordId), k]));
  // per-ad-group keyword index so harvest only skips a term already present IN THAT ad group (H1).
  const haveByAg = new Set(kws.map((k) => `${k.adGroupId}|${k.matchType}|${(k.keywordText || "").toLowerCase().trim()}`));

  const now = new Date();
  const ed = iso(now), sd = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))); // month-to-date

  // (1) keyword performance -> kill + bid
  const kt = (await deferredRows(cfg, token, out.notes, "engine-mtd", "spTargeting", ["targeting"], SP_COLS, sd, ed)).rows;
  // Freshly reintroduced keywords are shielded from the automatic bid CUT for the 14-day attribution
  // window. Without this the engine reads "0 orders" on a word whose orders simply have not been
  // attributed yet, cuts 10%, and repeats four times a day until the word is back at the floor —
  // which is the documented history of `phone tethered` (0.49 -> 0.94 -> 0.35 in six days) and the
  // reason 151 profitable words ended up switched off. The $4 kill is NOT suppressed.
  const protectedIds = new Map<string, string>();
  try {
    const pr = await db().execute("SELECT keyword_id, promoted_at FROM ad_reintro_cohort");
    for (const row of pr.rows) protectedIds.set(String(row.keyword_id), String(row.promoted_at));
  } catch { /* no cohort table yet — nothing to protect */ }
  const nowMs = Date.now();
  let shielded = 0;

  // THE $4 RULE IS EVALUATED PER WORD, NOT PER KEYWORD ID.
  //
  // This account holds up to 18 copies of the same word — `phone tether` exists 18 times, 5 of them
  // ENABLED at $0.10 / $0.20 / $0.33 / $0.50 / $1.04. Judged per id, every copy sits under $4 while
  // the word is far past it, so the rule never fires; and on the one occasion it did fire
  // (2026-08-07, `phone tether` at $5.55) it paused a single copy and the word kept spending.
  // Spend is therefore summed across every copy of (text, matchType), and when the word fails the
  // rule EVERY enabled copy is paused together — including copies with no rows in this report,
  // which are exactly the ones that would otherwise inherit the traffic.
  const wordPerf = new Map<string, Perf & { text: string; match: string }>();
  for (const r of kt) {
    const k = byId.get(String(r.keywordId)); if (!k) continue;
    const key = `${(k.keywordText || "").toLowerCase().trim()}|${(k.matchType || "").toUpperCase()}`;
    const w = wordPerf.get(key) ?? { text: k.keywordText, match: k.matchType, spend: 0, orders: 0, sales: 0 };
    w.spend += r.cost ?? 0; w.orders += r.purchases14d ?? 0; w.sales += r.sales14d ?? 0;
    wordPerf.set(key, w);
  }
  const enabledByWord = new Map<string, Kw[]>();
  for (const k of kws) {
    if (k.state !== "ENABLED") continue;
    const key = `${(k.keywordText || "").toLowerCase().trim()}|${(k.matchType || "").toUpperCase()}`;
    const arr = enabledByWord.get(key) ?? []; arr.push(k); enabledByWord.set(key, arr);
  }
  const doomed = new Set<string>();
  for (const [key, w] of wordPerf) {
    if (!shouldKill(w)) continue;
    doomed.add(key);
    const copies = enabledByWord.get(key) ?? [];
    out.killed.push({ text: w.text, spend: +w.spend.toFixed(2), matchType: w.match, copies: copies.length });
  }

  const killOps: { keywordId: string; state: string }[] = [], bidOps: { keywordId: string; bid: number }[] = [];
  const killIdx = new Map<number, string>();   // op index -> word key, so outcomes map back to words
  for (const key of doomed) {
    for (const c of enabledByWord.get(key) ?? []) {
      killIdx.set(killOps.length, key);
      killOps.push({ keywordId: String(c.keywordId), state: "PAUSED" });
    }
  }
  if (doomed.size) out.notes.push(`$4 rule: ${doomed.size} word(s) failed, ${killOps.length} enabled copies to pause`);

  for (const r of kt) {
    const k = byId.get(String(r.keywordId)); if (!k || k.state !== "ENABLED") continue;
    const key = `${(k.keywordText || "").toLowerCase().trim()}|${(k.matchType || "").toUpperCase()}`;
    if (doomed.has(key)) continue;              // being paused; do not also re-bid it
    const perf: Perf = { spend: r.cost ?? 0, orders: r.purchases14d ?? 0, sales: r.sales14d ?? 0 };
    const v = decide(k.bid || NEW_KW_BID, perf); // ±10% bid at the 52% pivot (ad-rules.ts)
    if (v.action === "bid") {
      const promotedAt = protectedIds.get(String(k.keywordId));
      const isCut = v.bid < (k.bid || NEW_KW_BID);
      if (isCut && promotedAt && isProtected(promotedAt, nowMs)) { shielded++; continue; }
      const acos = perf.sales > 0 ? perf.spend / perf.sales : 0;
      bidOps.push({ keywordId: String(k.keywordId), bid: v.bid });
      out.bids.push({ text: k.keywordText, from: k.bid, to: v.bid, acos: +(acos * 100).toFixed(0) / 100 });
    }
  }
  if (shielded) out.notes.push(`${shielded} bid cuts suppressed: cohort inside the 14-day attribution window`);

  // (2) search terms -> harvest into the SOURCE ad group (H1 fix), William's >=$4 & ACOS<=50% rule.
  // Wrapped so a harvest-report failure (timeout, 4xx) can never block the kill/bid apply above.
  let addOps: HarvestAdd[] = [];
  try {
    const stRows: SearchTermRow[] = [];
    const hw = harvestWindows(HARVEST_WINDOW_DAYS, Date.now());
    for (let i = 0; i < hw.length; i++) {
      const { rows: chunk } = await deferredRows(cfg, token, out.notes, `engine-harvest-${i}`, "spSearchTerm", ["searchTerm"],
        ["searchTerm", "campaignId", "adGroupId", "clicks", "cost", "sales14d", "purchases14d"], hw[i][0], hw[i][1]);
      for (const r of chunk) stRows.push(r as SearchTermRow);
    }
    addOps = harvestCandidates(stRows, haveByAg, NEW_KW_BID);
    for (const a of addOps) out.added.push({ text: a.keywordText, matchType: a.matchType });
  } catch (e) { out.errors.push("harvest: " + (e instanceof Error ? e.message : String(e))); }

  if (!dryRun) {
    // Track whether Amazon ACCEPTED each batch. The log records outcomes, not intentions: before
    // this, a rejected add was still written as "add", which is how a 98-char keyword appeared in
    // ad_engine_log 8 times while never existing in the account (2026-08-01 loop).
    // r.ok is NOT the answer. Amazon returns 207 — inside the 2xx range, so ok is true — with a body
    // that splits the batch into success[] and error[]. Each op's fate is read out of that body.
    const applied = { kill: killOps.length === 0, bid: bidOps.length === 0, add: addOps.length === 0 };
    const note = (label: string, o: BulkOutcome, n: number) => {
      if (o.failed.length) {
        const f = o.failed[0];
        out.errors.push(`${label}: ${o.failed.length}/${n} refused — ${f.reason}${f.message ? ` (${f.message.slice(0, 120)})` : ""}`);
      }
      out.notes.push(`${label}: ${o.succeededIdx.size}/${n} accepted by Amazon`);
    };
    try {
      if (killOps.length) {
        const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: killOps }, KW_CT);
        const o = parseBulkOutcome(r.json, killOps.length);
        applied.kill = o.succeededIdx.size === killOps.length;
        note("kill", o, killOps.length);
        // Attribute each paused copy back to its word, so `killed` reports what really went off.
        const pausedByWord = new Map<string, number>();
        for (const i of o.succeededIdx) {
          const key = killIdx.get(i); if (!key) continue;
          pausedByWord.set(key, (pausedByWord.get(key) ?? 0) + 1);
        }
        for (const k of out.killed) {
          k.paused = pausedByWord.get(`${k.text.toLowerCase().trim()}|${(k.matchType || "").toUpperCase()}`) ?? 0;
        }
      }
      if (bidOps.length) {
        const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: bidOps }, KW_CT);
        const o = parseBulkOutcome(r.json, bidOps.length);
        applied.bid = o.succeededIdx.size === bidOps.length;
        note("bid", o, bidOps.length);
      }
      if (addOps.length) {
        const r = await ads(cfg, token, "/sp/keywords", "POST", { keywords: addOps }, KW_CT);
        const o = parseBulkOutcome(r.json, addOps.length);
        applied.add = o.succeededIdx.size === addOps.length;
        note("add", o, addOps.length);
        // Only keywords Amazon actually created are reported as added. Without this, a term it
        // refuses is re-harvested and re-logged every run forever — 40 times and counting for one.
        out.added = out.added.filter((_, i) => o.succeededIdx.has(i));
      }
    } catch (e) { out.errors.push(e instanceof Error ? e.message : String(e)); }
    // Persist every action to the decision log so the algorithm is auditable + trackable over time.
    try { await persistLog(out, applied); } catch (e) { out.errors.push("log: " + (e instanceof Error ? e.message : String(e))); }
  }

  out.ok = true; out.durationMs = Date.now() - start;
  return out;
}

// Decision log — one row per add/cut/re-bid, queryable history of what the engine did.
// Two guarantees (rules doc Rules 3 + 5):
//   1. `applied` records whether Amazon ACCEPTED the change. A rejected batch is logged with
//      applied=0 rather than silently recorded as done.
//   2. Every live run writes a `run` heartbeat row even when it took no action, so "did the $4
//      cutoff actually run?" is answerable. Without it, a run that did nothing is indistinguishable
//      from a cron that never fired — which is why 12:00 UTC has never appeared in the log.
async function persistLog(r: AdEngineResult, applied: { kill: boolean; bid: boolean; add: boolean }): Promise<void> {
  await db().execute(`CREATE TABLE IF NOT EXISTS ad_engine_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT NOT NULL, action TEXT NOT NULL,
    keyword TEXT, match_type TEXT, from_bid REAL, to_bid REAL, acos REAL, spend REAL)`);
  // Additive migration; ignore "duplicate column name" on re-run.
  await db().execute("ALTER TABLE ad_engine_log ADD COLUMN applied INTEGER DEFAULT 1").catch(() => {});
  const runAt = new Date().toISOString();
  const ins = async (action: string, kw: string | null, mt: string | null, fb: number | null, tb: number | null, acos: number | null, spend: number | null, ok: boolean) =>
    db().execute({
      sql: "INSERT INTO ad_engine_log (run_at,action,keyword,match_type,from_bid,to_bid,acos,spend,applied) VALUES (?,?,?,?,?,?,?,?,?)",
      args: [runAt, action, kw, mt, fb, tb, acos, spend, ok ? 1 : 0],
    });
  // Heartbeat first, so it lands even if a later insert fails.
  await ins("run", null, null, null, null, null, null, r.errors.length === 0);
  for (const k of r.killed) await ins("kill", k.text, null, null, null, null, k.spend, applied.kill);
  for (const a of r.added) await ins("add", a.text, a.matchType, null, null, null, null, applied.add);
  for (const b of r.bids) await ins("rebid", b.text, null, b.from, b.to, b.acos, null, applied.bid);
}

// ---------------------------------------------------------------------------
// Rule 4 — REINTRODUCTION of keywords stuck at the $0.10 floor
// ---------------------------------------------------------------------------
// 1,840 of 2,275 enabled keywords bid exactly $0.10 while July CPC was $0.59, so they win nothing
// and can never generate the ACOS signal any bid rule needs. This job walks them back on, at most
// REINTRO_PER_DAY a day, and only when they never spent or spent at ACOS < 50%.
//
// Every promoted keyword is recorded in `ad_reintro_cohort` so the three throttles can be measured
// from reality on each run rather than trusted from a cache:
//   perDay — promoted today. By William's choice (2026-08-02) this is the ONLY gate: no total
//            spend cap, and no ceiling on how many unproven keywords are in flight at once.
// Unproven-in-flight count and cohort month-to-date spend are both still measured and reported
// every run so the ramp stays visible, they just do not block a promotion.
// A promoted keyword then lives under Rule 1 like everything else: $4 of rope, then off. It leaves
// the trial pool by converting (proven) or by being killed at $4 (dead), so winners and losers both
// free their slot and the only bounded quantity is money at risk on UNPROVEN keywords right now.

export interface ReintroRunResult {
  ok: boolean; dryRun: boolean;
  promoted: ReintroPick[];
  /** Bids stepped up $0.10 because the keyword went a whole day without spending. */
  laddered: { keywordId: string; keywordText: string; from: number; to: number }[];
  /** At the $0.85 ceiling and STILL not spending. Needs William, never auto-raised. */
  escalated: { keywordId: string; keywordText: string; bid: number }[];
  eligible: number;
  blockedBy: string[];
  state: ReintroState;
  notes: string[];
  errors: string[]; durationMs: number; reason?: string;
}

// Lifetime evidence from our own database, backfilled from console exports (2019 onward) by
// scripts/ingest-keyword-csv.mjs. Amazon's reporting API only retains 95 days, and the monthly
// kill/bid rules are precisely what walked these words down to the floor, so the recent window
// records our own mistake rather than the keyword's worth. Keyed like deadKey(): "text|MATCHTYPE".
async function lifetimeRoasByKeyword(): Promise<Map<string, { roas: number; spend: number; sales: number; orders: number }>> {
  const out = new Map<string, { roas: number; spend: number; sales: number; orders: number }>();
  try {
    const r = await db().execute(
      `SELECT word, match_type, SUM(spend) AS spend, SUM(sales) AS sales, SUM(orders) AS orders
         FROM kw_lifetime
        WHERE COALESCE(ad_product,'SPONSORED_PRODUCTS') = 'SPONSORED_PRODUCTS'
          AND COALESCE(marketplace,'US') = 'US'
        GROUP BY word, match_type`);
    for (const row of r.rows) {
      const spend = Number(row.spend ?? 0), sales = Number(row.sales ?? 0), orders = Number(row.orders ?? 0);
      if (spend <= 0) continue;
      out.set(deadKey(String(row.word ?? ""), String(row.match_type ?? "")), { roas: sales / spend, spend, sales, orders });
    }
  } catch { /* table absent -> fall back to window-only evidence, never block the run */ }
  return out;
}

// Words retired for good ($4 with no conversion, or 3 consecutive dead months). A 95-day window
// makes a killed keyword look untested again by month four, so the tombstone is what stops us
// paying to relearn the same lesson every quarter.
async function deadKeySet(): Promise<Set<string>> {
  try {
    const r = await db().execute("SELECT dead_key FROM kw_tombstone");
    return new Set(r.rows.map((x) => String(x.dead_key)));
  } catch { return new Set(); }
}

async function reintroCohort(): Promise<{ ids: Set<string>; today: number }> {
  await db().execute(`CREATE TABLE IF NOT EXISTS ad_reintro_cohort (
    keyword_id TEXT PRIMARY KEY, keyword_text TEXT, match_type TEXT,
    promoted_at TEXT NOT NULL, from_bid REAL, to_bid REAL, reason TEXT)`);
  const r = await db().execute("SELECT keyword_id, promoted_at FROM ad_reintro_cohort");
  const todayIso = new Date().toISOString().slice(0, 10);
  const ids = new Set<string>();
  let today = 0;
  for (const row of r.rows as unknown as { keyword_id: string; promoted_at: string }[]) {
    ids.add(String(row.keyword_id));
    if (String(row.promoted_at).slice(0, 10) === todayIso) today++;
  }
  return { ids, today };
}

/** Bring floored keywords back, throttled. dryRun previews the exact batch without applying. */
export async function runReintroduction(opts: { dryRun?: boolean } = {}): Promise<ReintroRunResult> {
  const dryRun = opts.dryRun ?? true;   // preview by default — this switches on live spend
  const start = Date.now();
  const out: ReintroRunResult = {
    ok: false, dryRun, promoted: [], laddered: [], escalated: [], eligible: 0, blockedBy: [],
    state: { introducedToday: 0, inTrial: 0, cohortMonthSpend: 0 }, notes: [], errors: [], durationMs: 0,
  };
  const cfg = adsConfigFromEnv();
  if (!cfg || !cfg.profileId) { out.reason = "ADS_* env not configured"; out.durationMs = Date.now() - start; return out; }
  const token = await getAdsAccessToken(cfg);

  try {
    // (1) every ENABLED keyword sitting AT the floor
    const kws: Kw[] = [];
    const byIdRe = new Map<string, Kw>();
    let next: string | undefined;
    do {
      const r = await ads(cfg, token, "/sp/keywords/list", "POST", { maxResults: 1000, stateFilter: { include: ["ENABLED"] }, ...(next ? { nextToken: next } : {}) }, KW_CT);
      (r.json?.keywords ?? []).forEach((k: Kw) => {
        byIdRe.set(String(k.keywordId), k);                    // every enabled keyword, for the ladder
        if (k.state === "ENABLED" && (k.bid ?? 0) <= BID_FLOOR) kws.push(k);   // floored ones, for promotion
      });
      next = r.json?.nextToken;
    } while (next);

    // (2) longest history the API allows, stitched from <=31d chunks
    const hist = new Map<string, { cost: number; sales: number; orders: number }>();
    // SAFETY: a missing history window would make a keyword that spent badly look "never spent"
    // and therefore eligible. So every window must be READY before anything is promoted — a
    // partially-collected history is worse than none.
    let historyComplete = true;
    const rw = harvestWindows(REINTRO_HISTORY_DAYS, Date.now());
    for (let i = 0; i < rw.length; i++) {
      const [csd, ced] = rw[i];
      const { rows: chunk, ready } = await deferredRows(cfg, token, out.notes, `reintro-history-${i}`, "spTargeting", ["targeting"], SP_COLS, csd, ced);
      if (!ready) historyComplete = false;
      for (const r of chunk) {
        const id = String(r.keywordId ?? "");
        if (!id) continue;
        const o = hist.get(id) ?? { cost: 0, sales: 0, orders: 0 };
        o.cost += r.cost ?? 0; o.sales += r.sales14d ?? 0; o.orders += r.purchases14d ?? 0;
        hist.set(id, o);
      }
    }

    // (3) month-to-date spend, used for the cohort cap and the in-trial count
    const now = new Date();
    const mtd = new Map<string, { cost: number; orders: number }>();
    const mtdOut = await deferredRows(cfg, token, out.notes, "reintro-mtd", "spTargeting", ["targeting"], SP_COLS,
      iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), iso(now));
    for (const r of mtdOut.rows) {
      const id = String(r.keywordId ?? "");
      if (id) mtd.set(id, { cost: r.cost ?? 0, orders: r.purchases14d ?? 0 });
    }

    if (!historyComplete || !mtdOut.ready) {
      out.reason = "reports not collected yet — promoting nothing this run (incomplete history would misjudge eligibility)";
      out.notes.push(out.reason);
      out.ok = true; out.durationMs = Date.now() - start;
      return out;
    }

    // (4) measure the throttle state from reality
    const { ids: cohort, today } = await reintroCohort();
    let cohortMonthSpend = 0, inTrial = 0;
    for (const id of cohort) {
      const m = mtd.get(id);
      if (!m) { inTrial++; continue; }                       // promoted, no spend yet -> still on trial
      cohortMonthSpend += m.cost;
      if (m.cost < KILL_SPEND && m.orders === 0) inTrial++;  // rope not yet used up
    }
    // Today's cohort spend drives the circuit breaker. Amazon's account day resets at 07:00 UTC.
    // Preferred source is kw_daily (our own history). If it has not been written for today yet, fall
    // back to the month-to-date average, which is conservative on a ramping cohort because early
    // days are cheaper than late ones.
    const dayOfMonth = now.getUTCDate();
    let cohortSpendToday = cohortMonthSpend / Math.max(1, dayOfMonth);
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      // kw_daily is keyed by (word, match_type), not keywordId, so join through the cohort table.
      const q = await db().execute({
        sql: `SELECT COALESCE(SUM(d.spend),0) AS s
                FROM kw_daily d
                JOIN ad_reintro_cohort c
                  ON lower(trim(c.keyword_text)) = lower(trim(d.word))
                 AND upper(c.match_type)         = upper(d.match_type)
               WHERE substr(d.day,1,10) = ?
                 AND d.ad_product = 'SPONSORED_PRODUCTS'`,
        args: [todayIso],
      });
      const s = Number(q.rows[0]?.s ?? 0);
      if (s > 0) cohortSpendToday = s;
    } catch { /* kw_daily may lack keyword_id or today's rows — the average stands in */ }
    out.state = {
      introducedToday: today, inTrial,
      cohortMonthSpend: +cohortMonthSpend.toFixed(2),
      cohortSpendToday: +cohortSpendToday.toFixed(2),
    };

    // (5) decide
    const [lifetime, deadKeys] = await Promise.all([lifetimeRoasByKeyword(), deadKeySet()]);
    const candidates: ReintroCandidate[] = kws
      .filter((k) => !cohort.has(String(k.keywordId)))       // never re-promote the same keyword
      .map((k) => {
        const h = hist.get(String(k.keywordId));
        const lt = lifetime.get(deadKey(k.keywordText, k.matchType));
        return {
          keywordId: String(k.keywordId), keywordText: k.keywordText, matchType: k.matchType,
          bid: k.bid ?? 0, histSpend: h?.cost ?? 0, histSales: h?.sales ?? 0, histOrders: h?.orders ?? 0,
          lifetimeRoas: lt?.roas ?? null, lifetimeSpend: lt?.spend ?? 0,
          lifetimeSales: lt?.sales ?? 0, lifetimeOrders: lt?.orders ?? 0,
        };
      });
    out.notes.push(`lifetime evidence: ${lifetime.size} words, ${deadKeys.size} tombstoned`);
    const plan = selectReintroductions(candidates, out.state, { deadKeys });
    out.promoted = plan.promote;
    out.eligible = plan.eligible;
    out.blockedBy = plan.blockedBy;

    // (6) apply
    if (!dryRun && plan.promote.length) {
      const ops = plan.promote.map((p) => ({ keywordId: p.keywordId, bid: p.toBid }));
      const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: ops }, KW_CT);
      if (!r.ok) { out.errors.push(`reintro: ${r.status}`); out.promoted = []; }
      else {
        const at = new Date().toISOString();
        for (const p of plan.promote) {
          await db().execute({
            sql: "INSERT OR IGNORE INTO ad_reintro_cohort (keyword_id,keyword_text,match_type,promoted_at,from_bid,to_bid,reason) VALUES (?,?,?,?,?,?,?)",
            args: [p.keywordId, p.keywordText, p.matchType, at, p.fromBid, p.toBid, p.reason],
          });
          // Seed the ladder at the entry bid. Day one of the climb starts now.
          await db().execute({
            sql: `INSERT INTO kw_bid_state (keyword_id, word, match_type, current_bid, last_bid_change_at, ladder_active)
                  VALUES (?,?,?,?,?,1)
                  ON CONFLICT(keyword_id) DO UPDATE SET current_bid=excluded.current_bid, last_bid_change_at=excluded.last_bid_change_at, ladder_active=1`,
            args: [p.keywordId, p.keywordText.trim().toLowerCase(), p.matchType.toUpperCase(), p.toBid, at],
          });
        }
      }
    }

    // ---- Rule 5, the bid ladder (William 2026-08-05, wired 2026-08-06) --------------------
    // Enter at $0.25. Each whole day a promoted keyword goes without spending a cent, add $0.10,
    // up to $0.85. A keyword that HAS spent is left alone: it is producing data, so the ACOS rule
    // owns it and the $4 kill bounds it. At $0.85 and still silent, ask William rather than guess.
    try {
      const st = await db().execute(
        "SELECT keyword_id, word, match_type, current_bid, last_bid_change_at, escalated_at FROM kw_bid_state WHERE ladder_active = 1");
      const ladderOps: { keywordId: string; bid: number }[] = [];
      for (const row of st.rows) {
        const id = String(row.keyword_id);
        const k = byIdRe.get(id);
        if (!k || k.state !== "ENABLED") continue;             // paused or gone: not our business
        const changedAt = Date.parse(String(row.last_bid_change_at ?? "")) || 0;
        const v = ladderVerdict({
          bid: Number(row.current_bid ?? k.bid ?? 0),
          spendSinceStep: mtd.get(id)?.cost ?? 0,               // any spend at all means hands off
          daysSinceStep: changedAt ? Math.floor((Date.now() - changedAt) / 864e5) : 0,
        });
        if (v.action === "raise") {
          ladderOps.push({ keywordId: id, bid: v.bid });
          out.laddered.push({ keywordId: id, keywordText: k.keywordText, from: Number(row.current_bid ?? 0), to: v.bid });
        } else if (v.action === "escalate" && !row.escalated_at) {
          out.escalated.push({ keywordId: id, keywordText: k.keywordText, bid: v.bid });
        }
      }
      if (!dryRun && ladderOps.length) {
        const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: ladderOps }, KW_CT);
        if (!r.ok) { out.errors.push(`ladder: ${r.status}`); out.laddered = []; }
        else {
          const at = new Date().toISOString();
          for (const op of ladderOps) {
            await db().execute({
              sql: "UPDATE kw_bid_state SET current_bid = ?, last_bid_change_at = ? WHERE keyword_id = ?",
              args: [op.bid, at, op.keywordId],
            });
          }
        }
      }
      if (!dryRun && out.escalated.length) {
        const at = new Date().toISOString();
        for (const e of out.escalated) {
          await db().execute({ sql: "UPDATE kw_bid_state SET escalated_at = ? WHERE keyword_id = ?", args: [at, e.keywordId] });
        }
      }
      if (out.laddered.length) out.notes.push(`ladder: ${out.laddered.length} bids stepped up $${BID_LADDER_STEP.toFixed(2)}`);
      if (out.escalated.length) out.notes.push(`ladder: ${out.escalated.length} at the $${BID_LADDER_MAX.toFixed(2)} ceiling and still not spending — needs William`);
    } catch (e) { out.errors.push(`ladder: ${e instanceof Error ? e.message : String(e)}`); }

    out.ok = true;
  } catch (e) { out.errors.push(e instanceof Error ? e.message : String(e)); }
  out.durationMs = Date.now() - start;
  return out;
}

export function summarizeReintroduction(r: ReintroRunResult): string {
  const lines = [
    `Reintroduction ${r.dryRun ? "(preview)" : "ran"} — ${r.promoted.length} promoted of ${r.eligible} eligible. ${r.errors.length} errors. ${Math.round(r.durationMs / 1000)}s`,
    `Gate: ${r.state.introducedToday}/${REINTRO_PER_DAY} promoted today. Reported only: ${r.state.inTrial} unproven in flight (~$${(r.state.inTrial * KILL_SPEND).toFixed(2)} at risk), cohort spend MTD $${r.state.cohortMonthSpend}.`,
    r.blockedBy.length ? `Stopped by: ${r.blockedBy.join(", ")}.` : "",
    r.laddered.length ? `Bid ladder: ${r.laddered.length} stepped up.\n` + r.laddered.map((l) => `  $${l.from.toFixed(2)} -> $${l.to.toFixed(2)}  ${l.keywordText}`).join("\n") : "",
    r.escalated.length ? `NEEDS YOU: ${r.escalated.length} at the $0.85 ceiling and still not spending.\n` + r.escalated.map((e) => `  ${e.keywordText}`).join("\n") : "",
    "",
  ];
  r.promoted.forEach((p) => lines.push(`  ${p.reason.toUpperCase().padEnd(8)} $${p.fromBid} -> $${p.toBid}  [${p.matchType}] ${p.keywordText}`));
  if (r.notes.length) { lines.push("Reports: " + r.notes.join(" | ")); lines.push(""); }
  if (r.errors.length) lines.push("ERRORS: " + r.errors.join("; "));
  return lines.join("\n");
}

// Monthly reactivation job (ad-engine-harvest-rule.md step 4). Separate cadence from runAdEngine
// (which runs every 6h): this is invoked once a month. Lists PAUSED keywords, pulls their trailing
// 65d performance (chunked into <=31d Ads-API reports), and re-enables any that recovered to the
// >= $4 spend / ACOS <= 50% winner bar. dryRun previews without applying. Idempotent.
export async function runMonthlyReactivation(opts: { dryRun?: boolean } = {}): Promise<ReactivationResult> {
  const dryRun = opts.dryRun ?? false;
  const start = Date.now();
  const out: ReactivationResult = { ok: false, dryRun, reactivated: [], notes: [], errors: [], durationMs: 0 };
  const cfg = adsConfigFromEnv();
  if (!cfg || !cfg.profileId) { out.reason = "ADS_* env not configured"; out.durationMs = Date.now() - start; return out; }
  const token = await getAdsAccessToken(cfg);

  // paused keywords only
  const paused: Kw[] = [];
  let next: string | undefined;
  do {
    const r = await ads(cfg, token, "/sp/keywords/list", "POST", { maxResults: 1000, stateFilter: { include: ["PAUSED"] }, ...(next ? { nextToken: next } : {}) }, KW_CT);
    (r.json?.keywords ?? []).forEach((k: Kw) => { if (k.state === "PAUSED") paused.push(k); });
    next = r.json?.nextToken;
  } while (next);
  if (!paused.length) { out.ok = true; out.durationMs = Date.now() - start; return out; }

  // trailing 65d keyword performance, aggregated per keywordId across the chunked windows.
  // SAFETY: reactivation only re-enables keywords that PROVE recovery, so a missing window can
  // only ever under-qualify, never wrongly re-enable. Still, acting on half a history would give
  // a misleading picture, so every window must be collected before anything is re-enabled.
  let reactivateReady = true;
  const perfById = new Map<string, { cost: number; sales: number }>();
  try {
    for (const [csd, ced] of harvestWindows(REACT_WINDOW_DAYS, Date.now())) {
      const { rows: chunk, ready: chunkReady } = await deferredRows(cfg, token, out.notes, `reactivate-${csd}`, "spTargeting", ["targeting"], SP_COLS, csd, ced);
      if (!chunkReady) reactivateReady = false;
      for (const r of chunk) {
        if (r.keywordId == null) continue;
        const id = String(r.keywordId);
        const o = perfById.get(id) ?? { cost: 0, sales: 0 };
        o.cost += r.cost ?? 0; o.sales += r.sales14d ?? 0;
        perfById.set(id, o);
      }
    }
  } catch (e) { out.errors.push("reactivation report: " + (e instanceof Error ? e.message : String(e))); out.durationMs = Date.now() - start; return out; }

  if (!reactivateReady) {
    out.reason = "reports not collected yet — re-enabling nothing this run";
    out.notes.push(out.reason);
    out.ok = true; out.durationMs = Date.now() - start;
    return out;
  }

  const cands = reactivationCandidates(paused, perfById);
  for (const c of cands) out.reactivated.push({ text: c.keywordText, matchType: c.matchType, cost: c.cost, acos: c.acos });

  if (!dryRun && cands.length) {
    try {
      const ops = cands.map((c) => ({ keywordId: c.keywordId, state: "ENABLED" }));
      const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: ops }, KW_CT);
      if (!r.ok) out.errors.push(`reactivate: ${r.status}`);
    } catch (e) { out.errors.push(e instanceof Error ? e.message : String(e)); }
    try { await persistReactivation(out); } catch (e) { out.errors.push("log: " + (e instanceof Error ? e.message : String(e))); }
  }

  out.ok = true; out.durationMs = Date.now() - start;
  return out;
}

// Log each reactivation to the same auditable ad_engine_log (action = "reactivate").
async function persistReactivation(r: ReactivationResult): Promise<void> {
  await db().execute(`CREATE TABLE IF NOT EXISTS ad_engine_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT NOT NULL, action TEXT NOT NULL,
    keyword TEXT, match_type TEXT, from_bid REAL, to_bid REAL, acos REAL, spend REAL)`);
  const runAt = new Date().toISOString();
  for (const a of r.reactivated) {
    await db().execute({ sql: "INSERT INTO ad_engine_log (run_at,action,keyword,match_type,from_bid,to_bid,acos,spend) VALUES (?,?,?,?,?,?,?,?)", args: [runAt, "reactivate", a.text, a.matchType, null, null, a.acos, a.cost] });
  }
}

export function summarizeReactivation(r: ReactivationResult): string {
  const lines = [`Monthly reactivation ${r.dryRun ? "(preview)" : "ran"} — ${r.reactivated.length} keywords re-enabled. ${r.errors.length} errors. ${Math.round(r.durationMs / 1000)}s`, ""];
  if (r.reactivated.length) { lines.push("RE-ENABLED (paused but trailing 65d holds >=$4 spend, ACOS<=50%):"); r.reactivated.forEach((a) => lines.push(`  ${a.matchType}  ACOS ${(a.acos * 100).toFixed(0)}%  $${a.cost} spend  ${a.text}`)); lines.push(""); }
  if (r.errors.length) lines.push("ERRORS: " + r.errors.join("; "));
  return lines.join("\n");
}

export function summarizeAdEngine(r: AdEngineResult): string {
  const lines = [
    `Ad engine ${r.dryRun ? "(preview)" : "ran"} — ${r.killed.length} paused, ${r.bids.length} bid changes, ${r.added.length} keywords added. ${r.errors.length} errors. ${Math.round(r.durationMs / 1000)}s`,
    "",
  ];
  if (r.killed.length) {
    lines.push("PAUSED (>=$4 MTD spend across ALL copies, no sale or ACOS>=52%):");
    r.killed.forEach((k) => lines.push(
      `  $${k.spend} wasted  ${k.matchType} "${k.text}"  — ${k.paused ?? 0}/${k.copies} enabled copies paused`));
    lines.push("");
  }
  if (r.added.length) { lines.push("HARVESTED keywords (>=$4 spend, ACOS<=50%, into source ad group):"); r.added.forEach((a) => lines.push(`  ${a.matchType}  ${a.text}`)); lines.push(""); }
  if (r.bids.length) { lines.push("BID changes (±10% at the 50% ACOS pivot):"); r.bids.slice(0, 30).forEach((b) => lines.push(`  ACOS ${(b.acos * 100).toFixed(0)}%  $${b.from}->$${b.to}  ${b.text}`)); lines.push(""); }
  if (r.errors.length) lines.push("ERRORS: " + r.errors.join("; "));
  return lines.join("\n");
}
