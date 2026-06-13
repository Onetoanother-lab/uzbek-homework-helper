import { createFileRoute } from "@tanstack/react-router";
import { deriveTelegramWebhookSecret, safeEqual } from "@/lib/telegram/secret.server";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
        if (!TELEGRAM_API_KEY) {
          return new Response("Telegram not configured", { status: 500 });
        }
        const expected = deriveTelegramWebhookSecret(TELEGRAM_API_KEY);
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(got, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }
        let update: any;
        try {
          update = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        try {
          const { dispatch } = await import("@/lib/telegram/router.server");
          await dispatch(update);
        } catch (err) {
          console.error("[telegram] dispatch error:", err);
          // Still 200 — Telegram retries everything non-2xx.
        }
        return Response.json({ ok: true });
      },
      GET: async () => Response.json({ ok: true, service: "telegram-webhook" }),
    },
  },
});
