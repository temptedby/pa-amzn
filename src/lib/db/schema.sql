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
-- Local keyword history (William 2026-08-05: "we need to keep our own database then outside of
-- amazon ... with text of words spent"). Amazon serves only 95 days (verified against the API's own
-- data-retention error on 2026-08-05), which cannot support the 3-consecutive-month retirement rule
-- and can never show lifetime spend. This is our own record, accumulated forward, never truncated.
--
-- Grain is (keyword text, match type), NOT Amazon's keywordId, deliberately: ~25% of the account is
-- duplicate keywords, so per-ID totals understate what a WORD actually costs.

CREATE TABLE IF NOT EXISTS kw_daily (
  word          TEXT NOT NULL,           -- lowercased, whitespace-collapsed keyword text
  match_type    TEXT NOT NULL,           -- EXACT / PHRASE / BROAD
  day           TEXT NOT NULL,           -- YYYY-MM-DD, Amazon account day (resets 07:00Z)
  spend         REAL NOT NULL DEFAULT 0,
  clicks        INTEGER NOT NULL DEFAULT 0,
  impressions   INTEGER NOT NULL DEFAULT 0,
  orders        INTEGER NOT NULL DEFAULT 0,
  sales         REAL NOT NULL DEFAULT 0,
  ad_product    TEXT NOT NULL DEFAULT 'SPONSORED_PRODUCTS',
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (word, match_type, day, ad_product)
);
CREATE INDEX IF NOT EXISTS idx_kw_daily_word  ON kw_daily (word, match_type);
CREATE INDEX IF NOT EXISTS idx_kw_daily_day   ON kw_daily (day);

-- Permanent tombstones. A word here is NEVER reintroduced, harvested or reactivated, whatever the
-- rolling report window says. Without this, a word killed in June reads as "never spent" by
-- September and burns another $4.
CREATE TABLE IF NOT EXISTS kw_tombstone (
  dead_key      TEXT PRIMARY KEY,        -- "word|MATCHTYPE", from deadKey()
  word          TEXT NOT NULL,
  match_type    TEXT NOT NULL,
  reason        TEXT NOT NULL,           -- 'never_converted' | 'three_dead_months'
  evidence      TEXT,                    -- JSON: the spend/orders that justified it
  killed_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bid ladder state. spend_since_step is DERIVED from kw_daily since last_bid_change_at rather than
-- stored, so it can never drift out of sync with the spend record.
CREATE TABLE IF NOT EXISTS kw_bid_state (
  keyword_id        TEXT PRIMARY KEY,
  word              TEXT NOT NULL,
  match_type        TEXT NOT NULL,
  current_bid       REAL NOT NULL,
  last_bid_change_at TEXT NOT NULL DEFAULT (datetime('now')),
  ladder_active     INTEGER NOT NULL DEFAULT 1,   -- 0 once it spends and the ACOS rule takes over
  escalated_at      TEXT                          -- set when $0.85 hit and William was notified
);
CREATE INDEX IF NOT EXISTS idx_kw_bid_state_word ON kw_bid_state (word, match_type);
CREATE TABLE IF NOT EXISTS kw_lifetime (
  word         TEXT NOT NULL,
  match_type   TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end   TEXT NOT NULL,
  spend        REAL NOT NULL DEFAULT 0,
  clicks       INTEGER NOT NULL DEFAULT 0,
  impressions  INTEGER NOT NULL DEFAULT 0,
  orders       INTEGER NOT NULL DEFAULT 0,
  sales        REAL NOT NULL DEFAULT 0,
  source       TEXT NOT NULL,
  imported_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (word, match_type, period_start, period_end, source)
);
CREATE INDEX IF NOT EXISTS idx_kw_lifetime_word ON kw_lifetime (word, match_type);
CREATE TABLE IF NOT EXISTS campaign_lifetime (
  campaign_name TEXT NOT NULL,
  country       TEXT NOT NULL,
  ad_type       TEXT,
  targeting     TEXT,
  state         TEXT,
  status        TEXT,
  status_code   TEXT,
  start_date    TEXT,
  budget        REAL,
  clicks        INTEGER,
  spend_usd     REAL,
  sales_usd     REAL,
  purchases     INTEGER,
  roas          REAL,
  as_of         TEXT NOT NULL,
  source        TEXT NOT NULL,
  PRIMARY KEY (campaign_name, country, as_of)
);
CREATE TABLE IF NOT EXISTS ad_entity_lifetime (
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  entity_name TEXT,
  asin        TEXT,
  ad_product  TEXT NOT NULL,
  status      TEXT,
  bid         REAL,
  sug_bid     REAL,
  impressions INTEGER,
  clicks      INTEGER,
  dpv         INTEGER,
  spend       REAL,
  orders      INTEGER,
  sales       REAL,
  currency    TEXT NOT NULL DEFAULT 'USD',
  marketplace TEXT NOT NULL DEFAULT 'US',
  source      TEXT NOT NULL,
  as_of       TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id, as_of, source)
);

