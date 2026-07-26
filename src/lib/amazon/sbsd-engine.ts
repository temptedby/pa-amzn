// Sponsored Brands (incl. Video) + Sponsored Display engine — William's simple rules (2026-07-24),
// reusing the SHARED, unit-tested decisions in ad-rules.ts so all three ad products obey one system:
//   KILL: $4 month-to-date spend + not profitable (0 orders or ACOS >= 50%) -> pause for the month.
//   BID : ±10% at the 50% ACOS pivot (target-level; applied once the endpoints are verified).
//
// STATUS (2026-07-24): PREVIEW-ONLY. Amazon's async report queue was timing out the day this was
// written, so the SB/SD report + entity endpoints could NOT be validated against a real 200 (RBB:
// never trust an integration without a live runtime call). This module therefore:
//   - pulls the campaign-level performance report (adProduct-parameterized),
//   - computes, via the shared rules, exactly which ENABLED SB/SD campaigns WOULD be paused,
//   - returns that preview and APPLIES NOTHING. It is intentionally NOT wired into any cron.
// Flipping on live apply is a follow-up gated on: (1) a working report pull, (2) verifying the
// pause endpoints (SB: PUT /sb/v4/campaigns; SD: PUT /sd/campaigns) against a live 200, and
// (3) William's go. Bid stepping is target-level and lands in the same follow-up.

import { gunzipSync } from "node:zlib";
import { adsConfigFromEnv, getAdsAccessToken, type AdsConfig } from "./ads-api";
import { shouldKill, acosOf, KILL_SPEND, ACOS_PIVOT } from "./ad-rules";

const BASE = "https://advertising-api.amazon.com";
const RPT_CT = "application/vnd.createasyncreportrequest.v3+json";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d: Date) => d.toISOString().slice(0, 10);

export type SbSdProduct = "SPONSORED_BRANDS" | "SPONSORED_DISPLAY";
const REPORT_TYPE: Record<SbSdProduct, string> = { SPONSORED_BRANDS: "sbCampaigns", SPONSORED_DISPLAY: "sdCampaigns" };

export interface CampaignPerf {
  campaignId: string;
  name: string;
  state: string;   // ENABLED / PAUSED / ARCHIVED (SD lowercases these)
  spend: number;
  orders: number;
  sales: number;
}
export interface KillPreviewRow { campaignId: string; name: string; spend: number; acos: number | null }
export interface SbSdPreview {
  ok: boolean;
  product: SbSdProduct;
  dryRun: true;                    // preview-only until endpoints are verified
  scanned: number;
  wouldPause: KillPreviewRow[];
  errors: string[];
  durationMs: number;
  reason?: string;
}

// PURE selector (unit-tested): from campaign performance, pick the ENABLED campaigns that hit the
// kill bar under the shared rule. "ENABLED" match is case-insensitive because SD returns lowercase.
export function selectCampaignsToKill(rows: CampaignPerf[], killSpend = KILL_SPEND, pivot = ACOS_PIVOT): KillPreviewRow[] {
  const out: KillPreviewRow[] = [];
  for (const c of rows) {
    if ((c.state || "").toUpperCase() !== "ENABLED") continue;
    const perf = { spend: c.spend, orders: c.orders, sales: c.sales };
    if (shouldKill(perf, killSpend, pivot)) {
      out.push({ campaignId: c.campaignId, name: c.name, spend: +c.spend.toFixed(2), acos: acosOf(perf) });
    }
  }
  return out;
}

async function ads(cfg: AdsConfig, token: string, path: string, method: string, body: unknown, ct = "application/json") {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Amazon-Advertising-API-ClientId": cfg.clientId, "Amazon-Advertising-API-Scope": cfg.profileId!, "Content-Type": ct, Accept: ct },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, json: text ? JSON.parse(text) : null };
}

// Month-to-date campaign report for the given ad product. Column names differ from SP: SB/SD use
// `cost`, `sales`, `purchases` (no 14d suffix). Returns [] on any failure (never throws upstream).
async function campaignReport(cfg: AdsConfig, token: string, product: SbSdProduct): Promise<CampaignPerf[]> {
  const now = new Date();
  const ed = iso(now), sd = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const body = {
    name: "sbsd", startDate: sd, endDate: ed,
    configuration: { adProduct: product, groupBy: ["campaign"], columns: ["campaignId", "campaignName", "campaignStatus", "cost", "sales", "purchases"], reportTypeId: REPORT_TYPE[product], timeUnit: "SUMMARY", format: "GZIP_JSON" },
  };
  const cr = await ads(cfg, token, "/reporting/reports", "POST", body, RPT_CT);
  let rid: string | undefined = cr.json?.reportId;
  if (!rid && cr.json?.code === "425") rid = String(cr.json.detail || "").match(/([0-9a-f-]{36})/)?.[1];
  if (!rid) throw new Error(`report create failed: ${JSON.stringify(cr.json).slice(0, 200)}`);
  let url: string | undefined;
  for (let i = 0; i < 28; i++) {
    await sleep(5000);
    const s = await ads(cfg, token, `/reporting/reports/${rid}`, "GET", null, RPT_CT);
    if (s.json?.status === "COMPLETED") { url = s.json.url; break; }
    if (s.json?.status === "FAILURE") throw new Error("report FAILURE");
  }
  if (!url) throw new Error("report timed out");
  const raw = JSON.parse(gunzipSync(Buffer.from(await (await fetch(url)).arrayBuffer())).toString()) as Array<Record<string, unknown>>;
  return raw.map((r) => ({
    campaignId: String(r.campaignId ?? ""),
    name: String(r.campaignName ?? ""),
    state: String(r.campaignStatus ?? ""),
    spend: Number(r.cost ?? 0),
    orders: Number(r.purchases ?? 0),
    sales: Number(r.sales ?? 0),
  }));
}

/** Preview (dry-run) what the $4 rule would pause for one SB/SD product. Applies nothing. */
export async function previewSbSd(product: SbSdProduct): Promise<SbSdPreview> {
  const start = Date.now();
  const out: SbSdPreview = { ok: false, product, dryRun: true, scanned: 0, wouldPause: [], errors: [], durationMs: 0 };
  const cfg = adsConfigFromEnv();
  if (!cfg || !cfg.profileId) { out.reason = "ADS_* env not configured"; out.durationMs = Date.now() - start; return out; }
  const token = await getAdsAccessToken(cfg);
  try {
    const rows = await campaignReport(cfg, token, product);
    out.scanned = rows.length;
    out.wouldPause = selectCampaignsToKill(rows);
    out.ok = true;
  } catch (e) { out.errors.push(e instanceof Error ? e.message : String(e)); }
  out.durationMs = Date.now() - start;
  return out;
}

export function summarizeSbSd(p: SbSdPreview): string {
  const lines = [`${p.product} preview (dry-run) — scanned ${p.scanned} campaigns, ${p.wouldPause.length} would pause ($4 MTD + no sale/ACOS>=50%). ${p.errors.length} errors. ${Math.round(p.durationMs / 1000)}s`, ""];
  p.wouldPause.forEach((c) => lines.push(`  WOULD PAUSE  $${c.spend} MTD  ACOS ${c.acos == null ? "no-sale" : (c.acos * 100).toFixed(0) + "%"}  ${c.name}`));
  if (p.errors.length) lines.push("ERRORS: " + p.errors.join("; "));
  return lines.join("\n");
}
