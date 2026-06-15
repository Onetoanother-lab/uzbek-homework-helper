// src/routes/api/internal/missing-check.ts
// Cron endpoint: checks for students who missed the 48h homework deadline.
// Call every 30 minutes (same schedule as reminders):
//   curl -X POST https://yourapp.com/api/internal/missing-check \
//        -H "Authorization: Bearer $INTERNAL_CRON_SECRET"

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/internal/missing-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.INTERNAL_CRON_SECRET;
        if (!secret) {
          return new Response("INTERNAL_CRON_SECRET not configured", { status: 500 });
        }
        const auth = request.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { checkMissingSubmissions } = await import(
            "@/lib/telegram/flows/pending-missing.server"
          );
          await checkMissingSubmissions();
          return Response.json({ ok: true });
        } catch (err) {
          const { reportError } = await import(
            "@/lib/telegram/error-reporter.server"
          );
          await reportError({ context: "missing-check/cron", error: err });
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },

      GET: async () =>
        Response.json({ ok: true, service: "missing-check-trigger" }),
    },
  },
});