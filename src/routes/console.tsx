import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bot, CheckCircle2, Clock, RefreshCw, Shield, Terminal } from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";

import { getBotConsoleData } from "@/lib/bot-console.functions";

export const Route = createFileRoute("/console")({
  head: () => ({
    meta: [
      { title: "Bot Console | Homework Helper" },
      {
        name: "description",
        content: "Private operational console for bot webhook status, commands, errors, and bindings.",
      },
    ],
  }),
  component: BotConsole,
});

type ConsoleData = Awaited<ReturnType<typeof getBotConsoleData>>;

function BotConsole() {
  const loadConsole = useServerFn(getBotConsoleData);
  const [key, setKey] = useState("");
  const [data, setData] = useState<ConsoleData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh(accessKey = key) {
    setLoading(true);
    setError("");
    try {
      const result = await loadConsole({ data: { key: accessKey } });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load console");
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await refresh(key);
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
          <div className="mb-8 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Shield className="size-5" />
            </span>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal">Bot Console</h1>
              <p className="text-sm text-muted-foreground">Private operations view</p>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm font-medium" htmlFor="console-key">
              Access key
            </label>
            <input
              id="console-key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              type="password"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-ring"
              autoComplete="current-password"
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <button
              type="submit"
              disabled={loading || !key}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <RefreshCw className="size-4 animate-spin" /> : <Terminal className="size-4" />}
              Open console
            </button>
          </form>
        </section>
      </main>
    );
  }

  const webhook = "result" in data.webhook ? data.webhook.result : null;
  const webhookHealthy = Boolean(webhook?.url && !webhook?.last_error_message && webhook?.pending_update_count === 0);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground">
              <Bot className="size-3.5" />
              Updated {formatDate(data.fetchedAt)}
            </div>
            <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">Bot Console</h1>
          </div>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Groups" value={data.stats.groups} />
          <Metric label="Teacher chats" value={data.stats.teacherChats} />
          <Metric label="Students" value={data.stats.students} />
          <Metric label="Submissions" value={data.stats.submissions} />
        </div>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Webhook status" icon={webhookHealthy ? CheckCircle2 : AlertTriangle} tone={webhookHealthy ? "ok" : "bad"}>
            {webhook ? (
              <div className="space-y-3 text-sm">
                <StatusRow label="URL" value={webhook.url || "—"} />
                <StatusRow label="Pending updates" value={String(webhook.pending_update_count ?? 0)} />
                <StatusRow label="Last error" value={webhook.last_error_message ?? "None"} />
                <StatusRow label="Allowed updates" value={(webhook.allowed_updates ?? []).join(", ") || "—"} />
              </div>
            ) : (
              <p className="text-sm text-destructive">{data.webhook.error ?? "Webhook info unavailable"}</p>
            )}
          </Panel>

          <Panel title="Bindings" icon={Bot}>
            <div className="space-y-3 text-sm">
              <StatusRow label="Admins" value={String(data.stats.admins)} />
              <StatusRow label="Teacher chats" value={data.teacherChats.map((chat) => String(chat.chat_id)).join(", ") || "None"} />
              <StatusRow label="Parent groups" value={data.groups.filter((group) => group.parents_chat_id).map((group) => group.name).join(", ") || "None"} />
            </div>
          </Panel>
        </section>

        <section className="mt-6 grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Panel title="Recent errors" icon={AlertTriangle} tone={data.errors.length ? "bad" : "ok"}>
            <LogList empty="No errors recorded." rows={data.errors.map((row) => ({
              id: row.id,
              title: row.context,
              detail: row.message,
              time: row.created_at,
              meta: row.stack ?? undefined,
            }))} />
          </Panel>

          <Panel title="Recent bot events" icon={Clock}>
            <LogList empty="No bot events recorded yet." rows={data.events.map((row) => ({
              id: row.id,
              title: row.command ?? row.event_type,
              detail: `${row.event_type}${row.chat_id ? ` • chat ${row.chat_id}` : ""}`,
              time: row.created_at,
              meta: row.message ?? undefined,
            }))} />
          </Panel>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card p-4 text-card-foreground">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, tone = "neutral", children }: { title: string; icon: typeof Bot; tone?: "neutral" | "ok" | "bad"; children: ReactNode }) {
  const toneClass = tone === "bad" ? "text-destructive" : tone === "ok" ? "text-chart-2" : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border bg-card p-4 text-card-foreground">
      <div className="mb-4 flex items-center gap-2">
        <Icon className={`size-4 ${toneClass}`} />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-border pb-2 last:border-0 last:pb-0 sm:grid-cols-[150px_1fr]">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words font-mono text-xs sm:text-sm">{value}</span>
    </div>
  );
}

function LogList({ rows, empty }: { rows: Array<{ id: number; title: string; detail: string; time: string; meta?: string }>; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
      {rows.map((row) => (
        <article key={row.id} className="rounded-md border border-border bg-background p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <h3 className="font-mono text-sm font-semibold">{row.title}</h3>
            <time className="text-xs text-muted-foreground">{formatDate(row.time)}</time>
          </div>
          <p className="mt-1 break-words text-sm text-muted-foreground">{row.detail}</p>
          {row.meta ? <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs text-muted-foreground">{row.meta}</pre> : null}
        </article>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}