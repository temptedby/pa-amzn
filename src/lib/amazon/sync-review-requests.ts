import { db, migrate } from "@/lib/db/client";
import { configFromEnv, spRequest, marketplaceIdFromEnv, type SpApiConfig } from "./sp-api";
import { getSolicitationActions, isProductReviewAvailable, requestProductReview } from "./solicitations";

// Daily compliant review-request runner. Lists recent orders, and for any that
// Amazon currently allows a review solicitation on (the 5-30 day window), fires
// the neutral "Request a Review". Tracks every order so we never double-ask.

interface AmazonOrder {
  AmazonOrderId: string;
  OrderStatus: string;
  PurchaseDate: string;
}
interface OrdersResponse {
  payload?: { Orders?: AmazonOrder[]; NextToken?: string };
}

// Amazon allows 5-30 days post-delivery. 2026 data: ~7-10 days post-delivery is
// the sweet spot for physical products (used it, not forgotten) and Tue-Thu beats
// Fri-Sun. We approximate "post-delivery" from PurchaseDate + ~2d FBA transit.
const LOOKBACK_DAYS = 40;
const MIN_DAYS_SINCE_PURCHASE = Number(process.env.REVIEW_MIN_DAYS ?? 9); // ≈ 7 days post-delivery
const SEND_WEEKDAYS = new Set([2, 3, 4]); // Tue, Wed, Thu (UTC)
const MAX_REQUESTS_PER_RUN = 60; // safety cap; Solicitations API ~1 req/sec
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchRecentOrders(cfg: SpApiConfig, marketplaceId: string): Promise<AmazonOrder[]> {
  const createdAfter = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const orders: AmazonOrder[] = [];
  let nextToken: string | undefined;
  do {
    const qs = new URLSearchParams({ MarketplaceIds: marketplaceId });
    if (nextToken) qs.set("NextToken", nextToken);
    else qs.set("CreatedAfter", createdAfter);
    const data = await spRequest<OrdersResponse>(cfg, `/orders/v0/orders?${qs}`);
    orders.push(...(data.payload?.Orders ?? []));
    nextToken = data.payload?.NextToken;
  } while (nextToken && orders.length < 500);
  // Oldest first — the oldest eligible orders are closest to aging out of
  // Amazon's 30-day window, so when we hit the per-run cap we defer the NEWEST
  // (which stay eligible for tomorrow's run), never the oldest.
  orders.sort((a, b) => new Date(a.PurchaseDate).getTime() - new Date(b.PurchaseDate).getTime());
  return orders;
}

export interface ReviewRequestsResult {
  ok: boolean;
  count: number; // review requests actually sent
  checked?: number;
  skipped?: number;
  requestedOrderIds?: string[]; // confirmation: which orders got a request this run
  reason?: string;
  error?: string;
  durationMs: number;
}

// dryRun: don't send (preview). catchUp: one-time backlog blast — bypass the
// Tue-Thu and 7-day gates and send to EVERY order Amazon still allows (5-30d window).
export async function runReviewRequests(opts: { dryRun?: boolean; catchUp?: boolean } = {}): Promise<ReviewRequestsResult> {
  const { dryRun = false, catchUp = false } = opts;
  const start = Date.now();
  const requested: string[] = [];
  const cfg = configFromEnv();
  if (!cfg) return { ok: false, count: 0, reason: "SP-API env vars not configured", durationMs: Date.now() - start };
  const marketplaceId = marketplaceIdFromEnv();

  // Only send Tue-Thu (best engagement); other days are a no-op. Dry-run / catch-up bypass.
  if (!dryRun && !catchUp && !SEND_WEEKDAYS.has(new Date().getUTCDay())) {
    return { ok: true, count: 0, skipped: 0, reason: "off-day — sends Tue-Thu only", durationMs: Date.now() - start };
  }

  try {
    await migrate();
    await db().execute(`CREATE TABLE IF NOT EXISTS review_requests (
      amazon_order_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      detail TEXT,
      requested_at TEXT NOT NULL
    )`);

    const orders = await fetchRecentOrders(cfg, marketplaceId);
    let sent = 0, skipped = 0, checked = 0;

    for (const o of orders) {
      if (sent >= MAX_REQUESTS_PER_RUN) break;
      // Skip orders we've already recorded (sent or known-ineligible-final).
      const seen = await db().execute({
        sql: "SELECT status FROM review_requests WHERE amazon_order_id = ?",
        args: [o.AmazonOrderId],
      });
      if (seen.rows.length && seen.rows[0].status === "sent") { skipped++; continue; }
      if (o.OrderStatus === "Canceled" || o.OrderStatus === "Pending") { skipped++; continue; }
      // Hold until ~7 days post-delivery (the data sweet spot) — unless catching up the backlog.
      if (!catchUp && Date.now() - new Date(o.PurchaseDate).getTime() < MIN_DAYS_SINCE_PURCHASE * 86_400_000) { skipped++; continue; }

      checked++;
      const actions = await getSolicitationActions(cfg, o.AmazonOrderId, marketplaceId);
      if (!isProductReviewAvailable(actions)) { skipped++; await sleep(1100); continue; }

      if (dryRun) { sent++; requested.push(o.AmazonOrderId); await sleep(300); continue; } // eligible, but don't send

      try {
        await requestProductReview(cfg, o.AmazonOrderId, marketplaceId);
        sent++;
        requested.push(o.AmazonOrderId);
        await db().execute({
          sql: `INSERT INTO review_requests (amazon_order_id, status, detail, requested_at)
                VALUES (?, 'sent', NULL, datetime('now'))
                ON CONFLICT(amazon_order_id) DO UPDATE SET status='sent', requested_at=datetime('now')`,
          args: [o.AmazonOrderId],
        });
      } catch (err) {
        await db().execute({
          sql: `INSERT INTO review_requests (amazon_order_id, status, detail, requested_at)
                VALUES (?, 'error', ?, datetime('now'))
                ON CONFLICT(amazon_order_id) DO UPDATE SET status='error', detail=excluded.detail, requested_at=datetime('now')`,
          args: [o.AmazonOrderId, err instanceof Error ? err.message.slice(0, 200) : String(err)],
        });
      }
      await sleep(1100); // respect Solicitations API ~1 req/sec
    }

    return { ok: true, count: sent, checked, skipped, requestedOrderIds: requested, durationMs: Date.now() - start };
  } catch (err) {
    return { ok: false, count: 0, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - start };
  }
}
