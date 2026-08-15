// Sponsored Display kill engine — William's $4 rule, applied to the last ad product that had no
// rule at all.
//
// Context (2026-08-08). Sponsored Display is the worst performer in the account: $4,546.85 spent
// since 2019 against $3,976.33 of sales, a 0.87x return, against a 1.92x break-even. It returns
// less than half what it costs and it has never been governed by anything — Sponsored Products has
// had the $4 rule for weeks, Sponsored Brands got it on 2026-08-07, and Display was still running
// on $200/day of authorised budget with nobody watching. William 2026-08-08: "all ads need a $4
// kill switch — products brands and display. this is so important."
//
// Three design choices, each one a lesson already paid for on another ad product:
//
//  1. EVERY TARGET STANDS ALONE (William 2026-08-08: "Each spend is individual"). A target is
//     judged on its own month-to-date spend and paused on its own. Spend is NEVER summed across
//     targets that happen to point at the same ASIN, and pausing one never pauses another. This is
//     the same rule Sponsored Products has always applied per keyword id.
//
//  2. THE TARGET IS THE UNIT, NOT THE ADVERTISED ASIN. In Display the bid lives on the target, so
//     the target is the exact analogue of a keyword. The advertised product carries the SAME
//     dollars seen from a different angle — acting on both would judge one dollar twice, and
//     pausing a product ad stops advertising that product entirely rather than trimming what is
//     not working. ASIN-level spend is REPORTED here so nothing is invisible, and left unjudged.
//
//  3. IT RECORDS OUTCOMES, NOT INTENTIONS. Amazon answers bulk writes with per-item results, and
//     treating the envelope as success is how one impossible keyword logged applied=1 forty times
//     while never existing. Only ids Amazon confirmed are recorded as paused.
//
// Verified against the live account 2026-08-08 before this was written: GET /sd/targets 200
// (104 targets, 81 enabled), GET /sd/productAds 200 (129, 88 enabled), GET /sd/campaigns 200
// (14, 8 enabled). State strings come back LOWERCASE from Display, unlike Products.
//
// The sdTargeting report is CONFIRMED working, and `targetingId` carries a real, actionable id on
// every row. Worth knowing: Sponsored Display reports take about TEN TO FIFTEEN MINUTES to
// complete, where Sponsored Products finishes in ~9. Two separate probes read "still pending" after
// 550s and both were COMPLETED when polled again later. That is why this engine uses the deferred
// getReport() path rather than polling inline — a run that only manages to request the report exits
// clean and the next 6-hourly run collects it.
//
// First live read, 2026-08-08: 28 targets with rows, 5 with spend, $3.69 month-to-date and $0.00
// sales. Nothing past the $4 bar, so nothing was paused — correct, not a failure. Note the
// implication: at ~$3.69/month across the whole product, a single target rarely reaches $4 inside
// one calendar month, so this rule is a guardrail against Display scaling up again rather than
// something that will claw back the 0.87x lifetime loss on its own.

import { db } from "@/lib/db/client";
import { recordBidRun, type LedgerObservation } from "./bid-ledger";
import { approvedCeilings, unaskedGates, markAsked, formatGateAsk } from "./bid-gate";
import { adsConfigFromEnv, getAdsAccessToken, type AdsConfig } from "./ads-api";
import { getReport, type ReportSpec } from "./ads-reports";
import { shouldKill, acosOf, KILL_SPEND, ACOS_PIVOT, type Perf,
  planBids, KILL_MIN_ROAS, type BidCandidate, type BidPlan,
  SD_BID_STEP, SD_CUT_STEP, SD_START_BID, SD_BID_COOLDOWN_HOURS, SD_BID_FLOOR,
} from "./ad-rules";

const BASE = "https://advertising-api.amazon.com";

/** Month-to-date performance of one Display target, straight from the sdTargeting report. */
export interface SdTargetPerf {
  targetId: string;
  text: string;          // resolved targeting expression, for the log and the email
  spend: number; sales: number; orders: number; clicks: number; impressions: number;
}
/** Current live state of one Display target. Display returns states lowercase. */
export interface SdTargetState {
  targetId: string; state: string; campaignId: string; adGroupId: string; bid: number | null;
}
export interface SdKillRow {
  targetId: string; text: string;
  spend: number; sales: number; orders: number;
  acos: number | null;
  applied: boolean; refusedCode?: string;
  /** ENABLED, but its campaign is not, so Amazon accepts the call and changes nothing. */
  unwritable: boolean;
}
export interface SdKillPlan {
  kill: SdKillRow[];
  /** Past $4 but profitable — left running, and named so the decision is visible. */
  survived: { targetId: string; text: string; spend: number; acos: number | null }[];
  /** Past $4 and unprofitable, but already paused or archived. Nothing to do. */
  alreadyOff: number;
}

