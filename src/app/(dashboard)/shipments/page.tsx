import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { listShipments } from "@/lib/db/queries/shipments";
import clsx from "clsx";

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "created"
      ? "bg-success/10 text-success"
      : status === "failed"
        ? "bg-danger/10 text-danger"
        : status === "creating"
          ? "bg-warning/10 text-warning"
          : "bg-surface-hover text-muted";
  return (
    <span className={clsx("px-2 py-0.5 rounded text-xs font-medium", tone)}>{status}</span>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function ShipmentsPage() {
  const rows = await listShipments();

  return (
    <>
      <Topbar title="Shipments" subtitle="Inbound plans created via SP-API" />
      <main className="flex-1 p-6 bg-surface space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted">{rows.length} shipment{rows.length === 1 ? "" : "s"}</div>
          <Link
            href="/shipments/new"
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            New shipment
          </Link>
        </div>

        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-left">Created</th>
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-left">SKU</th>
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-left">Status</th>
                <th className="px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide text-left">Plan ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-sm text-muted">
                    No shipments yet. Click <span className="text-foreground">New shipment</span> or hit the Ship button on an inventory row.
                  </td>
                </tr>
              ) : (
                rows.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-xs text-muted">
                      <Link href={`/shipments/${s.id}`} className="hover:text-primary">
                        {formatTime(s.created_at)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/shipments/${s.id}`} className="text-primary hover:underline">
                        {s.sku}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.quantity}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={s.status} />
                      {s.error_message && (
                        <div className="text-xs text-danger mt-1 truncate max-w-xs" title={s.error_message}>
                          {s.error_message}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {s.inbound_plan_id ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
