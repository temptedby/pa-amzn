import { db, migrate } from "@/lib/db/client";
import { configFromEnv, marketplaceIdFromEnv } from "./sp-api";
import { REPORT_TYPES, runReport } from "./reports";
import { parseRestockTsv, type RestockRecommendation } from "./restock";

export interface RestockSyncResult {
  ok: boolean;
  count: number;
  reason?: string;
  error?: string;
  durationMs: number;
}

export async function syncRestockRecommendations(): Promise<RestockSyncResult> {
  const start = Date.now();
  const cfg = configFromEnv();
  if (!cfg) {
    return {
      ok: false,
      count: 0,
      reason: "SP-API env vars not configured",
      durationMs: Date.now() - start,
    };
  }

  try {
    await migrate();
    const marketplaceId = marketplaceIdFromEnv();
    const tsv = await runReport(cfg, REPORT_TYPES.RESTOCK_RECOMMENDATIONS, [marketplaceId], {
      // Generous timeout — Amazon's report queue can take 1-5 minutes.
      timeoutMs: 6 * 60 * 1000,
      intervalMs: 6_000,
    });
    const recs: RestockRecommendation[] = parseRestockTsv(tsv);
    const now = new Date().toISOString();

    for (const r of recs) {
      await db().execute({
        sql: `UPDATE inventory
              SET amazon_recommended_quantity = ?,
                  amazon_recommended_ship_date = ?,
                  amazon_alert = ?,
                  days_of_supply = ?,
                  recommendations_checked_at = ?
              WHERE sku = ?`,
        args: [
          r.recommendedReplenishmentQuantity ?? null,
          r.recommendedShipDate ?? null,
          r.alert ?? null,
          r.daysOfSupply ?? null,
          now,
          r.sellerSku,
        ],
      });
    }

    return { ok: true, count: recs.length, durationMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
