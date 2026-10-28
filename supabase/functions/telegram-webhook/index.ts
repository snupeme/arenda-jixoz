// Jihoz.uz — Telegram webhook (Supabase Edge Function)
//
// Telegram bu manzilga update yuboradi:
//   POST https://<project-ref>.supabase.co/functions/v1/telegram-webhook
//
// Xavfsizlik:
//   * Telegram'ning "secret_token" sarlavhasi tekshiriladi (boshqa so'rovlar rad etiladi).
//   * Bot tokeni va webhook maxfiy kaliti faqat Edge Function secret'larida (Deno.env).
//   * Frontend kodida hech qanday secret yo'q.
//
// Secret'larni o'rnatish:
//   supabase secrets set TELEGRAM_BOT_TOKEN=<bot token>
//   supabase secrets set TELEGRAM_WEBHOOK_SECRET=<ixtiyoriy uzun maxfiy kalit>
//
// Webhook'ni ulash:
//   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//     -d "url=https://<project-ref>.supabase.co/functions/v1/telegram-webhook" \
//     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"

import { createClient } from "npm:@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
const BOT_USERNAME = (Deno.env.get("TELEGRAM_BOT_USERNAME") ?? "Jihoz_uz_bot").replace(/^@/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

/** Bot orqali xabar yuborish */
async function sendMessage(chatId: number, text: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch (err) {
    console.error("sendMessage xatosi", err);
  }
}

Deno.serve(async (req) => {
  // 1) Telegram'ning maxfiy sarlavhasi — boshqa so'rovlar rad etiladi
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!WEBHOOK_SECRET || !secret || secret !== WEBHOOK_SECRET) {
    return json({ error: "forbidden" }, 403);
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const message = (update["message"] ?? update["edited_message"]) as
    | {
        text?: string;
        chat?: { id?: number };
        from?: { id?: number; username?: string; first_name?: string };
      }
    | undefined;

  if (!message) return json({ ok: true });

  // Replay himoyasi: bir xil update_id ikkinchi marta ishlanmaydi
  const updateId = typeof update["update_id"] === "number" ? (update["update_id"] as number) : null;
  if (updateId !== null && SUPABASE_URL && SERVICE_ROLE_KEY) {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claimed, error: claimError } = await admin.rpc("claim_telegram_update", {
      p_update_id: updateId,
    });
    if (claimError) {
      console.error("claim_telegram_update xatosi:", claimError);
    } else if (claimed !== true) {
      // Bu update allaqachon ko'rilgan — qayta ishlamaymiz
      return json({ ok: true, status: "duplicate" });
    }
  }

  const chatId = message.chat?.id;
  const telegramId = message.from?.id;
  const telegramUsername = message.from?.username
    ? `@${message.from.username}`
    : (message.from?.first_name ?? "");

  if (!chatId) return json({ ok: true });

  // 2) "/start <token>" yoki "/start@Bot <token>"
  const text = (message.text ?? "").trim();
  const [rawCommand = "", ...rest] = text.split(/\s+/);
  // "/start" yoki "/start@Jihoz_uz_bot" -> "start"
  const command = (rawCommand.replace(/^\//, "").split("@")[0] ?? "").toLowerCase();
  const payload = rest.join(" ").trim();

  if (command !== "start") {
    if (command === "help" || command === "") {
      await sendMessage(
        chatId,
        "Jihoz.uz akkauntini tasdiqlash uchun saytning Kabinet > Profil qismida " +
          "'Telegram'ni tasdiqlash' tugmasini bosing va ochilgan havolani oching.\n\n" +
          `Bot: @${BOT_USERNAME}`,
      );
    }
    return json({ ok: true });
  }

  if (!payload) {
    await sendMessage(
      chatId,
      "Token topilmadi. Saytda 'Telegram'ni tasdiqlash' tugmasini bosib, " +
        "ochilgan havolani bosing.",
    );
    return json({ ok: true });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Supabase secret'lari sozlanmagan");
    await sendMessage(chatId, "Xatolik: server sozlanmagan. Administratorga murojaat qiling.");
    return json({ error: "server_not_configured" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 3) Tokenni bazadan topamiz, muddatini tekshiramiz va bir marta ishlatamiz
  const { data, error } = await supabase.rpc("consume_telegram_token", {
    p_token: payload,
  });

  if (error) {
    console.error("consume_telegram_token xatosi", error);
    await sendMessage(chatId, "Xatolik yuz berdi. Birozdan keyin qayta urinib ko'ring.");
    return json({ error: "consume_failed" }, 500);
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { user_id: string | null; status: string }
    | undefined;

  const status = row?.status ?? "not_found";
  const userId = row?.user_id ?? null;

  if (status === "expired") {
    await sendMessage(
      chatId,
      "Token muddati o'tgan (10 daqiqa). Saytda qayta 'Telegram'ni tasdiqlash' " +
        "tugmasini bosib, yangi havolani oching.",
    );
    return json({ ok: true, status });
  }

  if (status === "used") {
    await sendMessage(
      chatId,
      "Bu token allaqachon ishlatilgan. Yangi token olish uchun saytda " +
        "'Telegram'ni tasdiqlash' tugmasini yana bosing.",
    );
    return json({ ok: true, status });
  }

  if (status !== "ok" || !userId) {
    await sendMessage(
      chatId,
      "Token topilmadi yoki muddati o'tgan. Saytda 'Telegram'ni tasdiqlash' " +
        "tugmasini bosib, yangi havolani oching.",
    );
    return json({ ok: true, status });
  }

  // 4) Bitta Telegram ID faqat bitta akkauntga bog'lanishi mumkin
  if (telegramId) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_id", telegramId)
      .neq("id", userId)
      .maybeSingle();

    if (existing) {
      await sendMessage(
        chatId,
        "Bu Telegram akkaunti allaqachon boshqa Jihoz.uz akkauntiga bog'langan.",
      );
      return json({ ok: true, status: "already_linked" });
    }
  }

  // 5) Profilga yozamiz
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      telegram_id: telegramId ?? null,
      telegram_username: telegramUsername || null,
      telegram_verified: true,
    })
    .eq("id", userId);

  if (updateError) {
    console.error("profile update xatosi", updateError);
    // Unique constraint: boshqa akkauntga bog'langan bo'lishi mumkin
    await sendMessage(
      chatId,
      "Bu Telegram akkaunti allaqachon boshqa Jihoz.uz akkauntiga bog'langan.",
    );
    return json({ ok: true, status: "already_linked" });
  }

  await sendMessage(
    chatId,
    "Akkaunt tasdiqlandi! Endi Jihoz.uz saytida profilizda 'Tasdiqlangan' " +
      "belgisi ko'rinadi.",
  );

  return json({ ok: true, status: "verified" });
});
