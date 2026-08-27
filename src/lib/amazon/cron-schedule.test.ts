import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// William 2026-08-26: "how do we ensure we're checking every hour to make sure all areas of
// advertising that are spending are being shut off when they should be, while still allowing a
// slow introduction of new keywords to come online".
//
// Those are two OPPOSITE cadences and vercel.json is the only place they are written down. It is
// JSON, so it cannot carry a comment explaining why, and a schedule is exactly the kind of value
// that gets nudged in a hurry and never noticed. This file is the comment, and it fails the build
// if either half drifts.
//
// The gap this closes: PR #11 as originally written made Sponsored PRODUCTS hourly and left Brands
// and Display on six hours. "All areas of advertising" means all three.

const crons: { path: string; schedule: string }[] =
  JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8")).crons;

const scheduleFor = (path: string) => {
  const c = crons.find((c) => c.path === path);
  expect(c, `${path} is not scheduled at all`).toBeDefined();
  return c!.schedule;
};
/** A 5-field cron runs hourly when the hour field is "*" and the minute is a single number. */
const isHourly = (s: string) => /^\d{1,2} \* \* \* \*$/.test(s);
const minuteOf = (s: string) => Number(s.split(" ")[0]);

// Every ad product that can spend money. A new one added here without a cron fails immediately.
const SPENDING_ENGINES = [
  "/api/cron/ad-engine",   // Sponsored Products
  "/api/cron/sb-engine",   // Sponsored Brands
  "/api/cron/sd-engine",   // Sponsored Display
];

describe("cron schedule — every spending ad product is checked hourly", () => {
  for (const path of SPENDING_ENGINES) {
    it(`${path} runs every hour`, () => {
      expect(isHourly(scheduleFor(path)), `${path} is "${scheduleFor(path)}"`).toBe(true);
    });
  }

  it("the reports are warmed before any engine reads them, inside the same hour", () => {
    // The engine judges on whatever report is cached. Warming AFTER it is how the engine spent
    // weeks making one useful pass a day (cron-ordering-warm-before-engine, 2026-08-24).
    const warm = scheduleFor("/api/cron/report-warm");
    expect(isHourly(warm)).toBe(true);
    for (const path of SPENDING_ENGINES)
      expect(minuteOf(warm), `warm must precede ${path}`).toBeLessThan(minuteOf(scheduleFor(path)));
  });

  it("the engines do not start on the same minute", () => {
    // maxDuration is 300s. Two engines starting together can overlap into a third, and they share
    // one Amazon rate limit.
    const mins = SPENDING_ENGINES.map((p) => minuteOf(scheduleFor(p)));
    expect(new Set(mins).size).toBe(mins.length);
  });

  it("each engine has at least 5 minutes of runway before the next one starts", () => {
    const mins = SPENDING_ENGINES.map((p) => minuteOf(scheduleFor(p))).sort((a, b) => a - b);
    for (let i = 1; i < mins.length; i++) expect(mins[i] - mins[i - 1]).toBeGreaterThanOrEqual(5);
  });
});

describe("cron schedule — new keywords still come online SLOWLY", () => {
  it("reintroduction stays six-hourly, so the intake rate does not follow the kill rate", () => {
    // The whole point of the split. Switching a word off is safe to do more often, because it can
    // only pause something that already spent its $4. Switching a word ON is not: REINTRO_PER_RUN
    // is 10, so hourly intake would be 240 keywords a day instead of 40, each carrying $4 of rope.
    // That is ~$960/day of new exposure, against a business with 285 units left.
    const s = scheduleFor("/api/cron/ad-engine-reintroduce");
    expect(isHourly(s)).toBe(false);
    expect(s).toBe("30 */6 * * *");
  });

  it("the monthly reactivation stays monthly", () => {
    expect(scheduleFor("/api/cron/ad-engine-reactivate")).toBe("0 15 1 * *");
  });
});

// ---------------------------------------------------------------------------
// THE WATCHDOG'S OWN SLOT (William 2026-08-27)
// ---------------------------------------------------------------------------
describe("the hourly watchdog", () => {
  const crons = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8")).crons as Array<{ path: string; schedule: string }>;
  const at = (p: string) => crons.find((c) => c.path === `/api/cron/${p}`)?.schedule;
  const minuteOf = (s: string | undefined) => Number(String(s).split(" ")[0]);

  it("exists and runs every hour", () => {
    expect(at("engine-watch")).toBe("15 * * * *");
  });

  it("runs AFTER every engine it audits, by judging the previous hour", () => {
    // :15 is earlier in the clock than the engines, which is the point: it looks back at the
    // cycle that finished 20 minutes ago, not at work still in flight.
    const w = minuteOf(at("engine-watch"));
    for (const p of ["ad-engine", "sb-engine", "sd-engine", "ad-engine-ca", "ad-engine-mx"]) {
      expect(minuteOf(at(p))).toBeGreaterThan(w);
    }
  });

  it("does not collide with any other cron minute", () => {
    const hourly = crons.filter((c) => c.schedule.endsWith("* * * *") && !c.schedule.startsWith("0 1"));
    const mins = hourly.map((c) => minuteOf(c.schedule));
    const dupes = mins.filter((m, i) => mins.indexOf(m) !== i && m !== 0);
    expect(dupes).toEqual([]);
  });

  it("every spending engine is hourly, in every country", () => {
    for (const p of ["ad-engine", "sb-engine", "sd-engine", "ad-engine-ca", "ad-engine-mx"]) {
      expect(at(p), `${p} must stay hourly`).toMatch(/^\d+ \* \* \* \*$/);
    }
  });
});
