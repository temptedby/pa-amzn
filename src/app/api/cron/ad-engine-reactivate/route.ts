import { NextResponse } from "next/server";
import { runMonthlyReactivation, summarizeReactivation } from "@/lib/amazon/ad-engine";
import { sendEmail, alertRecipient } from "@/lib/email";

// Monthly keyword REACTIVATION job (ad-engine-harvest-rule.md step 4, William 2026-06-26).
// Vercel Cron invokes this once a month (see vercel.json). It re-enables any PAUSED keyword
// whose trailing 65 days recovered to the winner bar (>= $4 spend AND ACOS <= 50% / ROAS >= 2x),
// so a keyword the 6h kill-switch paused but that has since converted profitably comes back.
// ?dryRun=1 previews without applying. Auth: Bearer CRON_SECRET (Vercel injects it).
// Emails a summary only when it re-enabled something or hit an error (keeps the inbox quiet).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const result = await runMonthlyReactivation({ dryRun });

  if (!dryRun && (result.reactivated.length || result.errors.length)) {
    const subject = result.errors.length
      ? "Monthly reactivation ran with errors"
      : `Monthly reactivation: ${result.reactivated.length} keywords re-enabled`;
    await sendEmail({ to: alertRecipient(), subject: `[PA-AMZN ads] ${subject}`, text: summarizeReactivation(result) })
      .catch((e) => console.error("[ad-engine-reactivate] email failed:", e));
  }

  return NextResponse.json(result);
}
