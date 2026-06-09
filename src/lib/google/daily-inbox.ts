// Daily inbox ops: archive the repeated noise, label kept mail, and surface a
// "needs a human" digest (Flippa buyers, Amazon replies, customer issues).
import { gmailConfigured, listInbox, getMetas, batchModify, ensureLabel, type MsgMeta } from "./gmail";

// Keep anything actionable or from a real person; archive Gmail's bulk buckets.
const KEEP_SUBJECT = /(action required|verif|suspend|deactivat|appeal|reinstat|rejected|approv|pending|invoice|tax\b|chargeback|a-to-z|\bclaim\b|dispute|account health|policy warning|password|security alert|cord failure|return request|refund request)/i;
const KEEP_SENDER = /(amzn-clicks\.atlassian\.net|advertising-api-support|seller-?performance|payments-messages|@phoneassured\.com|dev-reg-vetting@amazon\.com|@fbareviews\.com|@marketplace\.amazon\.com|cindyrlaff@gmail\.com)/i;
const ARCHIVE_SENDER = /(alibaba\.com|@email\.alibaba|aliexpress)/i;
const FLIPPA_HUMAN = (from: string) => /@flippa\.com/i.test(from) && !/(marketing|dealdesk|support|no-?reply|notifications?)@/i.test(from);
const emailOf = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();

function verdict(m: MsgMeta): "keep" | "archive" {
  if (KEEP_SENDER.test(m.from) || FLIPPA_HUMAN(m.from) || KEEP_SUBJECT.test(m.subject)) return "keep";
  if (ARCHIVE_SENDER.test(m.from)) return "archive";
  const L = new Set(m.labels);
  if (L.has("CATEGORY_PROMOTIONS") || L.has("CATEGORY_SOCIAL") || L.has("CATEGORY_FORUMS") || L.has("CATEGORY_UPDATES")) return "archive";
  return "keep";
}

// Why a kept, unread message needs attention (null = no flag).
function attentionReason(m: MsgMeta): string | null {
  const t = `${m.from} ${m.subject}`.toLowerCase();
  if (FLIPPA_HUMAN(m.from)) return "Flippa buyer/broker";
  if (/cord failure|not working|broke|return|refund|complaint|defective|disappoint/.test(t)) return "Customer issue";
  if (/amzn-clicks|advertising-api|dev-reg-vetting|seller-?performance|account health|action required|suspend|appeal/.test(t)) return "Amazon — needs reply";
  if (/@marketplace\.amazon\.com/.test(m.from)) return "Customer message";
  return null;
}

export interface InboxOpsResult {
  ok: boolean;
  scanned?: number;
  archived?: number;
  attention?: { from: string; subject: string; why: string }[];
  reason?: string;
  error?: string;
}

export async function runDailyInbox(): Promise<InboxOpsResult> {
  if (!gmailConfigured()) return { ok: false, reason: "GMAIL_* env not configured" };
  try {
    const ids = await listInbox();
    const metas = await getMetas(ids);

    const toArchive = metas.filter((m) => verdict(m) === "archive").map((m) => m.id);
    if (toArchive.length) await batchModify(toArchive, [], ["INBOX"]);

    // Label Cynthia's shipment mail (kept in inbox).
    const shipId = await ensureLabel("Shipments");
    const cynthia = metas.filter((m) => emailOf(m.from) === "cindyrlaff@gmail.com").map((m) => m.id);
    if (cynthia.length) await batchModify(cynthia, [shipId], []);

    // Needs-attention digest from kept + unread.
    const attention = metas
      .filter((m) => verdict(m) === "keep" && m.labels.includes("UNREAD"))
      .map((m) => ({ m, why: attentionReason(m) }))
      .filter((x) => x.why)
      .map((x) => ({ from: x.m.from, subject: x.m.subject, why: x.why! }));

    return { ok: true, scanned: metas.length, archived: toArchive.length, attention };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Plain-text digest body (William prefers plain text). Empty string = nothing to send. */
export function buildDigestText(r: InboxOpsResult): string {
  if (!r.ok || !r.attention || r.attention.length === 0) return "";
  const lines = [
    `Phone Assured inbox: ${r.attention.length} message(s) need your attention.`,
    `(Auto-archived ${r.archived} of ${r.scanned} as noise.)`,
    "",
  ];
  for (const a of r.attention) lines.push(`[${a.why}] ${a.from}\n   ${a.subject}`, "");
  lines.push("Reply from hello@phoneassured.com in Gmail.");
  return lines.join("\n");
}
