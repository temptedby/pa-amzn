import { db, migrate } from "@/lib/db/client";
import { configFromEnv, marketplaceIdFromEnv } from "./sp-api";
import { fetchFbaInventory, inboundQuantity } from "./inventory";

export interface SyncResult {
  ok: boolean;
  count: number;
  reason?: string;
  error?: string;
  durationMs: number;
}

export async function syncInventory(): Promise<SyncResult> {
  const start = Date.now();
  const cfg = configFromEnv();
  if (!cfg) {
    return {
      ok: false,
      count: 0,
      reason: "SP-API env vars not configured (SP_API_CLIENT_ID, SP_API_CLIENT_SECRET, SP_API_REFRESH_TOKEN)",
      durationMs: Date.now() - start,
    };
  }

  try {
    await migrate();
    const marketplaceId = marketplaceIdFromEnv();
    const summaries = await fetchFbaInventory(cfg, marketplaceId);
    const now = new Date().toISOString();

    for (const item of summaries) {
      await db().execute({
        sql: `INSERT INTO inventory
                (sku, fnsku, asin, product_name, quantity_fba, quantity_inbound, last_checked_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(sku) DO UPDATE SET
                fnsku = excluded.fnsku,
                asin = excluded.asin,
                product_name = excluded.product_name,
                quantity_fba = excluded.quantity_fba,
                quantity_inbound = excluded.quantity_inbound,
                last_checked_at = excluded.last_checked_at`,
        args: [
          item.sellerSku,
          item.fnSku ?? null,
          item.asin ?? null,
          item.productName ?? null,
          item.inventoryDetails?.fulfillableQuantity ?? 0,
          inboundQuantity(item),
          now,
        ],
      });
    }

    return { ok: true, count: summaries.length, durationMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
