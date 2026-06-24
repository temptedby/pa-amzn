import { listInbox, getMetas, trashMessage, getReplyContext, createReplyDraft, ensureLabel, batchModify, type MsgMeta } from "./gmail";

// Twice-daily inbox agent for hello@phoneassured.com:
//   - TRASH marketing/spam + our own [PA-AMZN] scheduled emails (reversible 30d). PROTECT list
//     hard-guards Amazon account / customer / financial / named-rep / personal mail.
//   - DRAFT a reply (never sends) for support-needed buyer messages; a PA/Drafted label dedups
//     so we don't pile up duplicate drafts across runs.
// Buyer-reply SENDS stay manual (William). william@besocialscene is NOT covered (no token).

const TRASH_FROM = /(alerts@phoneassured\.com|@shop\.tiktok\.com|alibaba\.com|googleads-noreply@google\.com|@shopkeeper\.com|marketing@flippa\.com|mailchimp|sendgrid\.net)/i;
const TRASH_SUBJECT = /^\s*\[PA-AMZN/i;
const PROTECT = /(@marketplace\.amazon\.com|donotreply@amazon|@amazon\.ca|seller-?central|account health|identity|verif|@plaid\.com|dealdesk@flippa|support@flippa|@besocialscene\.com|cindyrlaff|dev-reg-vetting|atlassian|pnc|taxdome|amex|\bbank\b)/i;
const SUPPORT = /@marketplace\.amazon\.com/i; // Amazon buyer-seller messages need a human reply

function draftBody(): string {
  return [
    "Hi,",
    "",
    "Thanks for reaching out about your Phone Assured order — happy to help.",
    "",
    "If anything isn't right with your tether, just reply and we'll make it right. Every Phone Assured is backed by a 1-year warranty and a free replacement clip.",
    "",
    "Thanks,",
    "The Phone Assured Team",
    "",
    "— [DRAFT: review and personalize before sending] —",
  ].join("\n");
}

export interface InboxAgentResult {
  ok: boolean;
  trashed: number;
  drafted: { from: string; subject: string }[];
  kept: number;
  errors: string[];
  durationMs: number;
  reason?: string;
}

export async function runInboxAgent(opts: { dryRun?: boolean } = {}): Promise<InboxAgentResult> {
  const dryRun = opts.dryRun ?? false;
  const start = Date.now();
  const out: InboxAgentResult = { ok: false, trashed: 0, drafted: [], kept: 0, errors: [], durationMs: 0 };
  if (!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_REFRESH_TOKEN)) {
    out.reason = "GMAIL_* not configured"; out.durationMs = Date.now() - start; return out;
  }

  const metas: MsgMeta[] = await getMetas(await listInbox());
  const draftedLabel = dryRun ? "" : await ensureLabel("PA/Drafted");

  for (const m of metas) {
    const hay = `${m.from} ${m.subject}`;
    if (!PROTECT.test(hay) && (TRASH_FROM.test(m.from) || TRASH_SUBJECT.test(m.subject))) {
      if (!dryRun) { try { await trashMessage(m.id); } catch { out.errors.push(`trash ${m.id}`); continue; } }
      out.trashed++;
    } else if (SUPPORT.test(m.from)) {
      const already = draftedLabel && m.labels.includes(draftedLabel);
      if (already) { out.kept++; continue; }
      const name = m.from.replace(/<.*/, "").trim().slice(0, 40);
      if (!dryRun) {
        try {
          const ctx = await getReplyContext(m.id);
          await createReplyDraft(ctx, draftBody());
          await batchModify([m.id], [draftedLabel], []);
        } catch { out.errors.push(`draft ${m.id}`); continue; }
      }
      out.drafted.push({ from: name, subject: m.subject.slice(0, 60) });
    } else {
      out.kept++;
    }
  }
  out.ok = true; out.durationMs = Date.now() - start;
  return out;
}

export function buildInboxAgentDigest(r: InboxAgentResult): string {
  const lines = [
    `Inbox agent: trashed ${r.trashed} (marketing/noise), ${r.drafted.length} draft reply(ies) waiting, ${r.kept} kept. ${r.errors.length} errors.`,
    "",
  ];
  if (r.drafted.length) {
    lines.push("DRAFT REPLIES ready in your Drafts folder (review + send):");
    r.drafted.forEach((d) => lines.push(`  • ${d.from} — ${d.subject}`));
    lines.push("");
  }
  if (r.errors.length) lines.push("errors: " + r.errors.join("; "));
  return lines.join("\n");
}
