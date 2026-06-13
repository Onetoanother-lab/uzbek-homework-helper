// AI draft review for a homework submission using the Lovable AI Gateway.
// Returns a tentative grade (one of GRADES) plus short Uzbek feedback.

import { GRADES, type Grade } from "@/lib/i18n/uz";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

export interface DraftReview {
  grade: Grade | null;
  feedback: string | null;
}

const SYSTEM_PROMPT = `Siz uy vazifasini tekshiruvchi yordamchisiz. Foydalanuvchi sizga vazifani rasm yoki hujjat ko'rinishida yuboradi.
Vazifani diqqat bilan ko'rib chiqing va quyidagi JSON formatda javob bering:
{"grade": "A'lo" | "Yaxshi" | "Qoniqarli" | "Qayta ishlash", "feedback": "qisqa o'zbek tilida 1-3 jumla: nimasi yaxshi, nimasini yaxshilash kerak"}
Faqat JSON qaytaring, boshqa hech narsa yo'q.`;

export async function draftReview(opts: {
  bytes: Uint8Array;
  mime: string;
  caption?: string;
}): Promise<DraftReview> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { grade: null, feedback: null };

  // Only photos and PDFs are supported reliably.
  const isImage = opts.mime.startsWith("image/");
  const isPdf = opts.mime === "application/pdf";
  if (!isImage && !isPdf) return { grade: null, feedback: null };

  const base64 = bytesToBase64(opts.bytes);
  const contentBlock = isImage
    ? { type: "image_url", image_url: { url: `data:${opts.mime};base64,${base64}` } }
    : {
        type: "file",
        file: {
          filename: "homework.pdf",
          file_data: `data:application/pdf;base64,${base64}`,
        },
      };

  try {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Lovable-API-Key": key,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "raw-fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: opts.caption
                  ? `O'quvchi izohi: ${opts.caption}`
                  : "Vazifani tekshiring.",
              },
              contentBlock,
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error("[ai] gateway non-OK:", res.status, await res.text().catch(() => ""));
      return { grade: null, feedback: null };
    }
    const data: any = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(text);
    if (!parsed) return { grade: null, feedback: null };

    const grade =
      typeof parsed.grade === "string" && (GRADES as readonly string[]).includes(parsed.grade)
        ? (parsed.grade as Grade)
        : null;
    const feedback =
      typeof parsed.feedback === "string" && parsed.feedback.trim().length > 0
        ? parsed.feedback.trim()
        : null;

    return { grade, feedback };
  } catch (err) {
    console.error("[ai] draftReview failed:", err);
    return { grade: null, feedback: null };
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  // Worker-safe base64 encoding without exceeding call-stack on big buffers.
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function extractJson(text: string): { grade?: string; feedback?: string } | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) return null;
  try {
    return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}
