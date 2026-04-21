import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { getShipment } from "@/lib/db/queries/shipments";
import clsx from "clsx";

function statusTone(status: string | null): string {
  if (!status) return "bg-surface-hover text-muted border-border";
  const s = status.toUpperCase();
  if (s === "DELIVERED" || s === "CHECKED_IN" || s === "RECEIVING" || s === "CLOSED") return "bg-success/10 text-success border-success/30";
  if (s === "SHIPPED" || s === "IN_TRANSIT") return "bg-primary/10 text-primary border-primary/30";
  if (s === "WORKING" || s === "READY_TO_SHIP") return "bg-warning/10 text-warning border-warning/30";
  if (s === "CANCELLED" || s === "DELETED" || s === "ERROR") return "bg-danger/10 text-danger border-danger/30";
  return "bg-surface-hover text-muted border-border";
}

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shipment = await getShipment(Number(id));
  if (!shipment) notFound();

  const displayStatus = shipment.amazon_status ?? shipment.status;

  return (
    <>
      <Topbar
        title={shipment.shipment_name ?? `Shipment #${shipment.id}`}
        subtitle={shipment.amazon_shipment_id ?? shipment.inbound_plan_id ?? undefined}
      />
      <main className="flex-1 p-6 bg-surface">
        <div className="max-w-3xl space-y-4">
          <Link href="/shipments" className="text-sm text-muted hover:text-foreground">← All shipments</Link>

          <section className="rounded-lg border border-border bg-background p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Status</h2>
              <span className={clsx("px-2 py-1 rounded border text-xs font-medium", statusTone(displayStatus))}>
                {displayStatus}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <dt className="text-muted">Amazon shipment ID</dt>
              <dd className="font-mono text-xs text-foreground break-all">{shipment.amazon_shipment_id ?? "—"}</dd>
              <dt className="text-muted">Inbound plan ID</dt>
              <dd className="font-mono text-xs text-foreground break-all">{shipment.inbound_plan_id ?? "—"}</dd>
              <dt className="text-muted">Destination FC</dt>
              <dd className="text-foreground">{shipment.destination_fc ?? "—"}</dd>
              <dt className="text-muted">Quantity</dt>
              <dd className="tabular-nums text-foreground">{shipment.quantity ?? "—"}</dd>
              <dt className="text-muted">Last synced from Amazon</dt>
              <dd className="text-foreground">{shipment.last_synced_at ?? "—"}</dd>
              <dt className="text-muted">First seen</dt>
              <dd className="text-foreground">{shipment.created_at}</dd>
            </dl>
          </section>

          {shipment.error_message && (
            <section className="rounded-lg border border-danger/30 bg-danger/10 p-5">
              <h2 className="text-sm font-semibold text-danger mb-2">Error</h2>
              <div className="text-xs text-danger font-mono whitespace-pre-wrap break-all">{shipment.error_message}</div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
