import { NextResponse } from "next/server";
import { warmReports, summarizeWarm } from "@/lib/amazon/report-warm";

// Requests every report the ad engines will need, ~20 minutes before they need it.
// Read-only with respect to the ad account: it asks Amazon to build reports and nothing else.
// See report-warm.ts for why this exists (9-15 minute report latency vs a 6-hourly cron).

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
