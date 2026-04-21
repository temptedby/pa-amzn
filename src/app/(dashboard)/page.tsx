import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { MetricTile } from "@/components/MetricTile";
import { db, migrate } from "@/lib/db/client";
import { configFromEnv } from "@/lib/amazon/sp-api";
import { resendConfigured } from "@/lib/email";
import { Hash, Package, AlertTriangle, Bell, Truck, RefreshCw } from "lucide-react";

interface Stats {
  activeSkus: number;
  totalFbaUnits: number;
  totalInboundUnits: number;
  skusNeedingRestock: number;
  skusBelowThreshold: number;
  alertsToday: number;
  shipmentsInTransit: number;
  lastInventorySync: string | null;
  lastRestockSync: string | null;
}

async function loadStats(): Promise<Stats> {
  await migrate();
  const client = db();

  const [inv, restock, alerts, ship] = await Promise.all([
    client.execute(
      `SELECT
         COUNT(*) FILTER (WHERE quantity_fba > 0 OR quantity_inbound > 0) AS active,
         COALESCE(SUM(quantity_fba), 0) AS fba,
         COALESCE(SUM(quantity_inbound), 0) AS inbound,
         COUNT(*) FILTER (WHERE threshold IS NOT NULL AND (quantity_fba + quantity_inbound) < threshold) AS belowThreshold,
         MAX(last_checked_at) AS lastChecked,
         MAX(recommendations_checked_at) AS lastRecs
       FROM inventory`,
    ),
    client.execute(
      `SELECT COUNT(*) AS n FROM inventory WHERE amazon_recommended_quantity IS NOT NULL AND amazon_recommended_quantity > 0`,
    ),
    client.execute(
      `SELECT COUNT(*) AS n FROM alerts WHERE substr(sent_at, 1, 10) = date('now')`,
    ),
    client.execute(
      `SELECT COUNT(*) AS n FROM shipments WHERE amazon_status IN ('SHIPPED', 'IN_TRANSIT', 'WORKING', 'READY_TO_SHIP')`,
    ),
  ]);

  const invRow = inv.rows[0] as unknown as {
    active: number;
    fba: number;
    inbound: number;
    belowThreshold: number;
    lastChecked: string | null;
    lastRecs: string | null;
  };

  return {
    activeSkus: Number(invRow.active ?? 0),
    totalFbaUnits: Number(invRow.fba ?? 0),
    totalInboundUnits: Number(invRow.inbound ?? 0),
    skusBelowThreshold: Number(invRow.belowThreshold ?? 0),
    skusNeedingRestock: Number((restock.rows[0] as unknown as { n: number })?.n ?? 0),
    alertsToday: Number((alerts.rows[0] as unknown as { n: number })?.n ?? 0),
    shipmentsInTransit: Number((ship.rows[0] as unknown as { n: number })?.n ?? 0),
    lastInventorySync: invRow.lastChecked,
    lastRestockSync: invRow.lastRecs,
  };
}

function formatTime(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function DashboardPage() {
  const stats = await loadStats();
  const spOk = configFromEnv() !== null;
  const resendOk = resendConfigured();

  return (
    <>
      <Topbar title="Dashboard" subtitle="Phone Assured FBA operations at a glance" />
      <main className="flex-1 p-6 bg-surface space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <MetricTile
            label="Active SKUs"
            value={String(stats.activeSkus)}
            icon={Hash}
            caption={`${stats.totalFbaUnits.toLocaleString()} units in FBA`}
          />
          <MetricTile
            label="Inbound units"
            value={stats.totalInboundUnits.toLocaleString()}
            icon={Truck}
            caption={stats.totalInboundUnits > 0 ? "in transit to FBA" : "nothing inbound"}
          />
          <MetricTile
            label="Below threshold"
            value={String(stats.skusBelowThreshold)}
            icon={AlertTriangle}
            caption={stats.skusBelowThreshold === 0 ? "all above threshold" : "needs restock"}
          />
          <MetricTile
            label="Amazon suggests restock"
            value={String(stats.skusNeedingRestock)}
            icon={Package}
            caption="per Amazon's forecast"
          />
          <MetricTile
            label="Alerts sent today"
            value={String(stats.alertsToday)}
            icon={Bell}
            caption={stats.alertsToday === 0 ? "quiet day" : "low-stock emails"}
          />
          <MetricTile
            label="Shipments open"
            value={String(stats.shipmentsInTransit)}
            icon={RefreshCw}
            caption="working / in transit"
          />
        </div>

        <section className="rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">System status</h2>
          <p className="text-xs text-muted mb-4">
            Daily cron runs at 7am PT · next automatic refresh is tomorrow morning
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted">Last inventory sync</dt>
            <dd className="text-foreground font-medium">{formatTime(stats.lastInventorySync)}</dd>
            <dt className="text-muted">Last Amazon restock sync</dt>
            <dd className="text-foreground font-medium">{formatTime(stats.lastRestockSync)}</dd>
            <dt className="text-muted">SP-API</dt>
            <dd className={spOk ? "text-success font-medium" : "text-warning font-medium"}>
              {spOk ? "Connected" : "Not configured"}
            </dd>
            <dt className="text-muted">Resend (email alerts)</dt>
            <dd className={resendOk ? "text-success font-medium" : "text-warning font-medium"}>
              {resendOk ? "Configured" : "Not configured"}
            </dd>
            <dt className="text-muted">Amazon Ads API</dt>
            <dd className="text-warning font-medium">Pending registration</dd>
            <dt className="text-muted">Bid engine</dt>
            <dd className="text-muted font-medium">Ready (awaiting Ads API)</dd>
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Quick links</h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/inventory"
              className="px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-surface-hover"
            >
              Inventory
            </Link>
            <Link
              href="/shipments"
              className="px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-surface-hover"
            >
              Shipments
            </Link>
            <Link
              href="/alerts"
              className="px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-surface-hover"
            >
              Alerts
            </Link>
            <Link
              href="/settings"
              className="px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-surface-hover"
            >
              Settings
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
