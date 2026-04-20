import { db, migrate } from "@/lib/db/client";

export interface Shipment {
  id: number;
  sku: string;
  product_name: string | null;
  quantity: number;
  prep_contact_id: number | null;
  inbound_plan_id: string | null;
  operation_id: string | null;
  operation_status: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export async function listShipments(): Promise<Shipment[]> {
  await migrate();
  const r = await db().execute("SELECT * FROM shipments ORDER BY created_at DESC LIMIT 100");
  return r.rows as unknown as Shipment[];
}

export async function getShipment(id: number): Promise<Shipment | null> {
  await migrate();
  const r = await db().execute({
    sql: "SELECT * FROM shipments WHERE id = ?",
    args: [id],
  });
  return (r.rows[0] as unknown as Shipment) ?? null;
}
