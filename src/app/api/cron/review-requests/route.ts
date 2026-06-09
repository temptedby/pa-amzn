import { NextResponse } from "next/server";
import { runReviewRequests } from "@/lib/amazon/sync-review-requests";

// Fast, isolated endpoint for the compliant review engine (no slow restock step).
//   ?dryRun=1   — preview eligible orders, send nothing
//   ?catchUp=1  — one-time backlog blast: send to EVERY order Amazon still allows
//                 (5-30 days post-delivery), bypassing the Tue-Thu + 7-day gates
// Returns requestedOrderIds so you can confirm exactly which orders were asked.
// Auth: Bearer CRON_SECRET (same as daily-sync).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const catchUp = url.searchParams.get("catchUp") === "1";

  const result = await runReviewRequests({ dryRun, catchUp });
  return NextResponse.json({ dryRun, catchUp, ...result });
}
