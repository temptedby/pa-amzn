// Momentum bid rule engine. Pure function — no DB, no API, no I/O.
// Caller is responsible for building the aggregated windows from hourly_snapshots.
//
// Attribution-lag note: Amazon attributes sales up to 7 days post-click. The most
// recent 3-day window therefore under-reports sales (over-reports ACOS). Compared
// against the prior 3-day window (days 4-6 ago, mostly resolved), this biases the
// engine toward NOT over-bidding — a conservative default for a low-margin product.

export type BidAction =
  | { type: "no_change"; rule: string; reason: string }
  | { type: "increase_bid"; rule: string; reason: string; newBidCents: number; pct: number }
  | { type: "decrease_bid"; rule: string; reason: string; newBidCents: number; pct: number }
  | { type: "pause_keyword"; rule: string; reason: string };

export interface Window {
  impressions: number;
  clicks: number;
  spendCents: number;
  salesCents: number;
  orders: number;
}

export interface KeywordState {
  currentBidCents: number;
  lastBidChangeAt: string | null; // ISO 8601 UTC
  rolling7d: Window;
  rolling3d: Window;   // days -3..0
  prior3d: Window;     // days -6..-3
}

export interface EngineConfig {
  killSwitchSpendCents: number;       // $4.00
  softCapCents: number;               // Above this bid, default is to DECREASE unless ACOS is aspirational
  aspirationalAcosBps: number;        // The only ACOS that justifies growing above the soft cap. 10% = 1000 bps
  deadKeywordPauseCents: number;      // $2.00 — above this with 0 impressions → pause
  minHoursBetweenChanges: number;     // 6
  bidFloorCents: number;              // Amazon floor: $0.02
  bidIncrementPct: number;            // 10%
  slowGrowthPct: number;              // 5% — above soft cap with aspirational ACOS, grow slowly
}

// Defaults are tuned for the single-pack ($9.49). Multi-packs and Pro list higher
// and get their soft cap scaled via configForListPriceCents().
export const DEFAULT_CONFIG: EngineConfig = {
  killSwitchSpendCents: 400,
  softCapCents: 200,           // $2.00 for single-pack ($9.49). Above this, default is decrease.
  aspirationalAcosBps: 1000,   // 10% ACOS — near "selling on every click" territory
  deadKeywordPauseCents: 200,
  minHoursBetweenChanges: 6,
  bidFloorCents: 2,
  bidIncrementPct: 10,
  slowGrowthPct: 5,
};

// Soft cap scales at ~21% of list price (single-pack $9.49 → $2 cap).
// Pro ($10.49) ≈ $2.20, 2-pack ($13.49) ≈ $2.85, 3-pack ($16.49) ≈ $3.45.
export function configForListPriceCents(listPriceCents: number): EngineConfig {
  const softCapCents = Math.max(2, Math.round((listPriceCents / 949) * 200));
  return { ...DEFAULT_CONFIG, softCapCents };
}

export function acosBps(w: Window): number | null {
  if (w.salesCents === 0) return null;
  return Math.round((w.spendCents / w.salesCents) * 10_000);
}

function hoursSince(iso: string | null, now: Date): number {
  if (!iso) return Infinity;
  return (now.getTime() - new Date(iso).getTime()) / 3_600_000;
}

function bump(currentCents: number, pct: number, dir: 1 | -1, floor: number): number {
  const raw = Math.round(currentCents * (1 + (pct / 100) * dir));
  return Math.max(raw, floor);
}

