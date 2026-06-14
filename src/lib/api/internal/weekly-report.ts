// src/routes/api/internal/weekly-report.ts
// Cron endpoint for weekly parent reports.
// Call every Monday 08:00:
//   curl -X POST https://yourapp.com/api/internal/weekly-report \
//        -H "Authorization: Bearer $INTERNAL_CRON_SECRET"

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/internal/weekly-report")({
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
          const { sendWeeklyReports } = await import(
            "@/lib/telegram/flows/admin.server"
          );
          await sendWeeklyReports();
          return Response.json({ ok: true });
        } catch (err) {
          const { reportError } = await import(
            "@/lib/telegram/error-reporter.server"
          );
          await reportError({ context: "weekly-report/cron", error: err });
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },

      GET: async () =>
        Response.json({ ok: true, service: "weekly-report-trigger" }),
    },
  },
});