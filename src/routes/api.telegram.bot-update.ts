import { createFileRoute } from "@tanstack/react-router";
import { handleTelegramUpdate } from "@/lib/server/telegram-bot";

/**
 * Telegram webhook qabulchi (sayt ochiq internetda joylashganda).
 *
 * Telegram'ning "secret_token" sarlavhasi tekshiriladi — boshqa so'rovlar rad etiladi.
 * Telegram'da:
 *   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d "url=https://<sayt-domainingiz>/api/telegram/bot-update" \
 *     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
 *
 * Eslatma: agar webhook o'rnatilgan bo'lsa, serverdagi long polling o'chadi
 * (Telegram ikkalasiga ham ruxsat bermaydi).
 */

type Env = Record<string, string | undefined>;

function env(): Env {
  const p = (globalThis as { process?: { env?: Env } }).process?.env;
  return p ?? {};
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/telegram/bot-update")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const e = env();
        const botToken = (e["TELEGRAM_BOT_TOKEN"] ?? "").trim();
        const webhookSecret = (e["TELEGRAM_WEBHOOK_SECRET"] ?? "").trim();
        const botUsername = (e["TELEGRAM_BOT_USERNAME"] ?? "Jihoz_uz_bot").replace(/^@/, "");

        if (!botToken) return json({ error: "bot_not_configured" }, 503);

        // Telegram'ning maxfiy sarlavhasi — boshqa so'rovlar rad etiladi
        const secret = request.headers.get("x-telegram-bot-api-secret-token");
        if (!webhookSecret || !secret || secret !== webhookSecret) {
          return json({ error: "forbidden" }, 403);
        }

        let update: Record<string, unknown>;
        try {
          update = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        await handleTelegramUpdate(botToken, botUsername, update as never);
        return json({ ok: true });
      },
    },
  },
});
