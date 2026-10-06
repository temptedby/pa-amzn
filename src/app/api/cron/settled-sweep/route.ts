import { NextResponse } from "next/server";
import { runSettledSweep, summarizeSettledSweep } from "@/lib/amazon/ad-engine";
import { sendEmail, alertRecipient } from "@/lib/email";

// DAILY SETTLED SWEEP. William 2026-10-06: "let go of words that lose money mind the attribution
// of 14 days", then "daily please".
//
// The hourly engine judges month-to-date spend, which includes the open 14-day attribution window,
// so it is a fast brake but an unreliable verdict. This runs once a day over a window that CLOSED
// 14 days ago, where every sale has finished reporting, and applies the same kill rule to it.
// A word that never converted is also tombstoned so the 1st cannot reopen it.
//
// ?dryRun=1 previews without applying. Auth: Bearer CRON_SECRET (Vercel injects it).
// Mails only when it acted or broke, so a quiet day stays quiet.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const result = await runSettledSweep({ dryRun });

  const acted = result.paused.length > 0;
  if (!dryRun && (acted || result.errors.length)) {
    const subject = result.errors.length
      ? "Settled sweep ran with errors"
      : `Settled sweep: ${result.paused.length} switched off, ${result.tombstoned} retired`;
    await sendEmail({ to: alertRecipient(), subject: `[PA-AMZN ads] ${subject}`, text: summarizeSettledSweep(result) })
      .catch((e) => console.error("[settled-sweep] email failed:", e));
  }

  return NextResponse.json(result);
}
