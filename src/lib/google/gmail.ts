// In-app Gmail client (hello@phoneassured.com) for the daily cron. Raw OAuth +
// REST, mirrors the standalone scripts. Needs GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN
// (gmail.modify scope) in the environment.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export function gmailConfigured(): boolean {
  return !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
}

let cache: { token: string; exp: number } | null = null;

export async function gmailAccessToken(): Promise<string> {
  if (cache && cache.exp > Date.now() + 60_000) return cache.token;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }).toString(),
  });
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  if (!res.ok) throw new Error(`Gmail token: ${JSON.stringify(j)}`);
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cache.token;
}

async function gmailApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await gmailAccessToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gmail ${path} ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface MsgMeta { id: string; from: string; subject: string; labels: string[]; }

export async function listInbox(maxPages = 10): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const qs = new URLSearchParams({ q: "in:inbox", maxResults: "500" });
    if (pageToken) qs.set("pageToken", pageToken);
    const page = await gmailApi<{ messages?: { id: string }[]; nextPageToken?: string }>(`/messages?${qs}`);
    (page.messages ?? []).forEach((m) => ids.push(m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ++pages < maxPages);
  return ids;
}

const headerOf = (m: { payload?: { headers?: { name: string; value: string }[] } }, n: string) =>
  m.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";

export async function getMetas(ids: string[], concurrency = 15): Promise<MsgMeta[]> {
  const out: MsgMeta[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
      while (i < ids.length) {
        const id = ids[i++];
        try {
          const m = await gmailApi<{ labelIds?: string[]; payload?: { headers?: { name: string; value: string }[] } }>(
            `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
          );
          out.push({ id, from: headerOf(m, "from"), subject: headerOf(m, "subject"), labels: m.labelIds ?? [] });
        } catch { /* skip */ }
      }
    }),
  );
  return out;
}

export async function batchModify(ids: string[], addLabelIds: string[], removeLabelIds: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 900) {
    await gmailApi("/messages/batchModify", {
      method: "POST",
      body: JSON.stringify({ ids: ids.slice(i, i + 900), addLabelIds, removeLabelIds }),
    });
  }
}

/** Move a message to Trash (reversible 30 days). Use only on classified noise. */
export async function trashMessage(id: string): Promise<void> {
  await gmailApi(`/messages/${id}/trash`, { method: "POST" });
}

export interface ReplyCtx { threadId: string; messageId: string; from: string; subject: string; }

/** Fetch the headers needed to thread a reply draft to a message. */
export async function getReplyContext(id: string): Promise<ReplyCtx> {
  const m = await gmailApi<{ threadId: string; payload?: { headers?: { name: string; value: string }[] } }>(
    `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID`,
  );
  return { threadId: m.threadId, messageId: headerOf(m, "message-id"), from: headerOf(m, "from"), subject: headerOf(m, "subject") };
}

/** Create a DRAFT reply in the message's thread (never sends — William reviews + sends). */
export async function createReplyDraft(ctx: ReplyCtx, bodyText: string, fromAddr = "Phone Assured <hello@phoneassured.com>"): Promise<string> {
  const subject = /^re:/i.test(ctx.subject) ? ctx.subject : `Re: ${ctx.subject}`;
  const raw = [
    `From: ${fromAddr}`, `To: ${ctx.from}`, `Subject: ${subject}`,
    `In-Reply-To: ${ctx.messageId}`, `References: ${ctx.messageId}`,
    "Content-Type: text/plain; charset=UTF-8", "", bodyText,
  ].join("\r\n");
  const b64 = Buffer.from(raw, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const d = await gmailApi<{ id: string }>("/drafts", { method: "POST", body: JSON.stringify({ message: { threadId: ctx.threadId, raw: b64 } }) });
  return d.id;
}

export async function ensureLabel(name: string): Promise<string> {
  const { labels = [] } = await gmailApi<{ labels?: { id: string; name: string }[] }>("/labels");
  const found = labels.find((l) => l.name === name);
  if (found) return found.id;
  const created = await gmailApi<{ id: string }>("/labels", {
    method: "POST",
    body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
  return created.id;
}
