/**
 * BACOS governor. William 2026-10-07: "Need to have a goal of BACOS which is marketing spend and
 * overal sales not to be more than 40%", then "i like throttle idea if things are going well then
 * press the spend", then "slow is smooth lets continue to update the rules until we find the right
 * mix".
 *
 * BACOS (blended ACOS) = ad spend / TOTAL revenue, organic included. Measured 2026-10-07 over
 * 10-01..10-07: $307.48 of ad spend against $379.22 of booked revenue, so 81.1%, or 73.2% if the
 * four Pending orders carry the average. Against a 40% target that is roughly double.
 *
 * WHY BACOS AND NOT ROAS. Both of its inputs are known the same day. Ad spend settles immediately
 * and order revenue settles immediately; only ad-ATTRIBUTED sales need the 14-day window. ACOS and
 * ROAS therefore cannot be used to steer in the present tense, which is the mistake that nearly
 * killed 177 keywords holding $517.84 on 2026-10-06. BACOS has no such blind spot, so it is the
 * one efficiency number this account can act on today.
 *
 * WHY THE LEVER IS BUDGET, NOT BIDS. The kill rule is a per-keyword receipt: the compliance audit
 * on 2026-10-07 found 54% of October's spend sitting below the $4 bar, where no keyword rule can
 * reach it (100% of Brands, Display and Canada). Only a campaign daily budget throttles the account
 * as a whole.
 *
 * WHY BUDGETS MUST BE SET FROM DESIRED SPEND. The 11 enabled US campaigns authorise $747/day and
 * actually spend about $44, so budgets are 17x headroom and carry no information. Scaling them by a
 * percentage would change nothing. This plans the daily spend we WANT and then distributes it as
 * budgets, pro-rata on each campaign's recent spend, which is what makes the budget binding.
 *
 * This supersedes William's 2026-08-28 call to "leave daily budgets as is, hourly enforcement is
 * the brake". He has now asked for the throttle explicitly; hourly enforcement never materialised
 * as a spend brake, and the $4 bar cannot be one.
 */

/** Ad spend / total revenue, organic included. Null when there is no revenue to divide by. */
export function bacos(adSpend: number, totalRevenue: number): number | null {
  if (!(totalRevenue > 0)) return null;
  return adSpend / totalRevenue;
}

/** The target ceiling. 40% is William's number. */
export const BACOS_TARGET = 0.40;

/**
 * Press spend UP only when BACOS is comfortably under target, not merely under it. The gap between
 * this and BACOS_TARGET is a dead band: inside it the governor does nothing. Without it the thing
 * raises and lowers around 40% forever, which is the oscillation the bid ladder already taught us
 * (31 "the raise to $0.85 made it worse" reversals in 36 hours, 2026-10-07).
 */
export const BACOS_PRESS_BELOW = 0.32;

/**
 * Step sizes, asymmetric on purpose. Down is firmer than up because the account is losing money at
 * 81% BACOS and every day at that rate costs about $20 of contribution. Up is deliberately gentle:
 * "given a range for changing something profitable, take the SLOW end; the risk is asymmetric"
 * (William, recorded 2026-08-09). -20%/day walks $43.93 to the $21.67 allowance in four days and
 * to $11.54 in six. +10%/day takes eleven days to undo a halving, which is the right trade.
 */
export const BACOS_STEP_DOWN = 0.20;
export const BACOS_STEP_UP = 0.10;

/** One move a day. Budget changes need a full day of spend before they can be judged. */
export const BACOS_COOLDOWN_HOURS = 24;

/**
 * Floor for a campaign that IS spending. Amazon's own minimum daily budget is $1.00, and that is
 * the right number: a campaign whose pro-rata share is 2 cents should sit at the minimum, not at
 * some comfortable-looking figure. An earlier $5 value put $25/day of authorisation behind five
 * campaigns whose combined share was $2.05.
 */
export const BACOS_MIN_CAMPAIGN_BUDGET = 1;

/**
 * Ceiling for a campaign that spent NOTHING in the window. It is never raised to this, only pulled
 * down to it, so a dormant campaign cannot wake up holding a large budget. $5 rather than $1 so a
 * deliberately small live test (the 3-Pack sits at $2/day) is left exactly where it was put.
 */
export const BACOS_DORMANT_CAP = 5;

export interface CampaignSpend {
  campaignId: string;
  name?: string;
  /** current daily budget on Amazon */
  budget: number;
  /** this campaign's spend over the measurement window */
  windowSpend: number;
}

export interface BacosPlan {
  bacos: number | null;
  target: number;
  /** "throttle" | "press" | "hold" | "unknown" */
  action: "throttle" | "press" | "hold" | "unknown";
  reason: string;
  /** actual ad spend per day over the window */
  currentDaily: number;
  /** what 40% of revenue permits per day */
  allowedDaily: number;
  /** where this move lands, after the step limit */
  nextDaily: number;
  moves: { campaignId: string; name?: string; fromBudget: number; toBudget: number }[];
}

/**
 * Plan one day's move.
 *
 * `windowDays` is the measurement window. Seven days is the default: long enough that one quiet
 * Tuesday cannot swing it, short enough to respond inside a week. Both inputs are same-day settled,
 * so there is no attribution lag to wait out.
 */
