// Jihoz.uz — Edge Function: yangi chat xabari uchun Telegram bildirishnoma
//
// ⚠️  HOLATI: TAYYOR, LEKIN O'CHIRILGAN (yoqilmagan).
//     Bu funksiya faqat Supabase "Database Webhook" orqali chaqiriladi.
//     Yoqish uchun quyidagilarni bajarish kerak (docs/security.md §11):
//
//   1) Secret o'rnatish:
//        supabase secrets set TELEGRAM_BOT_TOKEN=<bot token>
//        supabase secrets set TELEGRAM_NOTIFY_SECRET=<uzun maxfiy kalit>
//
//   2) Supabase Dashboard → Database → Webhooks → "Create webhook":
//        * Table:      public.messages
//        * Events:     INSERT
//        * Type:       Supabase Database Webhook
//        * URL:        https://<project-ref>.supabase.co/functions/v1/telegram-notify
//        * HTTP Header: x-notify-secret = <TELEGRAM_NOTIFY_SECRET>
//
//   3) SQL orqali trigger (agar Database Webhook o'rniga trigger ishlatish kerak bo'lsa):
//        create trigger on_message_insert_notify
//        after insert on public.messages
//        for each row execute function public.notify_telegram_on_message();
//
// Xavfsizlik:
//   * maxfiy kalit sarlavhasi tekshiriladi (boshqa hech kim chaqira olmaydi)
//   * rate limit: bir foydalanuvchiga soatiga 20 ta bildirishnoma
//   * Telegram API ga faqat serverdan (service_role)

import { createClient } from "npm:@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const NOTIFY_SECRET = Deno.env.get("TELEGRAM_NOTIFY_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const RATE_LIMIT = { bucket: "telegram_notify", limit: 20, windowSeconds: 3600 };

type WebhookPayload = {
  type?: string;
  table?: string;
  record?: {
    id?: string;
    conversation_id?: string;
    sender_id?: string;
    body?: string;
    type?: string;
    created_at?: string;
  };
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Bot orqali xabar yuborish */
async function sendMessage(chatId: number, text: string): Promise<boolean> {
  if (!BOT_TOKEN) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      console.error("sendMessage HTTP xatosi:", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("sendMessage xatosi:", err);
    return false;
  }
}

Deno.serve(async (req) => {
  // 1) Maxfiy kalit tekshiruvi
  const secret = req.headers.get("x-notify-secret") ?? "";
  if (!NOTIFY_SECRET || secret !== NOTIFY_SECRET) {
    return json({ error: "forbidden" }, 403);
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const record = payload.record;
  if (!record?.conversation_id || !record?.sender_id) {
    return json({ ok: true, status: "ignored" });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Supabase secret'lari sozlanmagan");
    return json({ error: "server_not_configured" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 2) Suhbatni olish
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, listing_id, owner_id, renter_id")
    .eq("id", record.conversation_id)
    .maybeSingle();

  if (convError) {
    console.error("conversation xatosi:", convError);
    return json({ error: "conversation_failed" }, 500);
  }
  if (!conversation) return json({ ok: true, status: "no_conversation" });

  // 3) Qabul qiluvchi — yuboruvchining o'zidan boshqa tomon
  const recipientId =
    conversation.owner_id === record.sender_id ? conversation.renter_id : conversation.owner_id;

  // 4) Telegram ma'lumotlari (faqat tasdiqlangan foydalanuvchilar)
  const { data: profile } = await supabase
    .from("profiles")
    .select("telegram_id, telegram_username, telegram_verified, is_blocked")
    .eq("id", recipientId)
    .maybeSingle();

  if (!profile?.telegram_verified || !profile.telegram_id || profile.is_blocked) {
    return json({ ok: true, status: "recipient_not_on_telegram" });
  }

  // 5) Yuboruvchini aniqlash (ismi uchun)
  const { data: sender } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", record.sender_id)
    .maybeSingle();

  // 6) E'lon nomi
  const { data: listing } = await supabase
    .from("listings")
    .select("title")
    .eq("id", conversation.listing_id)
    .maybeSingle();

  // 7) Rate limit (qabul qiluvchi bo'yicha)
  const { data: limitRow, error: limitError } = await supabase.rpc("check_rate_limit", {
    p_bucket: RATE_LIMIT.bucket,
    p_subject: recipientId,
    p_limit: RATE_LIMIT.limit,
    p_window_seconds: RATE_LIMIT.windowSeconds,
  });

  if (limitError) {
    console.error("check_rate_limit xatosi:", limitError);
    return json({ error: "rate_limit_failed" }, 500);
  }

  const limit = (Array.isArray(limitRow) ? limitRow[0] : limitRow) as
    | { allowed?: boolean }
    | null;

  if (limit?.allowed !== true) {
    return json({ ok: true, status: "rate_limited" });
  }

  // 8) Xabar matni
  const senderName = sender?.name?.trim() || "Foydalanuvchi";
  const isBooking = record.type === "booking_request";
  const body = (record.body ?? "").trim();
  const preview = body.length > 200 ? `${body.slice(0, 200)}…` : body;

  const text = isBooking
    ? `📅 ${senderName} band qilish so'rovi yubordi` +
      (listing?.title ? `\nJihoz: ${listing.title}` : "") +
      (preview ? `\n${preview}` : "") +
      `\n\nJihoz.uz → Kabinet → Xabarlar`
    : `💬 ${senderName} yangi xabar yubordi` +
      (listing?.title ? `\nJihoz: ${listing.title}` : "") +
      (preview ? `\n${preview}` : "") +
      `\n\nJihoz.uz → Kabinet → Xabarlar`;

  const sent = await sendMessage(profile.telegram_id, text);

  return json({ ok: true, status: sent ? "sent" : "send_failed" });
});
