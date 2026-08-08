import { describe, it, expect } from "vitest";
import { formatAdsDigest, type DigestStats } from "./ads-digest";
import { splitForTelegram, TELEGRAM_MAX_CHARS } from "@/lib/notify/telegram";

const stats = (o: Partial<DigestStats> = {}): DigestStats => ({
  generatedAt: "2026-08-03T13:00:00Z",
  runs24h: 4, runsWithActions24h: 2, lastRunAt: "2026-08-03T12:00:00Z",
  kills24h: 1, bids24h: 5, adds24h: 2, rejected24h: 0,
  kills7d: 3, bids7d: 26, adds7d: 8,
  reintroToday: 10, reintroCohort: 30,
  reports: [{ status: "COMPLETED", n: 4 }], staleReports: 0,
  products: [
    { label: "Products", kills24h: 1, bids24h: 5, adds24h: 2, kills7d: 3, bids7d: 26, adds7d: 8, rejected24h: 0, lastActionAt: "2026-08-03T12:00:00Z" },
    { label: "Brands", kills24h: 0, bids24h: 0, adds24h: 0, kills7d: 1, bids7d: 0, adds7d: 0, rejected24h: 0, lastActionAt: "2026-08-02T06:00:00Z" },
    { label: "Display", kills24h: 0, bids24h: 0, adds24h: 0, kills7d: 0, bids7d: 0, adds7d: 0, rejected24h: 0, lastActionAt: null },
  ],
  ...o,
});

describe("formatAdsDigest", () => {
  it("leads with engine health, not results", () => {
    const lines = formatAdsDigest(stats()).split("\n");
    expect(lines.findIndex((l) => l === "ENGINE HEALTH"))
      .toBeLessThan(lines.findIndex((l) => l === "ACTIONS"));
  });

  it("shouts when no heartbeat was logged — the seven-week silent failure", () => {
    expect(formatAdsDigest(stats({ runs24h: 0 }))).toContain("no heartbeat in 24h");
  });

  it("stays quiet about heartbeats when the cron is healthy", () => {
    expect(formatAdsDigest(stats({ runs24h: 4 }))).not.toContain("no heartbeat");
  });

  it("does not imply acting runs are a subset of heartbeats — they are independent sources", () => {
    // Live 2026-08-02 showed runs24h=0 alongside actingRuns=2, because pre-heartbeat code logged
    // actions but no `run` row. "of those, acted: 2" under "runs: 0" read as a contradiction.
    const t = formatAdsDigest(stats({ runs24h: 0, runsWithActions24h: 2 }));
    expect(t).not.toContain("of those");
    expect(t).toContain("heartbeats logged");
    expect(t).toContain("runs that acted");
  });

  it("flags a gap longer than the 6-hourly cron interval", () => {
    const t = formatAdsDigest(stats({ generatedAt: "2026-08-02T20:56:00Z", lastRunAt: "2026-08-02T06:03:00Z" }));
    expect(t).toContain("has missed at least one slot");
  });

  it("does not flag a gap inside the normal interval", () => {
    const t = formatAdsDigest(stats({ generatedAt: "2026-08-02T11:00:00Z", lastRunAt: "2026-08-02T06:03:00Z" }));
    expect(t).not.toContain("missed at least one slot");
  });

  it("surfaces actions Amazon rejected, so a rejected batch cannot read as success", () => {
    expect(formatAdsDigest(stats({ rejected24h: 8 }))).toContain("REJECTED BY AMAZON: 8");
  });

  it("omits the rejection line when nothing was rejected", () => {
    expect(formatAdsDigest(stats({ rejected24h: 0 }))).not.toContain("REJECTED BY AMAZON");
  });

  it("flags a stalled report queue", () => {
    expect(formatAdsDigest(stats({ staleReports: 3 }))).toContain("STALE: 3 job(s)");
  });

  it("reports both 24h and 7d action counts", () => {
    const t = formatAdsDigest(stats());
    expect(t).toContain("paused");
    expect(t).toContain("re-bid");
    expect(t).toContain("added");
  });

  it("reports the reintroduction ramp", () => {
    const t = formatAdsDigest(stats({ reintroToday: 10, reintroCohort: 30 }));
    expect(t).toContain("brought back today : 10");
    expect(t).toContain("cohort to date     : 30");
  });

  it("handles a never-run engine without crashing", () => {
    const t = formatAdsDigest(stats({ runs24h: 0, lastRunAt: null, reports: [] }));
    expect(t).toContain("last activity     : never");
    expect(t).toContain("no report jobs yet");
  });

  it("fits in a single Telegram message", () => {
    expect(splitForTelegram(formatAdsDigest(stats()))).toHaveLength(1);
  });
});

describe("splitForTelegram", () => {
  it("returns nothing for empty text", () => expect(splitForTelegram("")).toEqual([]));

  it("keeps short text as one message", () => {
    expect(splitForTelegram("hello\nworld")).toEqual(["hello\nworld"]);
  });

  it("splits on line boundaries rather than mid-line", () => {
    const line = "x".repeat(100);
    const chunks = splitForTelegram(Array(10).fill(line).join("\n"), 250);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(250);
      for (const l of c.split("\n")) expect(l).toBe(line); // no line was cut in half
    }
  });

  it("hard-splits a single line longer than the limit as a last resort", () => {
    const chunks = splitForTelegram("y".repeat(250), 100);
    expect(chunks).toHaveLength(3);
    expect(chunks.join("")).toBe("y".repeat(250));
  });

  it("never emits a chunk over Telegram's documented 4096 limit", () => {
    const big = Array(2000).fill("a moderately long digest line about a keyword").join("\n");
    for (const c of splitForTelegram(big)) expect(c.length).toBeLessThanOrEqual(TELEGRAM_MAX_CHARS);
  });

  it("loses no content when splitting", () => {
    const src = Array(50).fill("line of text").join("\n");
    expect(splitForTelegram(src, 60).join("\n")).toBe(src);
  });
});

describe("every ad product is reported, even at zero (William 2026-08-08)", () => {
  it("names Products, Brands and Display, whether or not they acted", () => {
    const out = formatAdsDigest(stats());
    expect(out).toContain("BY AD PRODUCT");
    for (const label of ["Products", "Brands", "Display"]) expect(out).toContain(label);
  });

  it("says plainly when a product has NEVER logged an action", () => {
    // Display is the case this exists for: 0.87x lifetime and no rule at all until 2026-08-08.
    const out = formatAdsDigest(stats());
    expect(out).toContain("Display");
    expect(out).toMatch(/never logged an action/);
  });

  it("does not cry wolf when every product has acted", () => {
    const out = formatAdsDigest(stats({
      products: stats().products.map((p) => ({ ...p, lastActionAt: "2026-08-03T12:00:00Z" })),
    }));
    expect(out).not.toMatch(/never logged an action/);
  });

  it("surfaces a per-product rejection rather than burying it in the account total", () => {
    const out = formatAdsDigest(stats({
      products: stats().products.map((p) => p.label === "Brands" ? { ...p, rejected24h: 4 } : p),
    }));
    expect(out).toMatch(/4 action\(s\) REJECTED by Amazon/);
  });
});
