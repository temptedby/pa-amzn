import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// WHY THIS TEST EXISTS.
//
// On 2026-08-18 the 06:04Z ad-engine run made zero bid decisions and harvested zero search terms.
// Nothing threw. The cause was purely the cron schedule: report-warm ran at "40 */6" and ad-engine
// at "0 */6", so the warm-up landed 5h20m BEFORE the next engine run instead of the 20 minutes its
// own comment claimed. Under DATA_STALE_HOURS=30 that was invisible. Under DATA_STALE_HOURS=2 the
// engine found every report stale, re-requested, waited its 90-second inline budget, and gave up.
//
// An engine that receives an empty report does nothing, which is a SAFE failure but a silent one:
// the bid loop iterates report rows, so no rows means no decisions rather than runaway raises.
// Silence is exactly why it ran for a full day before anyone noticed. These assertions make the
// schedule relationship a thing that fails loudly in CI instead of quietly in production.
const CRONS: { path: string; schedule: string }[] = JSON.parse(readFileSync("vercel.json", "utf8")).crons;

const find = (path: string) => {
  const c = CRONS.find((x) => x.path === path);
  if (!c) throw new Error(`no cron registered for ${path}`);
  return c.schedule;
};
// Splits a cron string into its minute and hour fields, e.g. minute 40 and hour field */6.
const parse = (schedule: string) => {
  const [minute, hourField] = schedule.split(/\s+/);
  return { minute: Number(minute), hourField };
};

describe("report warm-up must land before the engines that read it", () => {
  const warm = parse(find("/api/cron/report-warm"));
  const engine = parse(find("/api/cron/ad-engine"));

  it("warms first, and inside the same hour", () => {
    expect(warm.hourField).toBe(engine.hourField);
    expect(warm.minute).toBeLessThan(engine.minute);
  });

  it("leaves enough lead for the slowest measured report queue", () => {
    // Measured 2026-08-17 from Amazon's own createdAt/updatedAt across every report we have run:
    // mean 2.6 min at 00:00Z, mean 29.9 min at 12-13Z, slowest single observation 31.5 min.
    // A 40-minute lead clears the slowest one seen; anything under 32 would not.
    expect(engine.minute - warm.minute).toBeGreaterThanOrEqual(32);
  });

  it("keeps both crons in the same UTC day", () => {
    // The report cache key ends with the END DATE, computed as iso(now) in UTC. A warm at 23:40 and
    // an engine at 00:00 therefore build DIFFERENT keys and the warm-up is thrown away. Sharing one
    // hour field is what guarantees the pair always falls inside one UTC date.
    expect(warm.hourField.startsWith("*/")).toBe(true);
    expect(engine.hourField.startsWith("*/")).toBe(true);
  });

  it("still runs the engine four times a day", () => {
    expect(engine.hourField).toBe("*/6");
  });
});
