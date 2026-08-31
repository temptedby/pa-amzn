import { describe, it, expect } from "vitest";
import { archiveWindows, archiveJobKey, isArchiveJobStale, ARCHIVE_JOB_STALE_HOURS, WRITE_CHUNK } from "./history-archive";

// William 2026-08-23: "make sure we are saving data from this month to go back further once we
// build over time, to not just rely on Amazon's 65 day limit."
describe("archiveWindows — Amazon refuses report windows wider than 31 days", () => {
  const now = new Date("2026-08-23T13:00:00Z");

  it("never asks for more than 31 days at once", () => {
    for (const [a, b] of archiveWindows(95, now)) {
      const span = (new Date(b).getTime() - new Date(a).getTime()) / 864e5 + 1;
      expect(span).toBeLessThanOrEqual(31);
    }
  });

  it("covers the whole range with no gap and no overlap", () => {
    const w = archiveWindows(95, now);
    for (let i = 1; i < w.length; i++) {
      const prevStart = new Date(w[i - 1][0]).getTime();
      const thisEnd = new Date(w[i][1]).getTime();
      expect((prevStart - thisEnd) / 864e5).toBe(1);   // exactly one day apart, back to back
    }
  });

  it("starts at today and never asks for a future date", () => {
    const w = archiveWindows(95, now);
    expect(w[0][1]).toBe("2026-08-23");
    for (const [, end] of w) expect(end <= "2026-08-23").toBe(true);
  });

  it("stops at the floor rather than running past it", () => {
    const w = archiveWindows(95, now);
    const oldest = w[w.length - 1][0];
    expect(oldest >= "2026-05-20").toBe(true);
  });

  it("newest window first, so the most useful data lands before a later chunk can time out", () => {
    const w = archiveWindows(95, now);
    for (let i = 1; i < w.length; i++) expect(w[i][1] < w[i - 1][1]).toBe(true);
  });

  it("handles a short top-up window in one call", () => {
    expect(archiveWindows(10, now)).toHaveLength(1);
  });

  it("a 40-day top-up is wider than the 14-day attribution window, which is the point", () => {
    // A day's sales keep landing for 14 days. Re-reading only yesterday would freeze each day at
    // roughly a third of its eventual sales, which is the error that made 08-19 read as zero.
    const w = archiveWindows(40, now);
    const oldest = new Date(w[w.length - 1][0]).getTime();
    const span = (now.getTime() - oldest) / 864e5;
    expect(span).toBeGreaterThan(14);
  });
});


// 2026-08-31. The archive stopped writing on 08-26 and nobody noticed for five days. The job was
// never broken: it needed 589 seconds and Vercel gives it 300, so it was killed just past halfway
// every single day. Amazon's report queue is a fixed ~5-10 minutes per window whatever the width,
// so waiting for it inside one invocation could never fit. These pin the deferred design.
describe("archive report jobs — ask, hang up, collect next run", () => {
  it("keys DAILY archive reports apart from the engine's SUMMARY reports", () => {
    // The old code avoided the shared getReport() precisely because its key has no timeUnit, so a
    // DAILY request would collide with a SUMMARY request for the same dates and one would be
    // handed the other's rows. The `archive-daily` prefix is what keeps them apart.
    const k = archiveJobKey("PROF1", "2026-08-01", "2026-08-31");
    expect(k).toContain("archive-daily");
    expect(k).toContain("PROF1");
    expect(k).toContain("2026-08-01");
    expect(k).toContain("2026-08-31");
  });

  it("gives every window its own job, so one window cannot overwrite another", () => {
    const a = archiveJobKey("P", "2026-08-01", "2026-08-31");
    const b = archiveJobKey("P", "2026-07-22", "2026-07-31");
    expect(a).not.toEqual(b);
  });

  it("separates profiles, so Canada cannot collect the US report", () => {
    expect(archiveJobKey("US", "2026-08-01", "2026-08-31"))
      .not.toEqual(archiveJobKey("CA", "2026-08-01", "2026-08-31"));
  });

  it("keeps waiting on a young job rather than stacking up duplicate reports", () => {
    const now = "2026-08-31T12:00:00Z";
    expect(isArchiveJobStale("2026-08-31T11:00:00Z", now)).toBe(false);
    expect(isArchiveJobStale("2026-08-31T06:30:00Z", now)).toBe(false);
  });

  it("gives up on a report Amazon never finished and asks again", () => {
    const now = "2026-08-31T12:00:00Z";
    expect(isArchiveJobStale("2026-08-31T06:00:00Z", now)).toBe(true);   // exactly 6h
    expect(isArchiveJobStale("2026-08-30T12:00:00Z", now)).toBe(true);
  });

  it("the stale bar is longer than the cron gap, so a job gets a real chance to finish", () => {
    // The cron runs every 4 hours. A 6-hour stale bar means a report is polled at least once more
    // before we conclude it died. A bar shorter than the gap would re-request for ever.
    expect(ARCHIVE_JOB_STALE_HOURS).toBeGreaterThan(4);
  });

  it("batches writes rather than one round trip per keyword-day", () => {
    // 4,131 separate awaits against Turso was minutes of pure latency stacked on the report wait.
    expect(WRITE_CHUNK).toBeGreaterThan(100);
  });
});
