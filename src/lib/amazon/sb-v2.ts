// Sponsored Brands reporting through the LEGACY v2 endpoints.
//
// Why this exists: v3 reporting does not cover legacy single-ad-group Sponsored Brands campaigns,
// and both of the account's ENABLED SB campaigns are exactly that shape
// (`isMultiAdGroupsEnabled: false`). Every v3 report we pulled returned COMPLETED with zero rows —
// correctly, because there was no v3-reportable data. The old campaigns report through the old API.
// Confirmed live 2026-08-06: 118 keyword rows for 2026-08-05, $15.00 spend, one word taking $10.55
// of it with no orders.
//
// Two traps this module exists to contain:
//   1. v2 takes ONE DAY per request (reportDate=YYYYMMDD), not a range. Month-to-date means N calls,
//      so callers should cache days rather than re-fetch them.
//   2. Campaign ids exceed Number.MAX_SAFE_INTEGER, so JSON.parse silently rounds them
//      (144237866129902226 read back as ...240). Ids are re-read as strings from the raw text.

import { gunzipSync } from "node:zlib";
import type { AdsConfig } from "./ads-api";

const A = "https://advertising-api.amazon.com";

export interface SbKeywordDay {
  day: string;                 // YYYY-MM-DD
  keywordId: string;
  keywordText: string;
  matchType: string;
  impressions: number;
  clicks: number;
  cost: number;
  sales: number;
  orders: number;
}

export interface SbCampaignDay {
  day: string;
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  cost: number;
  sales: number;
  orders: number;
}

const KW_METRICS = "keywordId,keywordText,matchType,impressions,clicks,cost,attributedSales14d,attributedConversions14d";
const CAMP_METRICS = "campaignId,campaignName,impressions,clicks,cost,attributedSales14d,attributedConversions14d";

function headers(cfg: AdsConfig, token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Amazon-Advertising-API-ClientId": cfg.clientId,
    "Amazon-Advertising-API-Scope": cfg.profileId ?? "",
    "Content-Type": "application/json",   // v2 uses no vendor media types anywhere
  };
}

/** YYYYMMDD, which is the only date format v2 accepts. */
export function v2Date(day: string): string {
  return day.replace(/-/g, "");
}

/**
 * Amazon's advertising day runs 07:00Z to 07:00Z. Before 07:00Z we are still inside the previous
 * day, and asking for "today" returns a day that has barely started.
 */
export function accountDay(at: number = Date.now()): string {
  return new Date(at - 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Big ids lose precision through JSON.parse, so pull them out of the raw text and graft them back
 * on by position. Every id in these reports is therefore a faithful string.
 */
function parsePreservingIds(text: string, idFields: string[]): Record<string, unknown>[] {
  const rows = JSON.parse(text) as Record<string, unknown>[];
  for (const field of idFields) {
    const re = new RegExp(`"${field}"\\s*:\\s*(\\d+)`, "g");
    const found: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) found.push(m[1]);
    if (found.length === rows.length) rows.forEach((r, i) => { r[field] = found[i]; });
  }
  return rows;
}

async function runV2Report(
  cfg: AdsConfig, token: string, path: string, day: string, metrics: string, idFields: string[],
  opts: { pollMs?: number; maxPolls?: number } = {},
): Promise<Record<string, unknown>[] | null> {
  const pollMs = opts.pollMs ?? 10_000;
  const maxPolls = opts.maxPolls ?? 45;
  const H = headers(cfg, token);

  const create = await fetch(`${A}${path}`, {
    method: "POST", headers: H, body: JSON.stringify({ reportDate: v2Date(day), metrics }),
  });
  if (!create.ok) return null;
  const { reportId } = (await create.json()) as { reportId?: string };
  if (!reportId) return null;

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, pollMs));
    const st = await fetch(`${A}/v2/reports/${reportId}`, { headers: H })
      .then((r) => r.json() as Promise<{ status?: string }>).catch(() => ({} as { status?: string }));
    if (st.status === "FAILURE") return null;
    if (st.status !== "SUCCESS") continue;

    const dl = await fetch(`${A}/v2/reports/${reportId}/download`, { headers: H, redirect: "follow" });
    const buf = Buffer.from(await dl.arrayBuffer());
    let text: string;
    try { text = gunzipSync(buf).toString(); } catch { text = buf.toString(); }
    return parsePreservingIds(text, idFields);
  }
  return null;   // still running; the caller retries on a later pass rather than blocking
}

/** One day of Sponsored Brands performance, per keyword. Null means "not ready", not "no data". */
export async function fetchSbKeywordDay(cfg: AdsConfig, token: string, day: string): Promise<SbKeywordDay[] | null> {
  const rows = await runV2Report(cfg, token, "/v2/hsa/keywords/report", day, KW_METRICS, ["keywordId", "adGroupId", "campaignId"]);
  if (!rows) return null;
  return rows.map((r) => ({
    day,
    keywordId: String(r.keywordId ?? ""),
    keywordText: String(r.keywordText ?? ""),
    matchType: String(r.matchType ?? "").toUpperCase(),
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    cost: Number(r.cost ?? 0),
    sales: Number(r.attributedSales14d ?? 0),
    orders: Number(r.attributedConversions14d ?? 0),
  }));
}

/** One day of Sponsored Brands performance, per campaign. */
export async function fetchSbCampaignDay(cfg: AdsConfig, token: string, day: string): Promise<SbCampaignDay[] | null> {
  const rows = await runV2Report(cfg, token, "/v2/hsa/campaigns/report", day, CAMP_METRICS, ["campaignId"]);
  if (!rows) return null;
  return rows.map((r) => ({
    day,
    campaignId: String(r.campaignId ?? ""),
    campaignName: String(r.campaignName ?? ""),
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    cost: Number(r.cost ?? 0),
    sales: Number(r.attributedSales14d ?? 0),
    orders: Number(r.attributedConversions14d ?? 0),
  }));
}

/** Roll a set of daily rows up per keyword, which is what the $4 month-to-date rule reads. */
export function aggregateByKeyword(days: SbKeywordDay[]): Map<string, {
  keywordId: string; keywordText: string; matchType: string;
  spend: number; sales: number; orders: number; clicks: number;
}> {
  const out = new Map<string, { keywordId: string; keywordText: string; matchType: string; spend: number; sales: number; orders: number; clicks: number }>();
  for (const d of days) {
    if (!d.keywordId) continue;
    const cur = out.get(d.keywordId) ?? {
      keywordId: d.keywordId, keywordText: d.keywordText, matchType: d.matchType,
      spend: 0, sales: 0, orders: 0, clicks: 0,
    };
    cur.spend += d.cost; cur.sales += d.sales; cur.orders += d.orders; cur.clicks += d.clicks;
    if (!cur.keywordText && d.keywordText) cur.keywordText = d.keywordText;
    out.set(d.keywordId, cur);
  }
  return out;
}

/** Calendar days from `from` up to and including `to`, as YYYY-MM-DD. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 864e5) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Sponsored Brands report retention, measured from the API's own error body on 2026-08-06. */
export const SB_RETENTION_START = "2026-06-07";
