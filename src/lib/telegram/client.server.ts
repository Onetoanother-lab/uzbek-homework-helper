// Thin Telegram Bot API wrapper that goes through the Lovable connector gateway.
// Never expose this to the client.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function authHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const telegramKey = process.env.TELEGRAM_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!telegramKey) throw new Error("TELEGRAM_API_KEY is not configured");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": telegramKey,
    "Content-Type": "application/json",
  };
}

async function call<T = any>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    const desc = data?.description ?? data?.error ?? res.statusText;
    throw new Error(`Telegram ${method} failed [${res.status}]: ${desc}`);
  }
  return data.result as T;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export function sendMessage(opts: {
  chat_id: number | string;
  text: string;
  reply_markup?: InlineKeyboardMarkup;
  reply_to_message_id?: number;
  parse_mode?: "HTML" | "MarkdownV2";
}) {
  return call<{ message_id: number }>("sendMessage", opts);
}

export function sendPhoto(opts: {
  chat_id: number | string;
  photo: string;
  caption?: string;
  reply_markup?: InlineKeyboardMarkup;
}) {
  return call<{ message_id: number }>("sendPhoto", opts);
}

export function sendDocument(opts: {
  chat_id: number | string;
  document: string;
  caption?: string;
  reply_markup?: InlineKeyboardMarkup;
}) {
  return call<{ message_id: number }>("sendDocument", opts);
}

export function editMessageCaption(opts: {
  chat_id: number | string;
  message_id: number;
  caption: string;
  reply_markup?: InlineKeyboardMarkup;
}) {
  return call("editMessageCaption", opts);
}

export function editMessageText(opts: {
  chat_id: number | string;
  message_id: number;
  text: string;
  reply_markup?: InlineKeyboardMarkup;
}) {
  return call("editMessageText", opts);
}

export function answerCallbackQuery(opts: {
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
}) {
  return call("answerCallbackQuery", opts);
}

export function getChatMember(opts: { chat_id: number | string; user_id: number }) {
  return call<{ status: string }>("getChatMember", opts);
}

export async function getFileBytes(
  file_id: string,
): Promise<{ bytes: Uint8Array; mime: string; filePath: string } | null> {
  try {
    const file = await call<{ file_path: string }>("getFile", { file_id });
    if (!file.file_path) return null;
    const lovableKey = process.env.LOVABLE_API_KEY!;
    const telegramKey = process.env.TELEGRAM_API_KEY!;
    const res = await fetch(`${GATEWAY_URL}/file/${file.file_path}`, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
      },
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? guessMime(file.file_path);
    return { bytes: buf, mime, filePath: file.file_path };
  } catch (err) {
    console.error("[telegram] getFileBytes failed:", err);
    return null;
  }
}

function guessMime(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}