-- ---------------------------------------------------------------------------
-- OUR OWN HISTORY. William 2026-08-23: "make sure we are saving data from this month
-- to go back further once we build over time, to not just rely on Amazon's 65 day limit."
--
-- Amazon serves roughly 65-95 days of report history and then the data is gone for good. Every
-- rule that reasons about a keyword's PAST is therefore built on sand: shouldRetirePermanently()
-- needs three consecutive months, and by month four Amazon has already forgotten month one, which
-- is the exact cycle isPermanentlyDead() and kw_tombstone were written to break.
--
-- These three tables are ours. Once written, a month is ours forever whatever Amazon drops.
-- ---------------------------------------------------------------------------

-- One row per keyword per DAY. The grain everything else is derived from, so nothing is ever
-- recomputed from a window that has since expired. Upserted, so re-running a backfill is safe and
-- a late-attributed sale updates the day it belongs to rather than the day we noticed.
CREATE TABLE IF NOT EXISTS kw_day (
  keyword_id    TEXT NOT NULL,
  day           TEXT NOT NULL,           -- YYYY-MM-DD, the marketplace's own date
  word          TEXT,
  match_type    TEXT,
  campaign_id   TEXT,
  ad_group_id   TEXT,
  ad_product    TEXT NOT NULL DEFAULT 'SPONSORED_PRODUCTS',
  spend         REAL NOT NULL DEFAULT 0,
  clicks        INTEGER NOT NULL DEFAULT 0,
  impressions   INTEGER NOT NULL DEFAULT 0,
  orders        INTEGER NOT NULL DEFAULT 0,
  sales         REAL NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (keyword_id, day, ad_product)
);
CREATE INDEX IF NOT EXISTS idx_kw_day_day   ON kw_day (day);
CREATE INDEX IF NOT EXISTS idx_kw_day_word  ON kw_day (word, match_type);

-- One row per keyword per MONTH, rolled up from kw_day. This is what the three-month retirement
-- rule reads (William: "if they have three straight months of losses, we put them on the shit
-- list ... if we spend $12 over three months and the word is just not going to convert anymore,
-- then we have to let it die").
CREATE TABLE IF NOT EXISTS kw_month (
  keyword_id    TEXT NOT NULL,
  month         TEXT NOT NULL,           -- YYYY-MM
  word          TEXT,
  match_type    TEXT,
  ad_product    TEXT NOT NULL DEFAULT 'SPONSORED_PRODUCTS',
  spend         REAL NOT NULL DEFAULT 0,
  clicks        INTEGER NOT NULL DEFAULT 0,
  impressions   INTEGER NOT NULL DEFAULT 0,
  orders        INTEGER NOT NULL DEFAULT 0,
  sales         REAL NOT NULL DEFAULT 0,
  days_with_spend INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (keyword_id, month, ad_product)
);
CREATE INDEX IF NOT EXISTS idx_kw_month_month ON kw_month (month);

-- ACCOUNT-level: what a given day's numbers looked like ON a given later date. Small, one row per
-- (day, observed_on). This is the only way to build a real attribution settling curve, because it
-- records the READING as well as the value. attribution-rise.mjs currently reconstructs this from
-- kw_perf_snapshot, which contains partial runs and had to be taught to discard them.
CREATE TABLE IF NOT EXISTS ad_day_observation (
  day           TEXT NOT NULL,           -- the trading day being described
  observed_on   TEXT NOT NULL,           -- the date we read it
  ad_product    TEXT NOT NULL DEFAULT 'SPONSORED_PRODUCTS',
  spend         REAL NOT NULL DEFAULT 0,
  clicks        INTEGER NOT NULL DEFAULT 0,
  orders        INTEGER NOT NULL DEFAULT 0,
  sales         REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (day, observed_on, ad_product)
);
CREATE INDEX IF NOT EXISTS idx_ad_day_obs_day ON ad_day_observation (day);
