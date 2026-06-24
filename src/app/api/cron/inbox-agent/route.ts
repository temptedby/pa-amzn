import { NextResponse } from "next/server";
import { runInboxAgent, buildInboxAgentDigest } from "@/lib/google/inbox-agent";
import { sendEmail, alertRecipient } from "@/lib/email";

// Twice-daily (6am + 4pm Central = 11:00 + 21:00 UTC, see vercel.json) inbox agent:
// trashes marketing/noise, drafts replies (never sends) for support-needed buyer messages,
// emails a digest of drafts waiting. ?dryRun=1 previews. Auth: Bearer CRON_SECRET.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const result = await runInboxAgent({ dryRun });

  if (!dryRun && (result.drafted.length || result.errors.length)) {
    const subject = result.errors.length
      ? "Inbox agent ran with errors"
      : `Inbox agent: ${result.drafted.length} draft reply(ies) waiting`;
    await sendEmail({ to: alertRecipient(), subject: `[PA-AMZN inbox] ${subject}`, text: buildInboxAgentDigest(result) })
      .catch((e) => console.error("[inbox-agent] email failed:", e));
  }

  return NextResponse.json(result);
}