function fmt$(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtAcos(bps: number | null): string {
  return bps === null ? "n/a" : `${(bps / 100).toFixed(1)}%`;
}

export function decide(
  k: KeywordState,
  cfg: EngineConfig = DEFAULT_CONFIG,
  now: Date = new Date(),
): BidAction {
  // 1. Kill switch: 7d spend ≥ $4 with 0 conversions.
  if (k.rolling7d.spendCents >= cfg.killSwitchSpendCents && k.rolling7d.orders === 0) {
    return {
      type: "pause_keyword",
      rule: "kill_switch",
      reason: `7d spend ${fmt$(k.rolling7d.spendCents)} with 0 conversions`,
    };
  }

  // 2. Dead-keyword give-up: bid climbed to pause threshold but still no impressions.
  if (k.currentBidCents >= cfg.deadKeywordPauseCents && k.rolling7d.impressions === 0) {
    return {
      type: "pause_keyword",
      rule: "dead_keyword_giveup",
      reason: `bid ${fmt$(k.currentBidCents)} but 0 impressions in 7d`,
    };
  }

  // 3. Rate limit: ≤1 change per `minHoursBetweenChanges` per keyword.
  const hrs = hoursSince(k.lastBidChangeAt, now);
  if (hrs < cfg.minHoursBetweenChanges) {
    return {
      type: "no_change",
      rule: "rate_limited",
      reason: `last change ${hrs.toFixed(1)}h ago, min ${cfg.minHoursBetweenChanges}h`,
    };
  }

  // 4. Dead-keyword wake: 0 impressions and bid still under pause threshold → bump up.
  if (k.rolling7d.impressions === 0) {
    const newBid = bump(k.currentBidCents, cfg.bidIncrementPct, 1, cfg.bidFloorCents);
    return {
      type: "increase_bid",
      rule: "dead_keyword_wake",
      reason: "0 impressions in 7d, bumping bid to find auctions",
      newBidCents: newBid,
      pct: cfg.bidIncrementPct,
    };
  }

  // 5. Exploration: has impressions but no conversions, spend under kill threshold → drop bid.
  if (k.rolling7d.orders === 0 && k.rolling7d.spendCents < cfg.killSwitchSpendCents) {
    const newBid = bump(k.currentBidCents, cfg.bidIncrementPct, -1, cfg.bidFloorCents);
    return {
      type: "decrease_bid",
      rule: "exploration_drop",
      reason: `0 conversions, 7d spend ${fmt$(k.rolling7d.spendCents)} < kill threshold; hunting cheaper conversion`,
      newBidCents: newBid,
      pct: cfg.bidIncrementPct,
    };
  }

  // 6-7. Momentum: compare 3d ACOS against prior 3d.
  const current = acosBps(k.rolling3d);
  const prior = acosBps(k.prior3d);

  if (current === null) {
    return {
      type: "no_change",
      rule: "no_recent_signal",
      reason: "3d window has no attributed sales despite 7d activity; holding",
    };
  }

  const aboveSoftCap = k.currentBidCents >= cfg.softCapCents;
  const meetsAspiration = current <= cfg.aspirationalAcosBps;

  // Above the soft cap, the default is to decrease — the product's margin can't
  // support expensive clicks unless ACOS is aspirational (selling on ~every click).
  if (aboveSoftCap && !meetsAspiration) {
    const newBid = bump(k.currentBidCents, cfg.bidIncrementPct, -1, cfg.bidFloorCents);
    return {
      type: "decrease_bid",
      rule: "above_soft_cap_default_down",
      reason: `bid ${fmt$(k.currentBidCents)} ≥ soft cap ${fmt$(cfg.softCapCents)}; 3d ACOS ${fmtAcos(current)} > aspirational ${fmtAcos(cfg.aspirationalAcosBps)}`,
      newBidCents: newBid,
      pct: cfg.bidIncrementPct,
    };
  }

  // Below soft cap — or above with aspirational ACOS — fall through to momentum.
  let dir: 1 | -1;
  let rule: string;
  let reason: string;

  if (prior === null) {
    dir = 1;
    rule = "momentum_up_new";
    reason = `3d ACOS ${fmtAcos(current)} (new signal, no prior window)`;
  } else if (current <= prior) {
    dir = 1;
    rule = "momentum_up";
    reason = `3d ACOS ${fmtAcos(current)} held/improved from prior ${fmtAcos(prior)}`;
  } else {
    dir = -1;
    rule = "momentum_down";
    reason = `3d ACOS ${fmtAcos(current)} worsened from prior ${fmtAcos(prior)}`;
  }

  // Above soft cap with aspirational ACOS → slow growth rate. Decreases unaffected.
  const pct = dir === 1 && aboveSoftCap ? cfg.slowGrowthPct : cfg.bidIncrementPct;
  const newBid = bump(k.currentBidCents, pct, dir, cfg.bidFloorCents);

  return {
    type: dir === 1 ? "increase_bid" : "decrease_bid",
    rule,
    reason,
    newBidCents: newBid,
    pct,
  };
}
