// Jihoz.uz — Edge Function'lar uchun umumiy CORS va javob yordamchilari

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  return null;
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

export function unauthorized(message = "autentifikatsiya talab qilinadi"): Response {
  return json({ error: message }, 401);
}

export function forbidden(message = "ruxsat yo'q"): Response {
  return json({ error: message }, 403);
}

export function tooManyRequests(message: string): Response {
  return json({ error: message }, 429);
}

export function serverError(message = "server xatosi"): Response {
  return json({ error: message }, 500);
}
