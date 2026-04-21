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
