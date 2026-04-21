import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { db, migrate } from "@/lib/db/client";
import { configFromEnv } from "@/lib/amazon/sp-api";
import { runInventorySync, runRestockSync, updateThreshold } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
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

function sellerCentralEditUrl(sku: string): string {
  // Inventory search is the most reliable entry point — lands you on the
  // Manage Inventory page filtered to that SKU, from which Edit is one click.
  return `https://sellercentral.amazon.com/inventory?search=${encodeURIComponent(sku)}`;
}

function publicListingUrl(asin: string | null): string | null {
  return asin ? `https://www.amazon.com/dp/${asin}` : null;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Row({ r }: { r: InventoryRow }) {
  const total = r.quantity_fba + r.quantity_inbound;
  const low = r.threshold !== null && total < r.threshold;
  const dead = total === 0;
  const listingUrl = publicListingUrl(r.asin);
  // Deep-link straight to Seller Central's Manage Inventory filtered to this
  // SKU. From there, the row's "Send to Amazon" dropdown is one click — no
  // carton dims, prep contact, or template setup in our app. Megan still
  // computes the quantity (Amazon Suggests column is her starting number).
  const shipHref = `https://sellercentral.amazon.com/inventory?searchField=sku&searchStr=${encodeURIComponent(r.sku)}`;
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-3 font-mono text-xs">
        <div className="flex items-center gap-2">
          <a
            href={sellerCentralEditUrl(r.sku)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
            title="Edit listing in Seller Central"
          >
            {r.sku}
          </a>
          {!dead && (
            <a
              href={shipHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted hover:text-primary hover:border-primary"
              title="Open this SKU in Seller Central — use the row's Send to Amazon dropdown"
            >
              Ship ↗
            </a>
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
        <form action={updateThreshold} className="inline-flex justify-end items-center gap-1">
          <input type="hidden" name="sku" value={r.sku} />
          <input
            type="number"
            name="threshold"
            defaultValue={r.threshold ?? ""}
            min={0}
            placeholder="—"
            className="w-16 px-2 py-1 text-right text-sm rounded-md border border-border focus:border-primary focus:outline-none focus:bg-surface tabular-nums text-foreground"
          />
          <button
            type="submit"
            className="px-2 py-1 text-xs rounded border border-border text-muted hover:text-primary hover:border-primary"
            title="Save threshold"
          >
            Save
          </button>
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

  const rows = await loadInventory();
  const active = rows.filter((r) => r.quantity_fba + r.quantity_inbound > 0);
  const inactive = rows.filter((r) => r.quantity_fba + r.quantity_inbound === 0);
  const visible = showAll ? rows : active;

  const configured = configFromEnv() !== null;
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
                visible.map((r) => <Row key={r.sku} r={r} />)
              )}
            </tbody>
          </table>
        </div>

        {/* Shipment templates removed — Megan uses Amazon's Send-to-Amazon flow
            directly, which handles carton dims, weights, and prep prompts in
            its own UI. Our app's job is just to surface quantity recommendations
            and deep-link into Amazon. */}
      </main>
    </>
  );
}
