// Keyword harvesting engine. Pure function — decides whether a search term from
// an auto or broad campaign should graduate to phrase and/or exact match.
//
// Rules (from PRD):
//   - 2+ orders and ACOS < 50% → graduate to exact
//   - 2+ orders and ACOS < 30% → graduate to phrase as well
//   - When graduating, also suggest adding the term as a negative exact in the
//     source campaign so the broad/auto stops cannibalizing spend on a term we
//     now target directly (industry standard practice).

export type HarvestAction =
  | { type: "skip"; reason: string }
  | {
      type: "graduate";
      matchTypes: MatchType[];
      startingBidCents: number;
      addSourceNegative: boolean;
      reason: string;
    };

export type MatchType = "phrase" | "exact";

export interface SearchTermStats {
  term: string;
  sourceMatchType: "auto" | "broad" | "phrase" | "exact";
  rolling14d: {
    impressions: number;
    clicks: number;
    spendCents: number;
    salesCents: number;
    orders: number;
  };
  alreadyGraduatedTo: MatchType[];
}

export interface HarvestConfig {
  minOrders: number;
  exactAcosMaxBps: number;
  phraseAcosMaxBps: number;
  startingBidCents: number;
  addSourceNegativeOnGraduate: boolean;
}

export const DEFAULT_HARVEST_CONFIG: HarvestConfig = {
  minOrders: 2,
  exactAcosMaxBps: 5000,
  phraseAcosMaxBps: 3000,
  startingBidCents: 37,
  addSourceNegativeOnGraduate: true,
};

export function decideHarvest(
  s: SearchTermStats,
  cfg: HarvestConfig = DEFAULT_HARVEST_CONFIG,
): HarvestAction {
  if (s.sourceMatchType === "exact") {
    return { type: "skip", reason: "source is already exact match" };
  }

  if (s.rolling14d.orders < cfg.minOrders) {
    return {
      type: "skip",
      reason: `${s.rolling14d.orders} orders < min ${cfg.minOrders}`,
    };
  }

  if (s.rolling14d.salesCents === 0) {
    return { type: "skip", reason: "no attributed sales" };
  }

  const acosBps = Math.round((s.rolling14d.spendCents / s.rolling14d.salesCents) * 10_000);

  if (acosBps >= cfg.exactAcosMaxBps) {
    return {
      type: "skip",
      reason: `ACOS ${(acosBps / 100).toFixed(1)}% ≥ exact threshold ${cfg.exactAcosMaxBps / 100}%`,
    };
  }

  const matchTypes: MatchType[] = [];
  if (!s.alreadyGraduatedTo.includes("exact")) matchTypes.push("exact");
  if (acosBps < cfg.phraseAcosMaxBps && !s.alreadyGraduatedTo.includes("phrase")) {
    matchTypes.push("phrase");
  }

  if (matchTypes.length === 0) {
    return { type: "skip", reason: "already graduated to all eligible match types" };
  }

  return {
    type: "graduate",
    matchTypes,
    startingBidCents: cfg.startingBidCents,
    addSourceNegative: cfg.addSourceNegativeOnGraduate,
    reason: `${s.rolling14d.orders} orders, ACOS ${(acosBps / 100).toFixed(1)}%; graduating to ${matchTypes.join(", ")}`,
  };
}
