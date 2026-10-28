// Jihoz.uz — Edge Function: e'lon yaratish
//
// POST https://<project-ref>.supabase.co/functions/v1/listings-create
// Header: Authorization: Bearer <access_token>
//
// Xavfsizlik:
//   * autentifikatsiya + bloklangan akkaunt tekshiruvi
//   * soatiga 5 ta e'lon chegarasi
//   * narx, miqdor, telefon, telegram, rasm havolasi tekshiriladi
//   * majburiy maydonlar server tomonida tekshiriladi

import { requireUser } from "../_shared/auth.ts";
import { badRequest, forbidden, json, preflight, serverError, tooManyRequests } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  optionalString,
  optionalUrl,
  requireBoolean,
  requireInt,
  requirePhone,
  requireString,
  requireTelegram,
  str,
} from "../_shared/validate.ts";

const LIMIT = { bucket: "listing_create", limit: 5, windowSeconds: 3600 };

const CATEGORIES = [
  "toy",
  "qurilish",
  "oshxona",
  "foto",
  "trening",
  "gozallik",
  "bolalar",
];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return badRequest("faqat POST qabul qilinadi");

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { user, supabase } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_blocked, name, phone, telegram_username, telegram_verified")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_blocked) {
    return forbidden("akkauntingiz bloklangan");
  }

  const limit = await checkRateLimit(LIMIT, user.id);
  if (!limit.allowed) {
    return tooManyRequests(
      `Soatiga ${LIMIT.limit} ta e'lon qo'shish mumkin. Birozdan keyin urinib ko'ring.`,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("so'rov tanasi JSON emas");
  }

  const title = requireString(body["title"], "Nomi", { min: 3, max: 120 });
  if (!title.ok) return badRequest(title.error);

  const category = requireString(body["category"], "Kategoriya", { min: 2, max: 40 });
  if (!category.ok) return badRequest(category.error);
  if (!CATEGORIES.includes(category.value)) {
    return badRequest("kategoriya noto'g'ri");
  }

  const price = requireInt(body["price_per_day"], "Kunlik narx", { min: 1000, max: 100_000_000 });
  if (!price.ok) return badRequest(price.error);

  const deposit = requireInt(body["deposit"] ?? 0, "Zalog", { min: 0, max: 100_000_000 });
  if (!deposit.ok) return badRequest(deposit.error);

  const quantity = requireInt(body["quantity"] ?? 1, "Miqdor", { min: 1, max: 10_000 });
  if (!quantity.ok) return badRequest(quantity.error);

  const city = requireString(body["city"], "Shahar", { min: 2, max: 60 });
  if (!city.ok) return badRequest(city.error);

  const description = optionalString(body["description"], "Tavsif", { max: 2000 });
  if (!description.ok) return badRequest(description.error);

  const image = optionalUrl(body["image"], "Rasm", { max: 500 });
  if (!image.ok) return badRequest(image.error);

  const showPhone = requireBoolean(body["show_phone"] ?? true, "show_phone");
  if (!showPhone.ok) return badRequest(showPhone.error);

  const showTelegram = requireBoolean(body["show_telegram"] ?? false, "show_telegram");
  if (!showTelegram.ok) return badRequest(showTelegram.error);

  let telegramUsername = "";
  if (showTelegram.value) {
    const tg = requireTelegram(body["telegram_username"] ?? "");
    if (!tg.ok) return badRequest(tg.error);
    telegramUsername = tg.value;
  }

  let phone = "";
  if (showPhone.value) {
    const ph = requirePhone(body["phone"] ?? profile?.phone ?? "");
    if (!ph.ok) return badRequest(ph.error);
    phone = ph.value;
  }

  const delivery = body["delivery"] === true;

  const { data: listing, error: insertError } = await supabase
    .from("listings")
    .insert({
      user_id: user.id,
      title: title.value,
      category: category.value,
      price_per_day: price.value,
      deposit: deposit.value,
      quantity: quantity.value,
      city: city.value,
      delivery,
      description: description.value,
      image: image.value || "https://placehold.co/600x400?text=Jihoz",
      show_phone: showPhone.value,
      show_telegram: showTelegram.value,
      telegram_username: telegramUsername || null,
      is_active: true,
      is_approved: true,
    })
    .select("id, title, price_per_day, deposit, quantity, city")
    .single();

  if (insertError) {
    console.error("listing insert xatosi:", insertError);
    return serverError("e'lonni saqlab bo'lmadi");
  }

  return json({ ok: true, listing }, 201);
});
