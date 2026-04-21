import { db, migrate } from "@/lib/db/client";
import { sendEmail, alertRecipient } from "@/lib/email";

// Fires low-stock emails for each SKU below threshold, at most once per 24 hours.
// Dedup key in alerts table: "low_stock:<sku>".

const ALERT_TYPE = "low_stock";
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

interface LowStockRow {
  sku: string;
  product_name: string | null;
  quantity_fba: number;
  quantity_inbound: number;
  threshold: number | null;
  asin: string | null;
  amazon_recommended_quantity: number | null;
}

export interface LowStockRunResult {
  checked: number;
  fired: number;
  skippedCooldown: number;
  errors: string[];
}

async function lastSentAt(sku: string): Promise<Date | null> {
  const r = await db().execute({
    sql: `SELECT sent_at FROM alerts
          WHERE type = ? AND subject_key = ?
          ORDER BY sent_at DESC LIMIT 1`,
    args: [ALERT_TYPE, sku],
  });
  const row = r.rows[0] as unknown as { sent_at?: string } | undefined;
  if (!row?.sent_at) return null;
  const iso = row.sent_at.includes("T") ? row.sent_at : row.sent_at.replace(" ", "T") + "Z";
  return new Date(iso);
}

function renderBody(row: LowStockRow): { text: string; html: string; subject: string } {
  const total = row.quantity_fba + row.quantity_inbound;
  const name = row.product_name ?? row.sku;
  const subject = `Low stock: ${name} — ${row.quantity_fba} units left in FBA`;
  const lines = [
    `Heads up: ${name} (${row.sku}) is below threshold.`,
    ``,
    `FBA fulfillable: ${row.quantity_fba}`,
    `Inbound: ${row.quantity_inbound}`,
    `Total on-hand or inbound: ${total}`,
    `Threshold you set: ${row.threshold}`,
    ...(row.amazon_recommended_quantity
      ? [``, `Amazon suggests sending: ${row.amazon_recommended_quantity} units`]
      : []),
    ``,
    `Dashboard: https://amzn.phoneassured.com/inventory`,
    row.asin ? `Listing: https://www.amazon.com/dp/${row.asin}` : "",
  ].filter(Boolean);
  const text = lines.join("\n");
  const html = `<p>${lines.join("<br>")}</p>`;
  return { subject, text, html };
}

export async function runLowStockAlerts(): Promise<LowStockRunResult> {
  await migrate();
  const result: LowStockRunResult = { checked: 0, fired: 0, skippedCooldown: 0, errors: [] };

  const r = await db().execute(
    `SELECT sku, product_name, quantity_fba, quantity_inbound, threshold, asin,
            amazon_recommended_quantity
     FROM inventory
     WHERE threshold IS NOT NULL
       AND (quantity_fba + quantity_inbound) < threshold`,
  );
  const rows = r.rows as unknown as LowStockRow[];
  result.checked = rows.length;

  const to = alertRecipient();
  const now = Date.now();

  for (const row of rows) {
    const last = await lastSentAt(row.sku);
    if (last && now - last.getTime() < COOLDOWN_MS) {
      result.skippedCooldown++;
      continue;
    }

    const { subject, text, html } = renderBody(row);
    const send = await sendEmail({ to, subject, text, html });

    if (!send.ok) {
      result.errors.push(`${row.sku}: ${send.error}`);
      continue;
    }

    await db().execute({
      sql: `INSERT INTO alerts (type, subject_key, body) VALUES (?, ?, ?)`,
      args: [ALERT_TYPE, row.sku, subject],
    });
    result.fired++;
  }

  return result;
}
