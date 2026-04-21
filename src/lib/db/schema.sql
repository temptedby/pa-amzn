-- PA-AMZN schema. SQLite / libsql / Turso compatible.
-- Money stored as INTEGER cents. Timestamps as TEXT ISO8601 (UTC).

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ad_product TEXT NOT NULL CHECK (ad_product IN ('SP', 'SB', 'SD')),
  targeting_type TEXT NOT NULL CHECK (targeting_type IN ('auto', 'manual')),
  state TEXT NOT NULL CHECK (state IN ('enabled', 'paused', 'archived')),
  bidding_strategy TEXT CHECK (bidding_strategy IN ('legacyForSales', 'autoForSales', 'manual')),
  daily_budget_cents INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_groups (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL,
  default_bid_cents INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('enabled', 'paused', 'archived')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS keywords (
  id TEXT PRIMARY KEY,
  ad_group_id TEXT NOT NULL REFERENCES ad_groups(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  match_type TEXT NOT NULL CHECK (match_type IN ('broad', 'phrase', 'exact')),
  text TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('enabled', 'paused', 'archived')),
  current_bid_cents INTEGER NOT NULL,
  last_bid_change_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_keywords_ad_group ON keywords(ad_group_id);
CREATE INDEX IF NOT EXISTS idx_keywords_state ON keywords(state) WHERE state = 'enabled';

-- Performance data per keyword per hour. Sourced from Amazon Marketing Stream (preferred)
-- or Reporting API daily rollup (fallback). source column disambiguates.
CREATE TABLE IF NOT EXISTS hourly_snapshots (
  keyword_id TEXT NOT NULL REFERENCES keywords(id),
  hour_utc TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  spend_cents INTEGER NOT NULL DEFAULT 0,
  sales_cents INTEGER NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('ams', 'reporting_api')),
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (keyword_id, hour_utc)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_hour ON hourly_snapshots(hour_utc);

-- Every bid change the engine decides on. Records BOTH proposed and executed changes
-- so we can measure before/after ACOS impact on any change.
CREATE TABLE IF NOT EXISTS bid_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword_id TEXT NOT NULL REFERENCES keywords(id),
  decided_at TEXT NOT NULL DEFAULT (datetime('now')),
  old_bid_cents INTEGER NOT NULL,
  new_bid_cents INTEGER NOT NULL,
  rule_fired TEXT NOT NULL,
  reason TEXT NOT NULL,
  rolling_3d_acos_bps INTEGER,
  prior_3d_acos_bps INTEGER,
  cumulative_7d_spend_no_conv_cents INTEGER,
  executed_at TEXT,
  amazon_response TEXT
);
CREATE INDEX IF NOT EXISTS idx_bid_changes_keyword ON bid_changes(keyword_id, decided_at DESC);

CREATE TABLE IF NOT EXISTS search_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  source_ad_group_id TEXT REFERENCES ad_groups(id),
  term TEXT NOT NULL,
  rolling_14d_impressions INTEGER NOT NULL DEFAULT 0,
  rolling_14d_clicks INTEGER NOT NULL DEFAULT 0,
  rolling_14d_spend_cents INTEGER NOT NULL DEFAULT 0,
  rolling_14d_sales_cents INTEGER NOT NULL DEFAULT 0,
  rolling_14d_orders INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  graduated_to_keyword_id TEXT REFERENCES keywords(id),
  graduated_at TEXT,
  graduated_match_types TEXT,
  UNIQUE (source_campaign_id, term)
);

CREATE TABLE IF NOT EXISTS inventory (
  sku TEXT PRIMARY KEY,
  fnsku TEXT,
  asin TEXT,
  product_name TEXT,
  quantity_fba INTEGER NOT NULL DEFAULT 0,
  quantity_inbound INTEGER NOT NULL DEFAULT 0,
  threshold INTEGER,
  last_checked_at TEXT,
  last_alerted_at TEXT,
  amazon_recommended_quantity INTEGER,
  amazon_recommended_ship_date TEXT,
  amazon_alert TEXT,
  days_of_supply INTEGER,
  recommendations_checked_at TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alerts_subject ON alerts(type, subject_key, sent_at DESC);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prep_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  is_default INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shipment_templates (
  sku TEXT PRIMARY KEY,
  units_per_carton INTEGER,
  carton_length_in REAL,
  carton_width_in REAL,
  carton_height_in REAL,
  carton_weight_lb REAL,
  prep_contact_id INTEGER,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT,
  product_name TEXT,
  quantity INTEGER,
  prep_contact_id INTEGER,
  inbound_plan_id TEXT,
  operation_id TEXT,
  operation_status TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  error_code TEXT,
  error_message TEXT,
  amazon_shipment_id TEXT,
  amazon_status TEXT,
  destination_fc TEXT,
  shipment_name TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_amazon_id ON shipments(amazon_shipment_id) WHERE amazon_shipment_id IS NOT NULL;
