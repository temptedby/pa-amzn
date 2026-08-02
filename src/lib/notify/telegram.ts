// Telegram Bot API sender for the daily performance digest.
//
// Endpoint: POST https://api.telegram.org/bot<TOKEN>/sendMessage with { chat_id, text, parse_mode }.
// The hard limit is 4096 characters AFTER entity parsing, so a long digest must be split rather
// than truncated (https://core.telegram.org/bots/api#sendmessage; corroborated by the
// long-standing 4096 issue threads in the community clients). We send plain text with no
// parse_mode so keyword text containing _ * [ ] ` can never break the message or be silently
// swallowed as markup — a keyword like "phone_leash" would otherwise corrupt the whole send.
//
// Config: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID. When either is missing the sender reports
// notConfigured rather than throwing, so the digest cron falls back to email and never fails a run.

export const TELEGRAM_MAX_CHARS = 4096;

export interface TelegramResult { ok: boolean; sent: number; notConfigured?: boolean; error?: string }

/**
 * Split text into Telegram-sized chunks on line boundaries so a message is never cut mid-line.
 * A single line longer than the limit is hard-split as a last resort. Pure, so it unit-tests.
 */
export function splitForTelegram(text: string, max = TELEGRAM_MAX_CHARS): string[] {
  if (!text) return [];
  const out: string[] = [];
  let buf = "";
  for (const line of text.split("\n")) {
    if (line.length > max) {
      if (buf) { out.push(buf); buf = ""; }
      for (let i = 0; i < line.length; i += max) out.push(line.slice(i, i + max));
      continue;
    }
    const candidate = buf ? `${buf}\n${line}` : line;
    if (candidate.length > max) { out.push(buf); buf = line; }
    else buf = candidate;
  }
  if (buf) out.push(buf);
  return out;
}

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/** Send a plain-text message, split across as many Telegram messages as it needs. */
export async function sendTelegram(text: string): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, sent: 0, notConfigured: true, error: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set" };
  const chunks = splitForTelegram(text);
  let sent = 0;
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, sent, error: `telegram ${res.status}: ${body.slice(0, 200)}` };
    }
    sent++;
  }
  return { ok: true, sent };
}
