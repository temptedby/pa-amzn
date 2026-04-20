"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, migrate } from "@/lib/db/client";
import { configFromEnv, marketplaceIdFromEnv, SpApiError } from "@/lib/amazon/sp-api";
import {
  createInboundPlan,
  pollInboundOperation,
  summarizeProblems,
} from "@/lib/amazon/inbound-plan";
import type { PrepContact } from "@/lib/db/queries/prep-contacts";

async function loadPrepContact(id: number): Promise<PrepContact | null> {
  const r = await db().execute({
    sql: `SELECT id, name, email, phone, address_line1, address_line2, city, state,
                 postal_code, country, is_default, notes
          FROM prep_contacts WHERE id = ?`,
    args: [id],
  });
  return (r.rows[0] as unknown as PrepContact) ?? null;
}

function missingAddressFields(c: PrepContact): string[] {
  const missing: string[] = [];
  if (!c.address_line1) missing.push("address_line1");
  if (!c.city) missing.push("city");
  if (!c.state) missing.push("state");
  if (!c.postal_code) missing.push("postal_code");
  return missing;
}

export async function createShipment(formData: FormData) {
  const skuRaw = formData.get("sku");
  const qtyRaw = formData.get("quantity");
  const prepIdRaw = formData.get("prep_contact_id");
  const productName = (formData.get("product_name") ?? "") as string;

  const sku = typeof skuRaw === "string" ? skuRaw.trim() : "";
  const quantity = Number(qtyRaw);
  const prepContactId = typeof prepIdRaw === "string" && prepIdRaw.trim() ? Number(prepIdRaw) : null;

  if (!sku || !Number.isFinite(quantity) || quantity <= 0) {
    redirect("/shipments/new?err=" + encodeURIComponent("SKU and a positive quantity are required"));
  }
  if (!prepContactId) {
    redirect("/shipments/new?err=" + encodeURIComponent("Select a prep contact") + "&sku=" + encodeURIComponent(sku));
  }

  const cfg = configFromEnv();
  if (!cfg) {
    redirect("/shipments/new?err=" + encodeURIComponent("SP-API env vars not configured"));
  }

  await migrate();

  const prep = await loadPrepContact(prepContactId);
  if (!prep) {
    redirect("/shipments/new?err=" + encodeURIComponent("Prep contact not found"));
  }
  const missing = missingAddressFields(prep);
  if (missing.length > 0) {
    redirect(
      "/shipments/new?err=" +
        encodeURIComponent(`Prep contact missing required address fields: ${missing.join(", ")}`),
    );
  }

  // Insert draft row.
  const insert = await db().execute({
    sql: `INSERT INTO shipments (sku, product_name, quantity, prep_contact_id, status)
          VALUES (?, ?, ?, ?, 'creating') RETURNING id`,
    args: [sku, productName || null, quantity, prep.id],
  });
  const shipmentId = Number((insert.rows[0] as unknown as { id: number }).id);

  let finalStatus: "created" | "failed" = "failed";
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  let inboundPlanId: string | null = null;
  let operationId: string | null = null;
  let operationStatus: string | null = null;

  try {
    const res = await createInboundPlan(cfg, {
      name: `${sku} × ${quantity} — ${new Date().toISOString().slice(0, 10)}`,
      sourceAddress: {
        name: prep.name,
        addressLine1: prep.address_line1!,
        addressLine2: prep.address_line2 ?? undefined,
        city: prep.city!,
        stateOrProvinceCode: prep.state!,
        postalCode: prep.postal_code!,
        countryCode: prep.country || "US",
        email: prep.email,
        phoneNumber: prep.phone ?? undefined,
      },
      destinationMarketplaces: [marketplaceIdFromEnv()],
      // prepOwner: Amazon rejects "SELLER" for SKUs that don't require prep
      // (most simple products). "NONE" is the safe default. If you ever add
      // a SKU that DOES need prep (category-restricted items, fragile, etc.),
      // we make this configurable per-SKU via the shipment template.
      items: [{ msku: sku, quantity, prepOwner: "NONE", labelOwner: "SELLER" }],
    });
    inboundPlanId = res.inboundPlanId;
    operationId = res.operationId;

    await db().execute({
      sql: `UPDATE shipments SET inbound_plan_id = ?, operation_id = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [inboundPlanId, operationId, shipmentId],
    });

    const op = await pollInboundOperation(cfg, operationId, { timeoutMs: 2 * 60 * 1000 });
    operationStatus = op.operationStatus;

    if (op.operationStatus === "SUCCESS") {
      finalStatus = "created";
    } else {
      finalStatus = "failed";
      errorCode = "OPERATION_FAILED";
      errorMessage = summarizeProblems(op.operationProblems);
    }
  } catch (err) {
    finalStatus = "failed";
    errorCode = "API_ERROR";
    if (err instanceof SpApiError) {
      // Include Amazon's response body — that's where the useful detail lives.
      let bodyDetail = err.body;
      try {
        const parsed = JSON.parse(err.body);
        bodyDetail = JSON.stringify(parsed, null, 2);
      } catch {
        // Body wasn't JSON — keep as-is.
      }
      errorMessage = `${err.message}\n\n${bodyDetail}`.slice(0, 4000);
    } else {
      errorMessage = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
    }
  }

  await db().execute({
    sql: `UPDATE shipments
          SET status = ?, operation_status = ?, error_code = ?, error_message = ?,
              inbound_plan_id = COALESCE(inbound_plan_id, ?),
              operation_id = COALESCE(operation_id, ?),
              updated_at = datetime('now')
          WHERE id = ?`,
    args: [finalStatus, operationStatus, errorCode, errorMessage, inboundPlanId, operationId, shipmentId],
  });

  revalidatePath("/shipments");
  revalidatePath(`/shipments/${shipmentId}`);
  redirect(`/shipments/${shipmentId}`);
}
