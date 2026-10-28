import { getSupabase } from "./supabase";

/* ─────────────────────────── Tiplar ─────────────────────────── */

export type AdminStats = {
  users: number;
  admins: number;
  listings: number;
  pending_listings: number;
  orders: number;
  pending_orders: number;
  conversations: number;
  messages: number;
  reports: number;
  blocked_users: number;
};

export type AdminUser = {
  id: string;
  name: string;
  phone: string;
  telegram_username: string | null;
  telegram_verified: boolean;
  is_blocked: boolean;
  role: "admin" | "user";
  listings_count: number;
  orders_count: number;
  created_at: string;
};

export type AdminReport = {
  report_id: number;
  reason: "spam" | "fraud" | "abuse" | "other";
  created_at: string;
  message_id: string;
  message_body: string;
  message_type: string;
  message_created_at: string;
  sender_id: string;
  conversation_id: string;
  reporter_id: string;
};

export type AdminAuditEntry = {
  id: number;
  action: string;
  actor_email: string | null;
  target_table: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

/* ─────────────────────────── Yordamchilar ─────────────────────────── */

export function adminErrorText(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const msg = String((err as { message?: unknown }).message ?? "");
    const clean = msg.replace(/^.*?:\s*/, "").trim();
    if (clean) return clean;
  }
  if (typeof err === "string" && err.trim()) return err.trim();
  return "Amalni bajarishda xatolik yuz berdi.";
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase sozlanmagan.");
  const { data, error } = await supabase.rpc(name, args ?? {});
  if (error) throw error;
  return data as T;
}

/* ─────────────────────────── So'rovlar ─────────────────────────── */

export async function isAdmin(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
}

export function fetchAdminStats(): Promise<AdminStats> {
  return rpc<AdminStats>("admin_stats");
}

export async function fetchAdminUsers(limit = 100): Promise<AdminUser[]> {
  const rows = await rpc<AdminUser[]>("admin_list_users", { p_limit: limit });
  return Array.isArray(rows) ? rows : [];
}

export async function fetchAdminReports(limit = 50): Promise<AdminReport[]> {
  const rows = await rpc<AdminReport[]>("admin_list_reports", { p_limit: limit });
  return Array.isArray(rows) ? rows : [];
}

export async function fetchAdminAudit(limit = 100): Promise<AdminAuditEntry[]> {
  const rows = await rpc<AdminAuditEntry[]>("admin_list_audit", { p_limit: limit });
  return Array.isArray(rows) ? rows : [];
}

export async function setUserRole(userId: string, role: "admin" | "user"): Promise<void> {
  await rpc("admin_set_user_role", { p_user_id: userId, p_role: role });
}

export async function setUserBlocked(userId: string, blocked: boolean): Promise<void> {
  await rpc("admin_set_user_blocked", { p_user_id: userId, p_blocked: blocked });
}
