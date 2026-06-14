import { gunzipSync } from "node:zlib";
import { adsConfigFromEnv, getAdsAccessToken, type AdsConfig } from "./ads-api";

// Autonomous Sponsored-Products engine. Designed to run every few hours via cron,
// so every action is SAFE TO REPEAT:
//   - KILL switch: ENABLED keyword, >= $4 spend & 0 orders (30d)  -> pause (idempotent)
//   - HARVEST: converting search terms not yet keywords -> add exact+phrase (deduped)
//   - BID: target-ACOS convergence (toward 30%), capped ±25%/run, floor/cap -> NOT compounding
// Apply is gated behind dryRun. Reuses the LWA token + region from ads-api.ts.

const BASE = "https://advertising-api.amazon.com";
const KW_CT = "application/vnd.spKeyword.v3+json";
const RPT_CT = "application/vnd.createasyncreportrequest.v3+json";
const TARGET_ACOS = 0.30;     // low-margin product
const KILL_SPEND = 4;         // $ with 0 orders -> pause
const FLOOR = 0.10, CAP = 2.50, MAX_STEP = 0.25; // ±25% per run
const NEW_KW_BID = 0.50, WINDOW_DAYS = 30;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d: Date) => d.toISOString().slice(0, 10);

interface Kw { keywordId: string; keywordText: string; matchType: string; state: string; bid: number; campaignId: string; adGroupId: string }
interface Row { keywordId?: string; keyword?: string; searchTerm?: string; matchType?: string; clicks?: number; cost?: number; sales14d?: number; purchases14d?: number }
export interface AdEngineResult {
  ok: boolean; dryRun: boolean;
  killed: { text: string; spend: number }[];
  bids: { text: string; from: number; to: number; acos: number }[];
  added: { text: string; matchType: string }[];
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

async function report(cfg: AdsConfig, token: string, reportTypeId: string, groupBy: string[], columns: string[], sd: string, ed: string): Promise<Row[]> {
  const cfgBody = { name: "eng", startDate: sd, endDate: ed, configuration: { adProduct: "SPONSORED_PRODUCTS", groupBy, columns, reportTypeId, timeUnit: "SUMMARY", format: "GZIP_JSON" } };
  const cr = await ads(cfg, token, "/reporting/reports", "POST", cfgBody, RPT_CT);
  let rid: string | undefined = cr.json?.reportId;
  if (!rid && cr.json?.code === "425") rid = String(cr.json.detail || "").match(/([0-9a-f-]{36})/)?.[1];
  if (!rid) throw new Error(`report create failed: ${JSON.stringify(cr.json).slice(0, 200)}`);
  let url: string | undefined;
  for (let i = 0; i < 28; i++) {           // ~28 * 5s = 140s budget per report
    await sleep(5000);
    const s = await ads(cfg, token, `/reporting/reports/${rid}`, "GET", null, RPT_CT);
    if (s.json?.status === "COMPLETED") { url = s.json.url; break; }
    if (s.json?.status === "FAILURE") throw new Error("report FAILURE");
  }
  if (!url) throw new Error("report timed out");
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  return JSON.parse(gunzipSync(buf).toString());
}

const round = (n: number) => Math.max(FLOOR, Math.min(CAP, +n.toFixed(2)));

export async function runAdEngine(opts: { dryRun?: boolean } = {}): Promise<AdEngineResult> {
  const dryRun = opts.dryRun ?? false;
  const start = Date.now();
  const out: AdEngineResult = { ok: false, dryRun, killed: [], bids: [], added: [], errors: [], durationMs: 0 };
  const cfg = adsConfigFromEnv();
  if (!cfg || !cfg.profileId) { out.reason = "ADS_* env not configured"; out.durationMs = Date.now() - start; return out; }
  const token = await getAdsAccessToken(cfg);

  // keywords
  const kws: Kw[] = [];
  let next: string | undefined;
  do {
    const r = await ads(cfg, token, "/sp/keywords/list", "POST", { maxResults: 1000, ...(next ? { nextToken: next } : {}) }, KW_CT);
    (r.json?.keywords ?? []).forEach((k: any) => kws.push(k));
    next = r.json?.nextToken;
  } while (next);
  const byId = new Map(kws.map((k) => [String(k.keywordId), k]));
  const have = new Set(kws.map((k) => k.matchType + "|" + (k.keywordText || "").toLowerCase().trim()));
  // harvest target: an enabled manual (exact/phrase) keyword's ad group
  const anchor = kws.find((k) => k.state === "ENABLED" && (k.matchType === "EXACT" || k.matchType === "PHRASE") && k.campaignId && k.adGroupId);

  const ed = iso(new Date()), sd = iso(new Date(Date.now() - WINDOW_DAYS * 864e5));

  // (1) keyword performance -> kill + bid
  const kt = await report(cfg, token, "spTargeting", ["targeting"], ["keywordId", "keyword", "clicks", "cost", "sales14d", "purchases14d"], sd, ed);
  const killOps: any[] = [], bidOps: any[] = [];
  for (const r of kt) {
    const k = byId.get(String(r.keywordId)); if (!k || k.state !== "ENABLED") continue;
    const cost = r.cost ?? 0, ord = r.purchases14d ?? 0, sales = r.sales14d ?? 0;
    if (cost >= KILL_SPEND && ord === 0) { killOps.push({ keywordId: String(k.keywordId), state: "PAUSED" }); out.killed.push({ text: k.keywordText, spend: +cost.toFixed(2) }); continue; }
    if (ord > 0 && sales > 0) {
      const acos = cost / sales;
      let target = (k.bid || NEW_KW_BID) * (TARGET_ACOS / acos);          // converge to target ACOS
      const lo = (k.bid || NEW_KW_BID) * (1 - MAX_STEP), hi = (k.bid || NEW_KW_BID) * (1 + MAX_STEP);
      target = round(Math.max(lo, Math.min(hi, target)));                  // cap step ±25%/run
      if (Math.abs(target - (k.bid || 0)) >= 0.02) { bidOps.push({ keywordId: String(k.keywordId), bid: target }); out.bids.push({ text: k.keywordText, from: k.bid, to: target, acos: +(acos * 100).toFixed(0) / 100 }); }
    }
  }

  // (2) search terms -> harvest
  let addOps: any[] = [];
  if (anchor) {
    const st = await report(cfg, token, "spSearchTerm", ["searchTerm"], ["searchTerm", "keyword", "matchType", "clicks", "cost", "sales14d", "purchases14d"], sd, ed);
    const agg = new Map<string, { ord: number }>();
    for (const r of st) { if (!r.searchTerm) continue; const o = agg.get(r.searchTerm) ?? { ord: 0 }; o.ord += r.purchases14d ?? 0; agg.set(r.searchTerm, o); }
    for (const [term, o] of agg) {
      const t = term.toLowerCase().trim();
      if (o.ord <= 0 || /^b0[a-z0-9]{8}$/i.test(term)) continue;
      for (const mt of ["EXACT", "PHRASE"]) {
        if (have.has(mt + "|" + t)) continue;
        addOps.push({ campaignId: String(anchor.campaignId), adGroupId: String(anchor.adGroupId), keywordText: term, matchType: mt, state: "ENABLED", bid: NEW_KW_BID });
        out.added.push({ text: term, matchType: mt });
      }
    }
  }

  if (!dryRun) {
    try {
      if (killOps.length) { const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: killOps }, KW_CT); if (!r.ok) out.errors.push(`kill: ${r.status}`); }
      if (bidOps.length) { const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: bidOps }, KW_CT); if (!r.ok) out.errors.push(`bid: ${r.status}`); }
      if (addOps.length) { const r = await ads(cfg, token, "/sp/keywords", "POST", { keywords: addOps }, KW_CT); if (!r.ok) out.errors.push(`add: ${r.status}`); }
    } catch (e) { out.errors.push(e instanceof Error ? e.message : String(e)); }
  }

  out.ok = true; out.durationMs = Date.now() - start;
  return out;
}

export function summarizeAdEngine(r: AdEngineResult): string {
  const lines = [
    `Ad engine ${r.dryRun ? "(preview)" : "ran"} — ${r.killed.length} paused, ${r.bids.length} bid changes, ${r.added.length} keywords added. ${r.errors.length} errors. ${Math.round(r.durationMs / 1000)}s`,
    "",
  ];
  if (r.killed.length) { lines.push("PAUSED (>=$4 spend, 0 orders, 30d):"); r.killed.forEach((k) => lines.push(`  $${k.spend} wasted  ${k.text}`)); lines.push(""); }
  if (r.added.length) { lines.push("ADDED keywords (converting search terms):"); r.added.forEach((a) => lines.push(`  ${a.matchType}  ${a.text}`)); lines.push(""); }
  if (r.bids.length) { lines.push("BID changes (toward 30% ACOS target):"); r.bids.slice(0, 30).forEach((b) => lines.push(`  ACOS ${(b.acos * 100).toFixed(0)}%  $${b.from}->$${b.to}  ${b.text}`)); lines.push(""); }
  if (r.errors.length) lines.push("ERRORS: " + r.errors.join("; "));
  return lines.join("\n");
}
