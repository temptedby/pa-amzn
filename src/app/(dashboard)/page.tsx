import { Topbar } from "@/components/Topbar";
import { MetricTile } from "@/components/MetricTile";
import { SpendVsSalesChart, type DailyPoint } from "@/components/SpendVsSalesChart";
import { Hash, DollarSign, ShoppingCart, Percent, Activity, Bell } from "lucide-react";

// TODO: replace with real data once Ads API is connected.
const mockWeek: DailyPoint[] = [
  { day: "Apr 14", spend: 38.2, sales: 142.35 },
  { day: "Apr 15", spend: 41.8, sales: 161.5 },
  { day: "Apr 16", spend: 39.1, sales: 151.84 },
  { day: "Apr 17", spend: 44.6, sales: 189.8 },
  { day: "Apr 18", spend: 46.9, sales: 199.29 },
  { day: "Apr 19", spend: 42.3, sales: 170.82 },
  { day: "Apr 20", spend: 45.5, sales: 209.38 },
];

const totalSpend = mockWeek.reduce((s, d) => s + d.spend, 0);
const totalSales = mockWeek.reduce((s, d) => s + d.sales, 0);
const acos = (totalSpend / totalSales) * 100;

export default function DashboardPage() {
  return (
    <>
      <Topbar title="Dashboard" subtitle="Momentum bid engine + keyword harvest overview" />
      <main className="flex-1 p-6 bg-surface space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <MetricTile
            label="Active keywords"
            value="0"
            icon={Hash}
            caption="waiting on Ads API"
          />
          <MetricTile
            label="7d ad spend"
            value={`$${totalSpend.toFixed(2)}`}
            icon={DollarSign}
            trend={{ pct: 8.2, direction: "up" }}
            caption="mock"
          />
          <MetricTile
            label="7d attributed sales"
            value={`$${totalSales.toFixed(2)}`}
            icon={ShoppingCart}
            trend={{ pct: 12.4, direction: "up" }}
            caption="mock"
          />
          <MetricTile
            label="7d ACOS"
            value={`${acos.toFixed(1)}%`}
            icon={Percent}
            trend={{ pct: 1.8, direction: "down" }}
            caption="mock"
          />
          <MetricTile label="Bid changes today" value="0" icon={Activity} caption="engine idle" />
          <MetricTile label="Open alerts" value="0" icon={Bell} caption="none" />
        </div>

        <div className="rounded-lg border border-border bg-background p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Spend vs attributed sales</h2>
              <p className="text-xs text-muted mt-0.5">Last 7 days (mock)</p>
            </div>
            <div className="text-xs text-muted tabular-nums">
              Target ACOS &lt; 30%
            </div>
          </div>
          <SpendVsSalesChart data={mockWeek} />
        </div>

        <div className="rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">Engine status</h2>
          <p className="text-xs text-muted mb-4">Live once Ads API registration is approved</p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted">SP-API</dt>
            <dd className="text-foreground font-medium">authorized</dd>
            <dt className="text-muted">Ads API</dt>
            <dd className="text-warning font-medium">pending registration</dd>
            <dt className="text-muted">Marketing Stream</dt>
            <dd className="text-muted">not configured</dd>
            <dt className="text-muted">Bid engine</dt>
            <dd className="text-foreground font-medium">ready (24/24 tests passing)</dd>
          </dl>
        </div>
      </main>
    </>
  );
}
