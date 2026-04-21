import { db, migrate } from "@/lib/db/client";

export interface Shipment {
  id: number;
  sku: string | null;
  product_name: string | null;
  quantity: number | null;
  inbound_plan_id: string | null;
  amazon_shipment_id: string | null;
  amazon_status: string | null;
  destination_fc: string | null;
  shipment_name: string | null;
  last_synced_at: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export async function listShipments(): Promise<Shipment[]> {
  await migrate();
  const r = await db().execute(
    `SELECT id, sku, product_name, quantity, inbound_plan_id, amazon_shipment_id,
            amazon_status, destination_fc, shipment_name, last_synced_at, status,
            error_message, created_at, updated_at
     FROM shipments
     ORDER BY last_synced_at DESC NULLS LAST, created_at DESC
     LIMIT 200`,
  );
  return r.rows as unknown as Shipment[];
}

export async function getShipment(id: number): Promise<Shipment | null> {
  await migrate();
  const r = await db().execute({
    sql: `SELECT id, sku, product_name, quantity, inbound_plan_id, amazon_shipment_id,
                 amazon_status, destination_fc, shipment_name, last_synced_at, status,
                 error_message, created_at, updated_at
          FROM shipments WHERE id = ?`,
    args: [id],
  });
  return (r.rows[0] as unknown as Shipment) ?? null;
}
