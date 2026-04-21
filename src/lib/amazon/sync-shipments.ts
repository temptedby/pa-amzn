import { db, migrate } from "@/lib/db/client";
import { configFromEnv, spRequest, type SpApiConfig } from "./sp-api";

// SP-API Fulfillment Inbound v2024-03-20: list shipments across all plans.
// Docs: https://developer-docs.amazon.com/sp-api/docs/fulfillment-inbound-api-v2024-03-20-reference#getshipments

const BASE = "/inbound/fba/2024-03-20";

interface AmazonShipment {
  shipmentId: string;
  inboundPlanId?: string;
  name?: string;
  status: string;
  destination?: { warehouseId?: string };
  placementOption?: { placementOptionId?: string };
  shipmentConfirmationId?: string;
}

interface ShipmentsListResponse {
  shipments?: AmazonShipment[];
  pagination?: { nextToken?: string };
}

export async function fetchAmazonShipments(cfg: SpApiConfig): Promise<AmazonShipment[]> {
  const all: AmazonShipment[] = [];
  let nextToken: string | undefined;

  do {
    const qs = new URLSearchParams();
    if (nextToken) qs.set("paginationToken", nextToken);
    const query = qs.toString();
    const path = `${BASE}/shipments${query ? "?" + query : ""}`;
    const data = await spRequest<ShipmentsListResponse>(cfg, path);
    all.push(...(data.shipments ?? []));
    nextToken = data.pagination?.nextToken;
  } while (nextToken);

  return all;
}

export interface ShipmentsSyncResult {
  ok: boolean;
  count: number;
  reason?: string;
  error?: string;
  durationMs: number;
}

export async function syncShipments(): Promise<ShipmentsSyncResult> {
  const start = Date.now();
  const cfg = configFromEnv();
  if (!cfg) {
    return { ok: false, count: 0, reason: "SP-API env vars not configured", durationMs: Date.now() - start };
  }

  try {
    await migrate();
    const shipments = await fetchAmazonShipments(cfg);
    const now = new Date().toISOString();

    for (const s of shipments) {
      await db().execute({
        sql: `INSERT INTO shipments
                (amazon_shipment_id, inbound_plan_id, shipment_name, amazon_status,
                 destination_fc, last_synced_at, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 'tracked', datetime('now'), datetime('now'))
              ON CONFLICT(amazon_shipment_id) DO UPDATE SET
                inbound_plan_id = COALESCE(excluded.inbound_plan_id, shipments.inbound_plan_id),
                shipment_name = COALESCE(excluded.shipment_name, shipments.shipment_name),
                amazon_status = excluded.amazon_status,
                destination_fc = COALESCE(excluded.destination_fc, shipments.destination_fc),
                last_synced_at = excluded.last_synced_at,
                updated_at = datetime('now')`,
        args: [
          s.shipmentId,
          s.inboundPlanId ?? null,
          s.name ?? null,
          s.status,
          s.destination?.warehouseId ?? null,
          now,
        ],
      });
    }

    return { ok: true, count: shipments.length, durationMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
