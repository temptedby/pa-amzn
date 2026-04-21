import { Topbar } from "@/components/Topbar";
import { listShipments, type Shipment } from "@/lib/db/queries/shipments";
import clsx from "clsx";

function statusTone(status: string | null): string {
  if (!status) return "bg-surface-hover text-muted";
  const s = status.toUpperCase();
  if (s === "DELIVERED" || s === "CHECKED_IN" || s === "RECEIVING" || s === "CLOSED") return "bg-success/10 text-success";
  if (s === "SHIPPED" || s === "IN_TRANSIT") return "bg-primary/10 text-primary";
  if (s === "WORKING" || s === "READY_TO_SHIP") return "bg-warning/10 text-warning";
  if (s === "CANCELLED" || s === "DELETED" || s === "ERROR") return "bg-danger/10 text-danger";
  return "bg-surface-hover text-muted";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Row({ s }: { s: Shipment }) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-3 text-foreground">
        {s.shipment_name ?? s.sku ?? "—"}
        {s.amazon_shipment_id && (
          <div className="text-xs font-mono text-muted">{s.amazon_shipment_id}</div>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.quantity ?? "—"}</td>
      <td className="px-4 py-3 text-muted">{s.destination_fc ?? "—"}</td>
      <td className="px-4 py-3">
        <span className={clsx("px-2 py-0.5 rounded text-xs font-medium", statusTone(s.amazon_status ?? s.status))}>
          {s.amazon_status ?? s.status}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-xs text-muted">{formatDate(s.last_synced_at ?? s.updated_at)}</td>
    </tr>
  );
}

export default async function ShipmentsPage() {
  const rows = await listShipments();
  const tracked = rows.filter((r) => r.amazon_shipment_id);
  const lastSynced = tracked
    .map((r) => r.last_synced_at)
    .filter((s): s is string => !!s)
    .sort()
    .slice(-1)[0];

  return (
    <>
      <Topbar
        title="Shipments"
        subtitle="Inbound FBA shipments — pulled daily from Amazon"
      />
      <main className="flex-1 p-6 bg-surface space-y-4">
        <div className="text-xs text-muted">
          {tracked.length} shipment{tracked.length === 1 ? "" : "s"} tracked
          {lastSynced && <> · last synced {formatDate(lastSynced)}</>}
          {" · daily cron at 7am PT"}
        </div>

        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-left">Shipment</th>
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-left">Destination FC</th>
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-left">Status</th>
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-right">Last synced</th>
              </tr>
            </thead>
            <tbody>
              {tracked.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-sm text-muted">
                    No inbound shipments yet. Create one in Seller Central (Send to Amazon), then the next daily sync pulls it here with live status.
                  </td>
                </tr>
              ) : (
                tracked.map((s) => <Row key={s.id} s={s} />)
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
