import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { db, migrate } from "@/lib/db/client";
import { configFromEnv } from "@/lib/amazon/sp-api";
import { runInventorySync, runRestockSync, saveShipmentTemplate, updateThreshold } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { listPrepContacts } from "@/lib/db/queries/prep-contacts";
import { listShipmentTemplates, type ShipmentTemplate } from "@/lib/db/queries/shipment-templates";
import clsx from "clsx";

interface InventoryRow {
  sku: string;
  fnsku: string | null;
  asin: string | null;
  product_name: string | null;
  quantity_fba: number;
  quantity_inbound: number;
  threshold: number | null;
  last_checked_at: string | null;
  amazon_recommended_quantity: number | null;
  amazon_recommended_ship_date: string | null;
  amazon_alert: string | null;
  days_of_supply: number | null;
  recommendations_checked_at: string | null;
}

async function loadInventory(): Promise<InventoryRow[]> {
  await migrate();
  const result = await db().execute(
    `SELECT sku, fnsku, asin, product_name, quantity_fba, quantity_inbound, threshold,
            last_checked_at, amazon_recommended_quantity, amazon_recommended_ship_date,
            amazon_alert, days_of_supply, recommendations_checked_at
     FROM inventory
     ORDER BY quantity_fba DESC, quantity_inbound DESC, sku`,
  );
  return result.rows as unknown as InventoryRow[];
}

function sellerCentralEditUrl(sku: string, marketplaceId: string): string {
  return `https://sellercentral.amazon.com/abis/product/edit?mSku=${encodeURIComponent(sku)}&marketplaceID=${marketplaceId}`;
}

