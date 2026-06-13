// src/routes/api/internal/weekly-report.ts
// Internal endpoint that triggers weekly report delivery.
// Call this from a cron service (e.g. cron-job.org, GitHub Actions, Cloudflare Cron Triggers)
// every Monday at 08:00 local time.
//
// Security: protected by INTERNAL_CRON_SECRET env var checked via Bearer token.
// Example cron command:
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
          return Response.json({ ok: true, sent: true });
        } catch (err) {
          console.error("[weekly-report] failed:", err);
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },

      // Health-check (no auth required)
      GET: async () =>
        Response.json({ ok: true, service: "weekly-report-trigger" }),
    },
  },
});