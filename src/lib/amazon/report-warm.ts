// Report warm-up — the fix for "40 minutes for a report is too long" (William, 2026-08-08).
//
// THE PROBLEM. Amazon builds a v3 report asynchronously. Measured on this account 2026-08-08:
// Sponsored Products completes in about 9 minutes, Sponsored Display in 10-15. An engine that
// requests a report and then waits for it would burn its whole 300s function budget and still time
// out, so every engine here uses a DEFERRED pattern instead: request on one run, collect on the
// next. That is correct and it never blocks, but with a 6-hourly cron it means an engine acts on
// data up to SIX HOURS old, and a brand new report type does nothing at all on its first run.
//
// THE FIX. Ask for the reports before anybody needs them. This job requests every report the
// engines will look for, and does nothing else — it never decides, never writes to the account.
// Running it ahead of the engine slots means each engine finds its reports already COMPLETED and
// acts immediately, on data tens of minutes old rather than hours old.
//
// Schedule (William 2026-08-20: "the engine every hour not every six hours"):
//     :00   report-warm      <- requests everything, EVERY HOUR
//     :40   ad-engine        (40 min later, EVERY HOUR)
//   and still six-hourly, unchanged:
//     :15   sb-engine     :30 ad-engine-reintroduce     :45 sd-engine
//
// 40 minutes is the lead, not 20: the slowest report queue ever measured on this account is 31.5
// minutes (12-13Z). See cron-ordering.test.ts, which fails if that gap is ever narrowed.
//
// WARM NEVER WAITS. Each getReport below is called with inlineWaitMs 0, so it asks Amazon and moves
// on. With the 90-second default, five specs is a 450s worst case against a 300s function budget,
// and the specs at the end of the list would silently never be requested.
//
// Sponsored Brands is deliberately NOT warmed here. It does not use the v3 async queue at all —
// sb-v2.ts pulls legacy /v2/hsa day reports, roughly a minute each, synchronously, and the SB
// engine ingests only today and yesterday. There is no queue to get ahead of.

import { adsConfigFromEnv, getAdsAccessToken } from "./ads-api";
import { getReport, type ReportSpec } from "./ads-reports";
import { spReportSpecs } from "./ad-engine";
import { sdReportSpec } from "./sd-engine";

export interface WarmResult {
  ok: boolean;
  requested: string[];   // purposes newly asked for on this run
  ready: string[];       // purposes already COMPLETED and cached
  pending: string[];     // purposes asked for earlier and still building
  errors: string[];
  durationMs: number;
  reason?: string;
}

export async function warmReports(): Promise<WarmResult> {
  const start = Date.now();
  const out: WarmResult = { ok: false, requested: [], ready: [], pending: [], errors: [], durationMs: 0 };
  const cfg = adsConfigFromEnv();
  if (!cfg?.profileId) { out.reason = "ADS_* env not configured"; out.durationMs = Date.now() - start; return out; }
  const token = await getAdsAccessToken(cfg);

  const specs: ReportSpec[] = [...spReportSpecs(), sdReportSpec()];
  for (const spec of specs) {
    try {
      // getReport requests when there is nothing cached, and reports its state otherwise. Calling it
      // is the whole job: we never read the rows here, we only make sure they will exist.
      const r = await getReport(cfg, token, spec, new Date().toISOString(), { inlineWaitMs: 0 });
      if (r.state === "ready") out.ready.push(spec.purpose);
      else if (r.state === "requested") out.requested.push(spec.purpose);
      else out.pending.push(spec.purpose);
    } catch (e) {
      out.errors.push(`${spec.purpose}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  out.ok = true;
  out.durationMs = Date.now() - start;
  return out;
}

export function summarizeWarm(r: WarmResult): string {
  const L: string[] = [];
  L.push(`Report warm-up: ${r.ready.length} ready, ${r.requested.length} newly requested, ${r.pending.length} still building. ${Math.round(r.durationMs / 1000)}s`);
  if (r.requested.length) L.push(`  requested: ${r.requested.join(", ")}`);
  if (r.pending.length) L.push(`  building:  ${r.pending.join(", ")}`);
  if (r.ready.length) L.push(`  ready:     ${r.ready.join(", ")}`);
  for (const e of r.errors) L.push(`ERROR: ${e}`);
  if (r.reason) L.push(r.reason);
  return L.join("\n");
}
