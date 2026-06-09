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

// Orders eligible for a review request were delivered 5-30 days ago, so look
// back ~35 days of purchases. Shipped is FBA's terminal status.
const LOOKBACK_DAYS = 35;
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
  return orders;
}

export interface ReviewRequestsResult {
  ok: boolean;
  count: number; // review requests actually sent
  checked?: number;
  skipped?: number;
  reason?: string;
  error?: string;
  durationMs: number;
}

export async function runReviewRequests(opts: { dryRun?: boolean } = {}): Promise<ReviewRequestsResult> {
  const { dryRun = false } = opts;
  const start = Date.now();
  const cfg = configFromEnv();
  if (!cfg) return { ok: false, count: 0, reason: "SP-API env vars not configured", durationMs: Date.now() - start };
  const marketplaceId = marketplaceIdFromEnv();

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

      checked++;
      const actions = await getSolicitationActions(cfg, o.AmazonOrderId, marketplaceId);
      if (!isProductReviewAvailable(actions)) { skipped++; await sleep(1100); continue; }

      if (dryRun) { sent++; await sleep(300); continue; } // eligible, but don't send

      try {
        await requestProductReview(cfg, o.AmazonOrderId, marketplaceId);
        sent++;
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

    return { ok: true, count: sent, checked, skipped, durationMs: Date.now() - start };
  } catch (err) {
    return { ok: false, count: 0, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - start };
  }
}
