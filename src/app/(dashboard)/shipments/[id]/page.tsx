import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { getShipment } from "@/lib/db/queries/shipments";
import clsx from "clsx";

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "created"
      ? "bg-success/10 text-success border-success/30"
      : status === "failed"
        ? "bg-danger/10 text-danger border-danger/30"
        : status === "creating"
          ? "bg-warning/10 text-warning border-warning/30"
          : "bg-surface-hover text-muted border-border";
  return (
    <span className={clsx("px-2 py-1 rounded border text-xs font-medium", tone)}>{status}</span>
  );
}

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shipment = await getShipment(Number(id));
  if (!shipment) notFound();

  return (
    <>
      <Topbar title={`Shipment #${shipment.id}`} subtitle={`${shipment.sku} × ${shipment.quantity}`} />
      <main className="flex-1 p-6 bg-surface">
        <div className="max-w-3xl space-y-4">
          <Link href="/shipments" className="text-sm text-muted hover:text-foreground">← All shipments</Link>

          <section className="rounded-lg border border-border bg-background p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Status</h2>
              <StatusPill status={shipment.status} />
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <dt className="text-muted">SKU</dt>
              <dd className="font-mono text-foreground">{shipment.sku}</dd>
              <dt className="text-muted">Quantity</dt>
              <dd className="tabular-nums text-foreground">{shipment.quantity}</dd>
              <dt className="text-muted">Inbound plan ID</dt>
              <dd className="font-mono text-xs text-foreground break-all">{shipment.inbound_plan_id ?? "—"}</dd>
              <dt className="text-muted">Operation ID</dt>
              <dd className="font-mono text-xs text-foreground break-all">{shipment.operation_id ?? "—"}</dd>
              <dt className="text-muted">Operation status (Amazon)</dt>
              <dd className="text-foreground">{shipment.operation_status ?? "—"}</dd>
              <dt className="text-muted">Created</dt>
              <dd className="text-foreground">{shipment.created_at}</dd>
              <dt className="text-muted">Last updated</dt>
              <dd className="text-foreground">{shipment.updated_at}</dd>
            </dl>
          </section>

          {shipment.error_message && (
            <section className="rounded-lg border border-danger/30 bg-danger/10 p-5">
              <h2 className="text-sm font-semibold text-danger mb-2">Error</h2>
              <div className="text-xs text-danger font-mono whitespace-pre-wrap break-all">
                {shipment.error_code && <>[{shipment.error_code}] </>}
                {shipment.error_message}
              </div>
              {shipment.error_message.includes("403") && (
                <p className="text-xs text-muted mt-3">
                  Hint: 403 usually means the <strong>Amazon Fulfillment</strong> role isn't enabled on your SP-API app.
                  Open Developer Central → your app → Roles → tick it.
                </p>
              )}
            </section>
          )}

          {shipment.status === "created" && (
            <section className="rounded-lg border border-border bg-background p-5">
              <h2 className="text-sm font-semibold text-foreground mb-2">Next steps (coming soon)</h2>
              <ol className="text-sm text-muted space-y-1 list-decimal list-inside">
                <li>Generate packing options</li>
                <li>Confirm placement</li>
                <li>Pick delivery window + carrier</li>
                <li>Download labels (FNSKU + box + shipping)</li>
                <li>Email prep contact</li>
              </ol>
              <p className="text-xs text-muted mt-3">
                The plan is sitting in Amazon ready for the rest of the workflow. Step C wires these up next.
              </p>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
