import { NextResponse } from "next/server";
import { runHistoryArchive } from "@/lib/amazon/history-archive";

// Keep our own copy of the ad history, because Amazon's is temporary.
//
// William 2026-08-23: "make sure we are saving data from this month to go back further once we
// build over time, to not just rely on Amazon's 65 day limit."
//
// Measured the same day: the oldest report Amazon would still build started 2026-05-20, 96 days
// back. Everything before that is already unrecoverable. Every day this does not run is a day that
// eventually falls off the end and cannot be got back, which is why it runs daily rather than
// monthly: a month-end job that fails twice loses a month for good.
//
// It re-reads a 40-day window each time rather than only yesterday. That is deliberate. The
// attribution window is 14 days, so a day's sales keep landing long after the day itself, and only
// by rewriting the day do we converge on the truth. Writes are upserts keyed on (keyword, day), so
// re-running is free of side effects.
//
// This one is READ-ONLY against Amazon. It changes no bid, pauses no keyword and spends nothing,
// so unlike the engines it needs no preview flag.
// Auth: Bearer CRON_SECRET (Vercel injects it).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") ?? 40);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const result = await runHistoryArchive({ days: Number.isFinite(days) ? days : 40, dryRun });
  return NextResponse.json(result);
}
