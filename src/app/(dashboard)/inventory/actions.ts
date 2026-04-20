"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { syncInventory } from "@/lib/amazon/sync-inventory";
import { syncRestockRecommendations } from "@/lib/amazon/sync-restock";
import { db, migrate } from "@/lib/db/client";

function resultToQs(kind: string, result: { ok: boolean; count: number; reason?: string; error?: string }): string {
  if (result.ok) return `synced=${kind}&count=${result.count}`;
  const err = result.error ?? result.reason ?? "unknown";
  return `synced=${kind}&err=${encodeURIComponent(err).slice(0, 400)}`;
}

export async function runInventorySync() {
  const result = await syncInventory();
  revalidatePath("/inventory");
  redirect(`/inventory?${resultToQs("inventory", result)}`);
}

export async function runRestockSync() {
  const result = await syncRestockRecommendations();
  revalidatePath("/inventory");
  redirect(`/inventory?${resultToQs("restock", result)}`);
}

function n(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

function nInt(v: FormDataEntryValue | null): number | null {
  const num = n(v);
  return num === null ? null : Math.round(num);
}

function s(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export async function saveShipmentTemplate(formData: FormData) {
  const sku = s(formData.get("sku"));
  if (!sku) return;

  await migrate();
  await db().execute({
    sql: `INSERT INTO shipment_templates
            (sku, units_per_carton, carton_length_in, carton_width_in, carton_height_in,
             carton_weight_lb, prep_contact_id, notes, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(sku) DO UPDATE SET
            units_per_carton = excluded.units_per_carton,
            carton_length_in = excluded.carton_length_in,
            carton_width_in = excluded.carton_width_in,
            carton_height_in = excluded.carton_height_in,
            carton_weight_lb = excluded.carton_weight_lb,
            prep_contact_id = excluded.prep_contact_id,
            notes = excluded.notes,
            updated_at = datetime('now')`,
    args: [
      sku,
      nInt(formData.get("units_per_carton")),
      n(formData.get("carton_length_in")),
      n(formData.get("carton_width_in")),
      n(formData.get("carton_height_in")),
      n(formData.get("carton_weight_lb")),
      nInt(formData.get("prep_contact_id")),
      s(formData.get("notes")),
    ],
  });
  revalidatePath("/inventory");
}

export async function updateThreshold(formData: FormData) {
  const sku = formData.get("sku");
  const raw = formData.get("threshold");
  if (typeof sku !== "string") return;

  const threshold =
    typeof raw === "string" && raw.trim() !== "" ? Math.max(0, Math.floor(Number(raw))) : null;
  if (threshold !== null && !Number.isFinite(threshold)) return;

  await migrate();
  await db().execute({
    sql: "UPDATE inventory SET threshold = ? WHERE sku = ?",
    args: [threshold, sku],
  });
  revalidatePath("/inventory");
}
