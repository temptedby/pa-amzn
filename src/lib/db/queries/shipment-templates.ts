import { db, migrate } from "@/lib/db/client";

export interface ShipmentTemplate {
  sku: string;
  units_per_carton: number | null;
  carton_length_in: number | null;
  carton_width_in: number | null;
  carton_height_in: number | null;
  carton_weight_lb: number | null;
  prep_contact_id: number | null;
  notes: string | null;
}

export async function listShipmentTemplates(): Promise<Map<string, ShipmentTemplate>> {
  await migrate();
  const r = await db().execute(
    `SELECT sku, units_per_carton, carton_length_in, carton_width_in, carton_height_in,
            carton_weight_lb, prep_contact_id, notes
     FROM shipment_templates`,
  );
  const map = new Map<string, ShipmentTemplate>();
  for (const row of r.rows as unknown as ShipmentTemplate[]) {
    map.set(row.sku, row);
  }
  return map;
}
