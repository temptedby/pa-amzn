import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { SubmitButton } from "@/components/SubmitButton";
import { db, migrate } from "@/lib/db/client";
import { listPrepContacts } from "@/lib/db/queries/prep-contacts";
import { listShipmentTemplates } from "@/lib/db/queries/shipment-templates";
import { configFromEnv } from "@/lib/amazon/sp-api";
import { createShipment } from "../actions";

interface InventoryPick {
  sku: string;
  product_name: string | null;
  quantity_fba: number;
  amazon_recommended_quantity: number | null;
}

async function loadActiveInventory(): Promise<InventoryPick[]> {
  await migrate();
  const r = await db().execute(
    `SELECT sku, product_name, quantity_fba, amazon_recommended_quantity
     FROM inventory
     WHERE quantity_fba > 0 OR quantity_inbound > 0
     ORDER BY sku`,
  );
  return r.rows as unknown as InventoryPick[];
}

export default async function NewShipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string; qty?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const [inventory, contacts, templates] = await Promise.all([
    loadActiveInventory(),
    listPrepContacts(),
    listShipmentTemplates(),
  ]);
  const configured = configFromEnv() !== null;
  const defaultSku = sp.sku ?? inventory[0]?.sku ?? "";
  const defaultItem = inventory.find((i) => i.sku === defaultSku);
  const defaultQty =
    sp.qty ?? String(defaultItem?.amazon_recommended_quantity ?? "");
  const tplContact = templates.get(defaultSku)?.prep_contact_id ?? null;
  const defaultPrepId = tplContact ?? contacts.find((c) => c.is_default === 1)?.id ?? contacts[0]?.id;

  return (
    <>
      <Topbar title="New shipment" subtitle="Create an inbound plan in Amazon" />
      <main className="flex-1 p-6 bg-surface">
        <div className="max-w-2xl mx-auto space-y-4">
          {sp.err && (
            <div className="rounded-md border border-danger/30 bg-danger/10 text-danger px-4 py-3 text-sm">
              {sp.err}
            </div>
          )}

          {!configured && (
            <div className="rounded-md border border-warning/30 bg-warning/10 text-warning px-4 py-3 text-sm">
              SP-API not configured. <Link href="/settings" className="underline">Add credentials</Link> before creating a shipment.
            </div>
          )}

          {contacts.length === 0 && (
            <div className="rounded-md border border-warning/30 bg-warning/10 text-warning px-4 py-3 text-sm">
              No prep contacts. <Link href="/settings" className="underline">Add one in Settings</Link> first.
            </div>
          )}

          <form action={createShipment} className="rounded-lg border border-border bg-background p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">SKU</label>
              <select
                name="sku"
                defaultValue={defaultSku}
                required
                className="w-full px-3 py-2 border border-border rounded-md text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                {inventory.length === 0 && <option value="">No active SKUs — run Sync now on Inventory first</option>}
                {inventory.map((i) => (
                  <option key={i.sku} value={i.sku}>
                    {i.sku}
                    {i.product_name && ` — ${i.product_name}`}
                    {i.amazon_recommended_quantity ? ` (Amazon suggests ${i.amazon_recommended_quantity})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <input type="hidden" name="product_name" value={defaultItem?.product_name ?? ""} />

            <div>
              <label className="block text-xs font-medium text-muted mb-1">Quantity</label>
              <input
                type="number"
                name="quantity"
                min={1}
                step={1}
                defaultValue={defaultQty}
                required
                className="w-full px-3 py-2 border border-border rounded-md text-sm tabular-nums bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              {defaultItem?.amazon_recommended_quantity ? (
                <p className="text-xs text-muted mt-1">Amazon's suggested replenishment for this SKU is {defaultItem.amazon_recommended_quantity}.</p>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">Prep contact (ship-from)</label>
              <select
                name="prep_contact_id"
                defaultValue={defaultPrepId ?? ""}
                required
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                {contacts.length === 0 && <option value="">No contacts — add one in Settings</option>}
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.city ?? "address missing"}, {c.state ?? "—"}){c.is_default ? " ★" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Link href="/shipments" className="text-sm text-muted hover:text-foreground">
                ← Cancel
              </Link>
              <SubmitButton
                disabled={!configured || contacts.length === 0 || inventory.length === 0}
                pendingLabel="Creating plan… (~1 min)"
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary-hover transition-colors"
              >
                Create shipment
              </SubmitButton>
            </div>
            <p className="text-xs text-muted">
              This calls <code>createInboundPlan</code> on Amazon. Packing options, placement, carrier, and labels come in later steps.
            </p>
          </form>
        </div>
      </main>
    </>
  );
}