function publicListingUrl(asin: string | null): string | null {
  return asin ? `https://www.amazon.com/dp/${asin}` : null;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Row({ r, marketplaceId }: { r: InventoryRow; marketplaceId: string }) {
  const total = r.quantity_fba + r.quantity_inbound;
  const low = r.threshold !== null && total < r.threshold;
  const dead = total === 0;
  const listingUrl = publicListingUrl(r.asin);
  const shipQty = r.amazon_recommended_quantity && r.amazon_recommended_quantity > 0
    ? r.amazon_recommended_quantity
    : null;
  const shipHref = shipQty
    ? `/shipments/new?sku=${encodeURIComponent(r.sku)}&qty=${shipQty}`
    : `/shipments/new?sku=${encodeURIComponent(r.sku)}`;
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-3 font-mono text-xs">
        <div className="flex items-center gap-2">
          <a
            href={sellerCentralEditUrl(r.sku, marketplaceId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
            title="Edit listing in Seller Central"
          >
            {r.sku}
          </a>
          {!dead && (
            <Link
              href={shipHref}
              className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted hover:text-primary hover:border-primary"
              title="Create shipment for this SKU"
            >
              Ship
            </Link>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-foreground">
        {listingUrl ? (
          <a
            href={listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary hover:underline"
            title="View public listing"
          >
            {r.product_name ?? r.asin}
          </a>
        ) : (
          (r.product_name ?? "—")
        )}
      </td>
      <td
        className={clsx(
          "px-4 py-3 text-right tabular-nums",
          low && !dead && "text-danger font-semibold",
          dead && "text-muted",
        )}
      >
        {r.quantity_fba}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-foreground">{r.quantity_inbound}</td>
      <td className="px-2 py-2 text-right">
        <form action={updateThreshold} className="inline-flex justify-end">
          <input type="hidden" name="sku" value={r.sku} />
          <input
            type="number"
            name="threshold"
            defaultValue={r.threshold ?? ""}
            min={0}
            placeholder="—"
            title="Press Enter to save"
            className="w-16 px-2 py-1 text-right text-sm rounded-md border border-transparent hover:border-border focus:border-primary focus:outline-none focus:bg-surface tabular-nums text-foreground"
          />
        </form>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {r.amazon_recommended_quantity !== null && r.amazon_recommended_quantity > 0 ? (
          <div>
            <div className="text-foreground font-medium">{r.amazon_recommended_quantity}</div>
            {r.amazon_recommended_ship_date && (
              <div className="text-xs text-muted">by {r.amazon_recommended_ship_date}</div>
            )}
          </div>
        ) : r.recommendations_checked_at ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="text-muted italic text-xs">not checked</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-muted">{r.days_of_supply ?? "—"}</td>
      <td className="px-4 py-3 text-right text-xs text-muted">{formatTimestamp(r.last_checked_at)}</td>
    </tr>
  );
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ showAll?: string; synced?: string; count?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const showAll = sp.showAll === "1";
  const syncMsg = sp.synced
    ? sp.err
      ? { kind: "error" as const, text: `${sp.synced} sync failed: ${sp.err}` }
      : sp.synced === "restock"
        ? {
            kind: (sp.count === "0" ? "warn" : "ok") as "warn" | "ok",
            text:
              sp.count === "0"
                ? "Restock sync finished — Amazon returned 0 recommendations. Usually means your stock is healthy across the SKUs Amazon tracks. Try again after a few days or if you add a new SKU."
                : `Synced ${sp.count} Amazon restock recommendations.`,
          }
        : { kind: "ok" as const, text: `Synced ${sp.count} SKUs from FBA inventory.` }
    : null;

  const [rows, prepContacts, templates] = await Promise.all([
    loadInventory(),
    listPrepContacts(),
    listShipmentTemplates(),
  ]);
  const active = rows.filter((r) => r.quantity_fba + r.quantity_inbound > 0);
  const inactive = rows.filter((r) => r.quantity_fba + r.quantity_inbound === 0);
  const visible = showAll ? rows : active;

  const configured = configFromEnv() !== null;
  const marketplaceId = process.env.SP_API_MARKETPLACE_ID ?? "ATVPDKIKX0DER";
  const lastChecked = rows
    .map((r) => r.last_checked_at)
    .filter((s): s is string => !!s)
    .sort()
    .slice(-1)[0];

  return (
    <>
      <Topbar title="Inventory" subtitle="FBA stock levels per SKU — self-fulfilled SKUs are not tracked here" />
      <main className="flex-1 p-6 bg-surface space-y-4">
        {syncMsg && (
          <div
            className={clsx(
              "rounded-md border px-4 py-3 text-sm",
              syncMsg.kind === "ok" && "border-success/30 bg-success/10 text-success",
              syncMsg.kind === "warn" && "border-warning/30 bg-warning/10 text-warning",
              syncMsg.kind === "error" && "border-danger/30 bg-danger/10 text-danger",
            )}
          >
            {syncMsg.text}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted">
            {active.length} active
            {inactive.length > 0 && <> · {inactive.length} inactive {showAll ? "shown" : "hidden"}</>}
            {lastChecked && <> · last synced {formatTimestamp(lastChecked)}</>}
          </div>
          <div className="flex items-center gap-3">
            {inactive.length > 0 && (
              <Link
                href={showAll ? "/inventory" : "/inventory?showAll=1"}
                className="text-xs text-primary hover:underline"
              >
                {showAll ? "Hide inactive" : `Show ${inactive.length} inactive`}
              </Link>
            )}
            <form action={runRestockSync}>
              <SubmitButton
                disabled={!configured}
                pendingLabel="Fetching… (~1 min)"
                title={configured ? "Pull Amazon's restock recommendations" : "SP-API env vars not set"}
                className={clsx(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors border",
                  configured
                    ? "border-border text-foreground hover:bg-surface-hover"
                    : "border-border text-muted",
                )}
              >
                Sync recs
              </SubmitButton>
            </form>
            <form action={runInventorySync}>
              <SubmitButton
                disabled={!configured}
                pendingLabel="Syncing…"
                title={configured ? "Pull latest FBA quantities" : "SP-API env vars not set"}
                className={clsx(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  configured
                    ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                    : "bg-surface-hover text-muted",
                )}
              >
                Sync now
              </SubmitButton>
            </form>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-left">SKU</th>
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-left">Product</th>
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-right">FBA qty ↓</th>
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-right">Inbound</th>
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-right">Threshold</th>
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-right">Amazon suggests</th>
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-right">Days cover</th>
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-right">Last checked</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-sm text-muted">
                    {configured
                      ? rows.length === 0
                        ? "No inventory data yet. Click Sync now to pull from SP-API."
                        : "No active SKUs. Toggle \"Show inactive\" to see zero-stock SKUs."
                      : "SP-API env vars missing. Configure in Settings to enable sync."}
                  </td>
                </tr>
              ) : (
                visible.map((r) => <Row key={r.sku} r={r} marketplaceId={marketplaceId} />)
              )}
            </tbody>
          </table>
        </div>

        {active.length > 0 && (
          <section className="rounded-lg border border-border bg-background p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-foreground">Shipment templates</h2>
              <span className="text-xs text-muted">
                {templates.size} of {active.length} SKUs configured
              </span>
            </div>
            <p className="text-xs text-muted mb-4">
              Per-SKU defaults used when creating a shipment. Fill what you know — blanks can be filled in later.
              {prepContacts.length === 0 && (
                <>
                  {" "}
                  <Link href="/settings" className="text-primary hover:underline">
                    Add a prep contact
                  </Link>{" "}
                  first so you can assign one here.
                </>
              )}
            </p>
            <div className="space-y-2">
              {active.map((r) => (
                <TemplateCard
                  key={r.sku}
                  sku={r.sku}
                  productName={r.product_name}
                  template={templates.get(r.sku)}
                  prepContacts={prepContacts}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

function TemplateCard({
  sku,
  productName,
  template,
  prepContacts,
}: {
  sku: string;
  productName: string | null;
  template?: ShipmentTemplate;
  prepContacts: { id: number; name: string }[];
}) {
  const configured =
    template !== undefined &&
    (template.units_per_carton !== null ||
      template.carton_length_in !== null ||
      template.prep_contact_id !== null);

  return (
    <details className="border border-border rounded-md">
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none">
        <div>
          <div className="text-sm font-medium text-foreground font-mono">{sku}</div>
          <div className="text-xs text-muted">
            {productName ?? "—"}
            {configured && template ? (
              <>
                {" · "}
                {template.units_per_carton && (
                  <>
                    <span>{template.units_per_carton}/carton</span>
                    {template.carton_length_in && template.carton_width_in && template.carton_height_in && (
                      <>
                        {" · "}
                        {template.carton_length_in}×{template.carton_width_in}×{template.carton_height_in}″
                      </>
                    )}
                    {template.carton_weight_lb && <> · {template.carton_weight_lb} lb</>}
                  </>
                )}
              </>
            ) : (
              <span className="text-warning"> · template not set</span>
            )}
          </div>
        </div>
        <span className="text-xs text-muted">edit ▾</span>
      </summary>
      <div className="border-t border-border px-4 py-4 bg-surface">
        <form action={saveShipmentTemplate} className="space-y-3">
          <input type="hidden" name="sku" value={sku} />
          <div className="grid grid-cols-4 gap-3">
            <NumField
              name="units_per_carton"
              label="Units per carton"
              defaultValue={template?.units_per_carton ?? ""}
              step="1"
            />
            <NumField
              name="carton_length_in"
              label="Length (in)"
              defaultValue={template?.carton_length_in ?? ""}
            />
            <NumField
              name="carton_width_in"
              label="Width (in)"
              defaultValue={template?.carton_width_in ?? ""}
            />
            <NumField
              name="carton_height_in"
              label="Height (in)"
              defaultValue={template?.carton_height_in ?? ""}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField
              name="carton_weight_lb"
              label="Weight (lb)"
              defaultValue={template?.carton_weight_lb ?? ""}
            />
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Prep contact</label>
              <select
                name="prep_contact_id"
                defaultValue={template?.prep_contact_id ?? ""}
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">— none —</option>
                {prepContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Notes (instructions for prep person)</label>
            <textarea
              name="notes"
              rows={2}
              defaultValue={template?.notes ?? ""}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="e.g. Test each unit by pressing the clip. Polybag with suffocation warning before boxing."
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            Save template
          </button>
        </form>
      </div>
    </details>
  );
}

function NumField({
  name,
  label,
  defaultValue,
  step = "0.1",
}: {
  name: string;
  label: string;
  defaultValue?: number | string;
  step?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-muted mb-1">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        step={step}
        min={0}
        defaultValue={defaultValue}
        className="w-full px-3 py-2 border border-border rounded-md text-sm tabular-nums bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      />
    </div>
  );
}
