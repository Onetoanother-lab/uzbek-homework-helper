// src/routes/api/internal/reminders.ts
// Cron endpoint for deadline reminders.
// Call every 30 minutes:
//   curl -X POST https://yourapp.com/api/internal/reminders \
//        -H "Authorization: Bearer $INTERNAL_CRON_SECRET"

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/internal/reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.INTERNAL_CRON_SECRET;
        if (!secret) {
          return new Response("INTERNAL_CRON_SECRET not configured", { status: 500 });
        }
        const authHeader = request.headers.get("authorization") ?? "";
        if (authHeader !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { sendDeadlineReminders } = await import(
            "@/lib/telegram/flows/reminders.server"
          );
          await sendDeadlineReminders();
          return Response.json({ ok: true });
        } catch (err) {
          const { reportError } = await import(
            "@/lib/telegram/error-reporter.server"
          );
          await reportError({ context: "reminders/cron", error: err });
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },

      GET: async () => Response.json({ ok: true, service: "reminders-trigger" }),
    },
  },
});