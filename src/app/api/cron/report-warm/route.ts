import { NextResponse } from "next/server";
import { warmReports, summarizeWarm } from "@/lib/amazon/report-warm";

// Requests every report the ad engines will need, 40 minutes before they need it, every hour.
// Read-only with respect to the ad account: it asks Amazon to build reports and nothing else.
// See report-warm.ts for why this exists (9-15 minute report latency vs a 6-hourly cron).
//
// THE 40 MINUTES IS A LOAD-BEARING NUMBER, and the gap used to run the wrong way round.
// Until 2026-08-18 this cron was "40 */6" and ad-engine was "0 */6", so warm ran 5h20m AHEAD of the
// next engine run rather than 20 minutes before it. While DATA_STALE_HOURS was 30 that went
// unnoticed: the engine happily re-read a report from the previous midnight. When staleness dropped
// to 2 hours (PR #5), every run except 00Z started finding its report too old, re-requesting it,
// waiting the 90-second inline budget, and giving up. The 06:04Z run on 2026-08-18 made ZERO bid
// decisions and harvested ZERO search terms for exactly this reason, and it failed silently because
// an empty report is indistinguishable from "nothing to do".
//
// Both crons must stay in the SAME UTC hour block. The report cache key ends with the end date,
// which is iso(now) in UTC, so a warm at 23:40 and an engine at 00:00 compute different keys and
// the warm-up is wasted. That is why this is "0 * * * *" + "40 * * * *" and not a pair of
// schedules that can straddle midnight. cron-ordering.test.ts pins the invariant.
//
// BOTH ARE NOW HOURLY (William 2026-08-20). The engine still cannot move a keyword's bid more often
// than BID_COOLDOWN_HOURS; what runs 24 times a day instead of 4 is the $4 kill check and the
// search-term harvest.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await warmReports();
  console.log("[report-warm]", summarizeWarm(result));
  return NextResponse.json(result);
}
