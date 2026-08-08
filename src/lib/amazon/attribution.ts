// Amazon Attribution client. Shares the Ads API OAuth (ADS_*) — probed 2026-08-08,
// no separate onboarding was required.
//
// The one grouping that matters here is CREATIVE: that is the per-TAG view, so
// "one tag per affiliate" becomes "one row per affiliate", which is what makes a
// pay-per-sale programme payable at all.
//
// Gotcha, learned the expensive way: every attributedTotal*14d metric is REJECTED
// for reportType PERFORMANCE with `400 Invalid metric`. The set below is verified.

import { type AdsConfig, adsRequest } from "./ads-api";

export const ATTRIBUTION_METRICS = [
  "Click-throughs",
  "attributedDetailPageViewsClicks14d",
  "attributedAddToCartClicks14d",
  "attributedPurchases14d",
  "attributedSales14d",
  "unitsSold14d",
].join(",");

export interface AttributionRow {
  tag: string;            // the Attribution creative/tag id — our partner key
  day: string;            // YYYY-MM-DD
  clicks: number;
  detailPageViews: number;
  addToCart: number;
  orders: number;
  sales: number;
  units: number;
}

export interface Advertiser { advertiserId: string; advertiserName: string }

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

/** The report row shape is documented loosely and we have not yet seen a populated
 *  row (no traffic through the tag as of 2026-08-08). So read defensively: try the
 *  plausible id fields in order and keep the raw row for anything unexpected. */
export function parseAttributionRow(raw: Record<string, unknown>, day: string): AttributionRow | null {
  const tag =
    (raw.creativeId as string) ??
    (raw.creative as string) ??
    (raw.adGroupId as string) ??
    (raw.campaignId as string) ??
    null;
  if (!tag) return null;
  return {
    tag: String(tag),
    day,
    clicks: num(raw["Click-throughs"] ?? raw.clickThroughs),
    detailPageViews: num(raw.attributedDetailPageViewsClicks14d),
    addToCart: num(raw.attributedAddToCartClicks14d),
    orders: num(raw.attributedPurchases14d),
    sales: num(raw.attributedSales14d),
    units: num(raw.unitsSold14d),
  };
}

const yyyymmdd = (day: string) => day.replace(/-/g, "");

export async function listAdvertisers(cfg: AdsConfig): Promise<Advertiser[]> {
  const j = await adsRequest<{ advertisers?: Advertiser[] }>(cfg, "/attribution/advertisers");
  return j.advertisers ?? [];
}

/** One day per call. The PERFORMANCE report aggregates over the range it is given,
 *  so asking for a single day is the only way to get a trustworthy day dimension.
 *  Cheap enough: a 21-day window is 21 calls once a day. */
export async function fetchTagDay(cfg: AdsConfig, day: string): Promise<AttributionRow[]> {
  const rows: AttributionRow[] = [];
  let cursorId: string | null = null;

  do {
    const body: Record<string, unknown> = {
      reportType: "PERFORMANCE",
      groupBy: "CREATIVE",
      startDate: yyyymmdd(day),
      endDate: yyyymmdd(day),
      metrics: ATTRIBUTION_METRICS,
    };
    if (cursorId) body.cursorId = cursorId;

    const j = await adsRequest<{ reports?: Record<string, unknown>[]; cursorId?: string | null }>(
      cfg,
      "/attribution/report",
      { method: "POST", body: JSON.stringify(body) },
    );
    for (const r of j.reports ?? []) {
      const parsed = parseAttributionRow(r, day);
      if (parsed) rows.push(parsed);
    }
    cursorId = j.cursorId ?? null;
  } while (cursorId);

  return rows;
}