export function planBacosThrottle(
  adSpend: number,
  totalRevenue: number,
  windowDays: number,
  campaigns: CampaignSpend[],
  opts: {
    target?: number; pressBelow?: number;
    stepDown?: number; stepUp?: number;
    minCampaignBudget?: number;
    dormantCap?: number;
    /** never plan above this many dollars a day, whatever the maths says */
    maxDaily?: number;
  } = {},
): BacosPlan {
  const target = opts.target ?? BACOS_TARGET;
  const pressBelow = opts.pressBelow ?? BACOS_PRESS_BELOW;
  const stepDown = opts.stepDown ?? BACOS_STEP_DOWN;
  const stepUp = opts.stepUp ?? BACOS_STEP_UP;
  const minBudget = opts.minCampaignBudget ?? BACOS_MIN_CAMPAIGN_BUDGET;
  const dormantCap = opts.dormantCap ?? BACOS_DORMANT_CAP;
  const days = Math.max(1, windowDays);

  const b = bacos(adSpend, totalRevenue);
  const currentDaily = adSpend / days;
  const allowedDaily = (target * totalRevenue) / days;

  const plan: BacosPlan = {
    bacos: b, target, action: "unknown", reason: "", currentDaily, allowedDaily,
    nextDaily: currentDaily, moves: [],
  };

  // No revenue means no denominator. Silence is not a verdict: hold and say so, rather than
  // treating zero revenue as infinitely bad and throttling to the floor on a reporting gap.
  if (b === null) {
    plan.reason = "no revenue in the window, so BACOS is undefined; holding rather than guessing";
    return plan;
  }
  // Equally, no spend to redistribute means nothing to plan from.
  if (!(currentDaily > 0)) {
    plan.action = "hold";
    plan.reason = "no ad spend in the window, so there is nothing to throttle or press";
    return plan;
  }

  if (b > target) {
    plan.action = "throttle";
    plan.nextDaily = Math.max(allowedDaily, currentDaily * (1 - stepDown));
    plan.reason = `BACOS ${(b * 100).toFixed(1)}% is over the ${(target * 100).toFixed(0)}% target, `
      + `so spend steps down ${(stepDown * 100).toFixed(0)}% toward the $${allowedDaily.toFixed(2)}/day allowance`;
  } else if (b < pressBelow) {
    plan.action = "press";
    plan.nextDaily = Math.min(allowedDaily, currentDaily * (1 + stepUp));
    plan.reason = `BACOS ${(b * 100).toFixed(1)}% is comfortably under the ${(target * 100).toFixed(0)}% target, `
      + `so spend steps up ${(stepUp * 100).toFixed(0)}% toward the $${allowedDaily.toFixed(2)}/day allowance`;
  } else {
    plan.action = "hold";
    plan.reason = `BACOS ${(b * 100).toFixed(1)}% sits in the ${(pressBelow * 100).toFixed(0)}-${(target * 100).toFixed(0)}% dead band; `
      + `holding so the governor cannot oscillate`;
    return plan;
  }

  if (opts.maxDaily != null) plan.nextDaily = Math.min(plan.nextDaily, opts.maxDaily);

  // Distribute the planned daily spend as budgets, pro-rata on what each campaign actually spent.
  //
  // THREE RULES, all three of them learned from the first dry run of this function (2026-10-07),
  // which proposed raising the 3-Pack test campaign from $2.00 to $5.00 inside a THROTTLE and
  // authorised $82.01/day against a $39.07/day plan because nine idle campaigns each took the floor.
  //
  // 1. Only campaigns that SPENT in the window are repriced. A campaign that spent nothing is not
  //    contributing to BACOS, so throttling it achieves nothing, and rewriting it breaks deliberate
  //    setups -- the 3-Pack sits at $2/day on purpose as a test.
  // 2. A dormant campaign is still pulled DOWN to BACOS_DORMANT_CAP, so it cannot wake up holding a
  //    large budget. That is not hypothetical: on 2026-09-01 both dead channels woke up with nothing
  //    able to switch them off. Capping at the planned daily spend was tried first and was worse --
  //    it left a dormant $100/day campaign at $39.07 where the cap puts it at $5.
  // 3. A throttle may never RAISE a budget and a press may never LOWER one. Without this the floor
  //    acts as a raise, which is how rule 1 was discovered.
  const totalWindowSpend = campaigns.reduce((s, c) => s + Math.max(0, c.windowSpend), 0);
  for (const c of campaigns) {
    let to: number;
    if (c.windowSpend > 0 && totalWindowSpend > 0) {
      const raw = plan.nextDaily * (c.windowSpend / totalWindowSpend);
      to = Math.max(minBudget, Math.round(raw * 100) / 100);
    } else {
      // Rule 1 + rule 2: leave it where it is, but never above the dormant cap.
      to = Math.min(c.budget, dormantCap);
    }
    // Rule 3: the move must agree with the action.
    if (plan.action === "throttle" && to > c.budget) continue;
    if (plan.action === "press" && to < c.budget) continue;
    if (Math.abs(to - c.budget) < 0.01) continue;      // nothing to write
    plan.moves.push({ campaignId: c.campaignId, name: c.name, fromBudget: c.budget, toBudget: to });
  }
  return plan;
}
