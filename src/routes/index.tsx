import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Uy vazifa boti" },
      {
        name: "description",
        content:
          "O'quvchilar uy vazifasini Telegram bot orqali yuboradi. O'qituvchi tekshirgach, ota-onalar guruhi xabar oladi.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="max-w-xl text-center space-y-4">
        <h1 className="text-4xl font-bold">📚 Uy vazifa boti</h1>
        <p className="text-muted-foreground">
          O'quvchilar Telegram botga vazifa yuboradi. AI dastlabki baho beradi,
          o'qituvchi tasdiqlaydi, ota-onalar guruhi xabardor bo'ladi.
        </p>
        <div className="text-sm text-muted-foreground border rounded-lg p-4">
          <p>Bot Telegram'da ishlaydi. Boshlash uchun botga <code>/start</code> yuboring.</p>
        </div>
      </div>
    </main>
  );
}
