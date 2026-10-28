// Jihoz.uz — Edge Function: buyurtma yaratish
//
// POST https://<project-ref>.supabase.co/functions/v1/orders-create
// Header: Authorization: Bearer <access_token>
//
// Xavfsizlik:
//   * autentifikatsiya + bloklangan akkaunt tekshiruvi
//   * soatiga 10 ta buyurtma chegarasi
//   * barcha maydonlar server tomonida tekshiriladi
//   * kunlar band bo'lmaganligi tekshiriladi

import { requireUser } from "../_shared/auth.ts";
import { badRequest, forbidden, json, preflight, serverError, tooManyRequests } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { requireDate, requireInt, requirePhone, requireString, requireUuid, str } from "../_shared/validate.ts";

const LIMIT = { bucket: "order_create", limit: 10, windowSeconds: 3600 };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return badRequest("faqat POST qabul qilinadi");

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { user, supabase } = auth;

  // Bloklangan akkaunt
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_blocked, name, phone")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_blocked) {
    return forbidden("akkauntingiz bloklangan");
  }

  // Rate limit
  const limit = await checkRateLimit(LIMIT, user.id);
  if (!limit.allowed) {
    return tooManyRequests(
      `Soatiga ${LIMIT.limit} ta buyurtma yaratish mumkin. Birozdan keyin urinib ko'ring.`,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("so'rov tanasi JSON emas");
  }

  const listingId = requireUuid(body["listing_id"], "listing_id");
  if (!listingId.ok) return badRequest(listingId.error);

  const from = requireDate(body["from_date"], "from_date");
  if (!from.ok) return badRequest(from.error);

  const to = requireDate(body["to_date"], "to_date");
  if (!to.ok) return badRequest(to.error);

  if (to.value < from.value) {
    return badRequest("tugash sanasi boshlanish sanasidan oldin bo'lmaydi");
  }

  const qty = requireInt(body["qty"] ?? 1, "qty", { min: 1, max: 1000 });
  if (!qty.ok) return badRequest(qty.error);

  const name = requireString(body["name"], "Ism", { min: 2, max: 120 });
  if (!name.ok) return badRequest(name.error);

  const phone = requirePhone(body["phone"]);
  if (!phone.ok) return badRequest(phone.error);

  const delivery = body["delivery"] === true;

  // E'lon tekshiruvi
  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, user_id, price_per_day, deposit, quantity, is_active, is_approved")
    .eq("id", listingId.value)
    .maybeSingle();

  if (listingError) return serverError("e'lonni olishda xatolik");
  if (!listing) return badRequest("jihoz topilmadi");
  if (!listing.is_active || !listing.is_approved) {
    return badRequest("bu jihoz hozir mavjud emas");
  }
  if (listing.user_id === user.id) {
    return badRequest("o'z e'loningizga buyurtma berishingiz mumkin emas");
  }

  const days =
    Math.round(
      (new Date(`${to.value}T00:00:00Z`).getTime() -
        new Date(`${from.value}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;

  // Bandlik tekshiruvi (o'zi band qilingan kunlar)
  const { data: overlapping } = await supabase
    .from("orders")
    .select("from_date, to_date, qty")
    .eq("listing_id", listingId.value)
    .in("status", ["pending", "confirmed"])
    .lte("from_date", to.value)
    .gte("to_date", from.value);

  const booked = new Map<string, number>();
  for (const o of overlapping ?? []) {
    const start = new Date(`${o.from_date}T00:00:00Z`).getTime();
    const end = new Date(`${o.to_date}T00:00:00Z`).getTime();
    for (let t = start; t <= end; t += 86_400_000) {
      const key = new Date(t).toISOString().slice(0, 10);
      booked.set(key, (booked.get(key) ?? 0) + (o.qty ?? 1));
    }
  }
  for (let t = new Date(`${from.value}T00:00:00Z`).getTime(); t <= new Date(`${to.value}T00:00:00Z`).getTime(); t += 86_400_000) {
    const key = new Date(t).toISOString().slice(0, 10);
    if ((booked.get(key) ?? 0) + qty.value > listing.quantity) {
      return badRequest("tanlangan kunlarda jihoz yetarli emas");
    }
  }

  const total = listing.price_per_day * days * qty.value;

  const { data: order, error: insertError } = await supabase
    .from("orders")
    .insert({
      listing_id: listingId.value,
      user_id: user.id,
      from_date: from.value,
      to_date: to.value,
      days,
      qty: qty.value,
      delivery,
      name: name.value,
      phone: phone.value,
      total,
      deposit: listing.deposit,
      status: "pending",
    })
    .select("id, listing_id, from_date, to_date, days, qty, total, deposit, status")
    .single();

  if (insertError) {
    console.error("order insert xatosi:", insertError);
    return serverError("buyurtmani saqlab bo'lmadi");
  }

  return json({ ok: true, order }, 201);
});