/**
 * PURE selector, unit-tested without the API.
 *
 * Each target is judged on its OWN spend against the shared rule: $4+ month-to-date AND
 * unprofitable, meaning no orders at all or an ACOS at/above the 52% break-even pivot. Nothing is
 * grouped, nothing is summed across targets, and one target's verdict never touches another's.
 */
export function selectSdKills(
  perf: SdTargetPerf[],
  byId: Map<string, SdTargetState>,
  enabledCampaigns: Set<string>,
  killSpend = KILL_SPEND,
  pivot = ACOS_PIVOT,
): SdKillPlan {
  const plan: SdKillPlan = { kill: [], survived: [], alreadyOff: 0 };
  for (const p of perf) {
    const m: Perf = { spend: p.spend, orders: p.orders, sales: p.sales };
    const acos = acosOf(m);
    if (!shouldKill(m, killSpend, pivot)) {
      if (p.spend >= killSpend) {
        plan.survived.push({ targetId: p.targetId, text: p.text, spend: +p.spend.toFixed(2), acos: acos === null ? null : +acos.toFixed(2) });
      }
      continue;
    }
    const live = byId.get(p.targetId);
    if (!live || live.state.toUpperCase() !== "ENABLED") { plan.alreadyOff++; continue; }
    plan.kill.push({
      targetId: p.targetId, text: p.text,
      spend: +p.spend.toFixed(2), sales: +p.sales.toFixed(2), orders: p.orders,
      acos: acos === null ? null : +acos.toFixed(2),
      applied: false,
      unwritable: !enabledCampaigns.has(live.campaignId),
    });
  }
  // Most expensive first, so a truncated email still leads with the worst offender.
  plan.kill.sort((a, b) => b.spend - a.spend);
  plan.survived.sort((a, b) => b.spend - a.spend);
  return plan;
}

export interface SdEngineResult {
  /** bid moves this run — the same rules Products and Brands use (William 2026-08-13) */
  bidPlan?: BidPlan;
  bidsApplied?: number;
  ok: boolean; dryRun: boolean;
  month: string;
  scanned: number;            // targets with a report row
  monthSpend: number; monthSales: number;
  killed: SdKillRow[];
  survived: SdKillPlan["survived"];
  alreadyOff: number;
  /** ASIN-level spend, reported for visibility only — never judged (see design note 2). */
  asins: { asin: string; spend: number; sales: number; orders: number }[];
  notes: string[]; errors: string[];
  durationMs: number; reason?: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The ONE place the Display report spec is built, so the warm-up cron and this engine share a
 *  cache key exactly. Display reports take 10-15 minutes; warming them ahead is what keeps this
 *  engine acting on minutes-old data rather than sitting out a whole 6-hour slot. */
export function sdReportSpec(nowMs = Date.now()): ReportSpec {
  const now = new Date(nowMs);
  return {
    purpose: "sd-engine-mtd", adProduct: "SPONSORED_DISPLAY", reportTypeId: "sdTargeting",
    groupBy: ["targeting"],
    // impressions is NOT optional. planBids treats "no impressions and no clicks" as "not in the
    // auction yet" and answers by RAISING. Without this column every target reads as zero
    // impressions forever, so a target with 20,000 impressions and no clicks — a creative problem,
    // not a bid problem — gets a nickel added every day until it hits the $0.85 gate.
    columns: ["targetingId", "targetingText", "impressions", "clicks", "cost", "sales", "purchases"],
    startDate: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
    endDate: iso(now),
  };
}

async function sd(cfg: AdsConfig, token: string, path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Amazon-Advertising-API-ClientId": cfg.clientId,
      "Amazon-Advertising-API-Scope": String(cfg.profileId),
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep the raw text for the error path */ }
  return { ok: res.ok, status: res.status, json, text };
}

/** Page through a Display collection endpoint. Display uses startIndex/count, not nextToken. */
async function pageAll<T>(cfg: AdsConfig, token: string, path: string): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += 500) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await sd(cfg, token, `${path}${sep}count=500&startIndex=${start}`);
    const page = Array.isArray(r.json) ? (r.json as T[]) : [];
    out.push(...page);
    if (page.length < 500) break;
  }
  return out;
}

