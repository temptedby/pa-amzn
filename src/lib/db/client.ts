import { createClient, type Client } from "@libsql/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: Client | null = null;
let migrated = false;

export function db(): Client {
  if (cached) return cached;

  const url = process.env.DATABASE_URL ?? "file:./data/pa-amzn.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN;

  cached = createClient({ url, authToken });
  return cached;
}

// Additive migrations for DBs that pre-date newer columns. Each statement is
// tried independently; "duplicate column" errors are swallowed.
const ADDITIVE_MIGRATIONS = [
  "ALTER TABLE inventory ADD COLUMN amazon_recommended_quantity INTEGER",
  "ALTER TABLE inventory ADD COLUMN amazon_recommended_ship_date TEXT",
  "ALTER TABLE inventory ADD COLUMN amazon_alert TEXT",
  "ALTER TABLE inventory ADD COLUMN days_of_supply INTEGER",
  "ALTER TABLE inventory ADD COLUMN recommendations_checked_at TEXT",
  "ALTER TABLE shipments ADD COLUMN amazon_shipment_id TEXT",
  "ALTER TABLE shipments ADD COLUMN amazon_status TEXT",
  "ALTER TABLE shipments ADD COLUMN destination_fc TEXT",
  "ALTER TABLE shipments ADD COLUMN shipment_name TEXT",
  "ALTER TABLE shipments ADD COLUMN last_synced_at TEXT",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_amazon_id ON shipments(amazon_shipment_id) WHERE amazon_shipment_id IS NOT NULL",
];

export async function migrate(): Promise<void> {
  if (migrated) return;
  const schemaPath = join(process.cwd(), "src/lib/db/schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  const stripped = schema
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = stripped
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await db().execute(stmt);
  }

  for (const stmt of ADDITIVE_MIGRATIONS) {
    try {
      await db().execute(stmt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate column/i.test(msg)) throw err;
    }
  }

  migrated = true;
}