export async function runSdEngine(opts: { dryRun?: boolean } = {}): Promise<SdEngineResult> {
  const dryRun = opts.dryRun ?? true;
  const start = Date.now();
  const now = new Date();
  const monthStart = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const out: SdEngineResult = {
    ok: false, dryRun, month: monthStart, scanned: 0, monthSpend: 0, monthSales: 0,
    killed: [], survived: [], alreadyOff: 0, asins: [], notes: [], errors: [], durationMs: 0,
  };
  const cfg = adsConfigFromEnv();
  if (!cfg?.profileId) { out.reason = "ADS_* env not configured"; out.durationMs = Date.now() - start; return out; }
  const token = await getAdsAccessToken(cfg);

  // (1) month-to-date, per TARGET. Uses the same deferred report machinery as Sponsored Products,
  //     so a run that only manages to REQUEST the report exits cleanly and the next one collects it.
  const rep = await getReport<Record<string, unknown>>(cfg, token, sdReportSpec(now.getTime()));
  if (rep.state !== "ready") {
    // Not an error: Amazon's queue takes minutes and the next 6-hourly run collects it. Acting on a
    // partial month would read a target's spend as lower than it is and let it past the $4 bar.
    out.reason = `sdTargeting report ${rep.state} — nothing judged this run`;
    out.notes.push(out.reason);
    out.ok = true; out.durationMs = Date.now() - start; return out;
  }

  const perf: SdTargetPerf[] = [];
  for (const r of rep.rows) {
    const targetId = String(r.targetingId ?? "");
    if (!targetId) continue;
    const p: SdTargetPerf = {
      targetId,
      text: String(r.targetingText ?? ""),
      spend: Number(r.cost ?? 0), sales: Number(r.sales ?? 0),
      orders: Number(r.purchases ?? 0), clicks: Number(r.clicks ?? 0), impressions: Number(r.impressions ?? 0),
    };
    out.monthSpend += p.spend; out.monthSales += p.sales;
    perf.push(p);
  }
  out.scanned = perf.length;
  out.monthSpend = +out.monthSpend.toFixed(2);
  out.monthSales = +out.monthSales.toFixed(2);

  // (2) live state. A target inside a non-ENABLED campaign is reported, not silently attempted.
  const [targets, camps] = await Promise.all([
    pageAll<{ targetId: number; state: string; campaignId: number; adGroupId: number; bid?: number }>(cfg, token, "/sd/targets"),
    pageAll<{ campaignId: number; state: string }>(cfg, token, "/sd/campaigns"),
  ]);
  const byId = new Map<string, SdTargetState>(targets.map((t) => [String(t.targetId), {
    targetId: String(t.targetId), state: String(t.state ?? ""), campaignId: String(t.campaignId),
    adGroupId: String(t.adGroupId), bid: t.bid ?? null,
  }]));
  const enabledCampaigns = new Set(
    camps.filter((c) => String(c.state ?? "").toUpperCase() === "ENABLED").map((c) => String(c.campaignId)));

  // (3) decide — each target on its own
  const plan = selectSdKills(perf, byId, enabledCampaigns);
  out.survived = plan.survived;
  out.alreadyOff = plan.alreadyOff;

  // (3b) BIDS — the same planner Products and Brands use (William 2026-08-13: "we need the rules
  //      to apply to all three different types of campaigns"). Display had the $4 kill and nothing
  //      else until now. Targets the kill is about to take are skipped inside planBids.
  const candidates: BidCandidate[] = [];
  for (const p of perf) {
    const t = byId.get(p.targetId);
    if (!t || String(t.state).toUpperCase() !== "ENABLED") continue;
    candidates.push({
      id: p.targetId, label: p.text || p.targetId, bid: t.bid ?? null,
      spend: p.spend, sales: p.sales, orders: p.orders, clicks: p.clicks, impressions: p.impressions,
      writable: enabledCampaigns.has(t.campaignId),
    });
  }
  const ceilings = await approvedCeilings("SPONSORED_DISPLAY");
  for (const c of candidates) c.approvedCeiling = ceilings.get(c.id) ?? null;
  // Display moves in NICKELS and at most ONCE A DAY (William 2026-08-13). Retargeting produces far
  // fewer clicks than search, so a six-hour window holds almost no evidence, and a dime crosses a
  // third of the usable $0.10-$0.48 range in a single move.
  const bidPlan = planBids(candidates, {
    step: SD_BID_STEP, cut: SD_CUT_STEP, defaultBid: SD_START_BID, floor: SD_BID_FLOOR,
  });
  out.bidPlan = bidPlan;
  const obs: LedgerObservation[] = candidates.map((c) => ({
    entityId: c.id, label: c.label, bid: c.bid ?? 0,
    counters: { spend: c.spend, sales: c.sales, orders: c.orders, clicks: c.clicks, impressions: c.impressions ?? 0 },
  }));
  const ledgerMonth = monthStart.slice(0, 7);
  if (bidPlan.blocked) out.notes.push(`${bidPlan.blocked} bid change(s) sit in a campaign that is not ENABLED — Amazon will not take them`);
  if (bidPlan.escalated.length && !dryRun) {
    try {
      const fresh = await unaskedGates("SPONSORED_DISPLAY", bidPlan.escalated);
      if (fresh.length) {
        const { sendTelegram, telegramConfigured } = await import("@/lib/notify/telegram");
        const text = formatGateAsk("SPONSORED_DISPLAY", fresh);
        if (telegramConfigured()) { await sendTelegram(text); await markAsked("SPONSORED_DISPLAY", fresh); out.notes.push(`asked William about ${fresh.length} keyword(s) at their ceiling`); }
        else out.notes.push(`${fresh.length} at their ceiling, but Telegram is not configured — nothing sent`);
      }
    } catch (e) { out.errors.push(`gate ask: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (bidPlan.escalated.length) {
    out.notes.push(`NEEDS YOU: ${bidPlan.escalated.length} Sponsored Display target(s) are at their approved ceiling and still not spending`);
  }
  if (!dryRun && !bidPlan.moves.length) {
    try { await recordBidRun("SPONSORED_DISPLAY", ledgerMonth, obs, new Map()); }
    catch (e) { out.errors.push(`sd ledger: ${e instanceof Error ? e.message : String(e)}`); }
  }
  // ONCE A DAY. The ledger already records when each bid level started, so the cadence guard reads
  // that rather than keeping a second clock. An entity whose current bid is younger than 24h is
  // left alone however tempting the numbers look this run.
  if (bidPlan.moves.length) {
    try {
      const { epochsFor } = await import("./bid-ledger");
      const tooYoung: string[] = [];
      for (const mv of bidPlan.moves) {
        const eps = await epochsFor(mv.id, "SPONSORED_DISPLAY");
        const cur = eps[eps.length - 1];
        if (cur && (Date.now() - Date.parse(cur.openedAt)) < SD_BID_COOLDOWN_HOURS * 3.6e6) tooYoung.push(mv.id);
      }
      if (tooYoung.length) {
        const held = new Set(tooYoung);
        bidPlan.moves = bidPlan.moves.filter((mv) => !held.has(mv.id));
        out.notes.push(`${tooYoung.length} Display bid change(s) held: current bid younger than ${SD_BID_COOLDOWN_HOURS}h`);
      }
    } catch (e) { out.errors.push(`sd cadence: ${e instanceof Error ? e.message : String(e)}`); }
  }

  if (!dryRun && bidPlan.moves.length) {
    try {
      const rb = await sd(cfg, token, "/sd/targets", "PUT",
        bidPlan.moves.map((mv) => ({ targetId: Number(mv.id), bid: mv.toBid })));
      const itemsB = Array.isArray(rb.json) ? rb.json as { targetId?: number; code?: string }[] : [];
      const okIds = new Set(itemsB.filter((i) => String(i.code ?? "").toUpperCase() === "SUCCESS").map((i) => String(i.targetId)));
      out.bidsApplied = okIds.size;
      // only bids Amazon ACCEPTED enter the history
      const acceptedSd = new Map(bidPlan.moves.filter((mv) => okIds.has(mv.id))
        .map((mv) => [mv.id, { fromBid: mv.fromBid, toBid: mv.toBid, direction: mv.direction, reason: mv.reason }]));
      try { await recordBidRun("SPONSORED_DISPLAY", ledgerMonth, obs, acceptedSd); }
      catch (e) { out.errors.push(`sd ledger: ${e instanceof Error ? e.message : String(e)}`); }
      if (!rb.ok) out.errors.push(`sd bids: HTTP ${rb.status} ${rb.text.slice(0, 160)}`);
      const refusedB = bidPlan.moves.length - okIds.size;
      if (refusedB) out.errors.push(`sd bids: ${refusedB}/${bidPlan.moves.length} refused`);
      const runAtB = new Date().toISOString();
      for (const mv of bidPlan.moves) {
        await db().execute({
          sql: `INSERT INTO ad_engine_log (run_at,action,keyword,match_type,from_bid,to_bid,acos,spend,applied,ad_product)
                VALUES (?,?,?,?,?,?,?,?,?,?)`,
          args: [runAtB, "rebid", mv.label, null, mv.fromBid, mv.toBid, null, null, okIds.has(mv.id) ? 1 : 0, "SPONSORED_DISPLAY"],
        });
      }
    } catch (e) { out.errors.push(`sd bids: ${e instanceof Error ? e.message : String(e)}`); }
  }

  if (!plan.kill.length) {
    out.notes.push(`nothing past $${KILL_SPEND} unprofitably (kill line ${KILL_MIN_ROAS.toFixed(1)}x)`);
    out.ok = true; out.durationMs = Date.now() - start; return out;
  }
  if (dryRun) {
    out.killed = plan.kill;
    out.ok = true; out.durationMs = Date.now() - start; return out;
  }

  // (4) apply. PUT /sd/targets takes a bare array and answers per item with a code.
  const writable = plan.kill.filter((k) => !k.unwritable);
  if (writable.length) {
    const r = await sd(cfg, token, "/sd/targets", "PUT",
      writable.map((k) => ({ targetId: Number(k.targetId), state: "paused" })));
    const items = Array.isArray(r.json) ? r.json as { targetId?: number; code?: string; details?: string }[] : [];
    const byTarget = new Map(items.map((i) => [String(i.targetId), i]));
    for (const k of writable) {
      const item = byTarget.get(k.targetId);
      // SUCCESS is the only thing that counts as applied. No item mentioned, no claim made.
      if (item && String(item.code ?? "").toUpperCase() === "SUCCESS") k.applied = true;
      else k.refusedCode = item ? String(item.code ?? "UNKNOWN") : "NOT_ACKNOWLEDGED";
    }
    if (!r.ok) out.errors.push(`sd kill: HTTP ${r.status} ${r.text.slice(0, 160)}`);
    const refused = writable.filter((k) => !k.applied).length;
    if (refused) out.errors.push(`sd kill: ${refused}/${writable.length} refused`);
  }
  const blocked = plan.kill.length - writable.length;
  if (blocked) out.notes.push(`${blocked} target(s) past the bar sit in a campaign that is not ENABLED — Amazon will not change them`);

  // (5) log what actually happened, per target
  const runAt = new Date().toISOString();
  for (const k of plan.kill) {
    out.killed.push(k);
    try {
      await db().execute({
        sql: `INSERT INTO ad_engine_log (run_at,action,keyword,match_type,from_bid,to_bid,acos,spend,applied,ad_product)
              VALUES (?,?,?,?,?,?,?,?,?,?)`,
        args: [runAt, "kill", k.text || k.targetId, "TARGET", null, null, k.acos, k.spend,
               k.applied ? 1 : 0, "SPONSORED_DISPLAY"],
      });
    } catch (e) { out.errors.push(`log: ${e instanceof Error ? e.message : String(e)}`); }
  }

  out.ok = true; out.durationMs = Date.now() - start;
  return out;
}

export function summarizeSdEngine(r: SdEngineResult): string {
  const L: string[] = [];
  L.push(`Sponsored Display ${r.month} to date: $${r.monthSpend.toFixed(2)} spend, $${r.monthSales.toFixed(2)} sales, ${r.scanned} targets with activity.`);
  if (r.reason) L.push(`  ${r.reason}`);
  if (r.killed.length) {
    L.push(``, `PAUSED (past $${KILL_SPEND} and unprofitable), each judged on its own spend:`);
    for (const k of r.killed) {
      const acos = k.acos === null ? "no sale" : `${Math.round(k.acos * 100)}% ACOS`;
      L.push(`  $${k.spend.toFixed(2)}  ${k.orders} orders, ${acos}  ${k.text || k.targetId}`);
      L.push(`     target ${k.targetId}: ${k.applied ? "PAUSED" : k.refusedCode ? `refused (${k.refusedCode})` : k.unwritable ? "not writable — campaign is not ENABLED" : "not applied"}`);
    }
  }
  if (r.survived.length) {
    L.push(``, `Over $${KILL_SPEND} but PROFITABLE, left running:`);
    for (const s of r.survived) L.push(`  $${s.spend.toFixed(2)}  ${s.acos === null ? "-" : Math.round(s.acos * 100) + "% ACOS"}  ${s.text || s.targetId}`);
  }
  if (r.alreadyOff) L.push(``, `${r.alreadyOff} target(s) past the bar were already paused or archived.`);
  for (const n of r.notes) L.push(`note: ${n}`);
  for (const e of r.errors) L.push(`ERROR: ${e}`);
  return L.join("\n");
}
