import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Ban, ShieldAlert, ShieldCheck, Loader2, MessageSquareWarning } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  adminErrorText,
  fetchAdminAudit,
  fetchAdminReports,
  fetchAdminStats,
  fetchAdminUsers,
  isAdmin,
  setUserBlocked,
  setUserRole,
  type AdminAuditEntry,
  type AdminReport,
  type AdminStats,
  type AdminUser,
} from "@/lib/admin";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin panel — Jihoz.uz" },
      { name: "description", content: "Jihoz.uz boshqaruv paneli." },
      { property: "og:title", content: "Admin panel — Jihoz.uz" },
      { property: "og:description", content: "Jihoz.uz boshqaruv paneli." },
    ],
  }),
  component: AdminPage,
});

const fmt = (s: string) =>
  new Date(s).toLocaleString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadAll = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [s, u, r, a] = await Promise.all([
        fetchAdminStats(),
        fetchAdminUsers(),
        fetchAdminReports(),
        fetchAdminAudit(),
      ]);
      setStats(s);
      setUsers(u);
      setReports(r);
      setAudit(a);
    } catch (err) {
      setError(adminErrorText(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void isAdmin().then((ok) => {
      if (!alive) return;
      setAllowed(ok);
      if (ok) void loadAll();
    });
    return () => {
      alive = false;
    };
  }, [loadAll]);

  if (allowed === null) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Tekshirilmoqda…</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="mt-4 text-2xl font-bold">Ruxsat yo&apos;q</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bu sahifa faqat administratorlar uchun. Agar admin bo&apos;lishni xohlaysangiz —
          quyidagi SQLni Supabase SQL Editor&apos;da bajarib, keyin sahifani yangilang.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-card p-3 text-left text-xs">
{`insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users
where email = 'sizning@email.com'
on conflict (user_id) do update set role = 'admin';`}
        </pre>
        <Button asChild className="mt-4">
          <Link to="/">Bosh sahifa</Link>
        </Button>
      </div>
    );
  }

  const changeRole = async (u: AdminUser, role: "admin" | "user") => {
    setError("");
    try {
      await setUserRole(u.id, role);
      await loadAll();
    } catch (err) {
      setError(adminErrorText(err));
    }
  };

  const toggleBlock = async (u: AdminUser) => {
    setError("");
    try {
      await setUserBlocked(u.id, !u.is_blocked);
      await loadAll();
    } catch (err) {
      setError(adminErrorText(err));
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Admin panel</h1>
        <Button variant="outline" size="sm" onClick={() => void loadAll()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} Yangilash
        </Button>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Tabs defaultValue="stats">
        <TabsList className="mb-4 grid h-11 w-full grid-cols-4">
          <TabsTrigger value="stats">Statistika</TabsTrigger>
          <TabsTrigger value="users">Foydalanuvchilar ({users.length})</TabsTrigger>
          <TabsTrigger value="reports">
            Shikoyatlar ({reports.length})
          </TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="stats">
          {stats && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label="Foydalanuvchilar" value={stats.users} />
              <Stat label="Adminlar" value={stats.admins} />
              <Stat label="E'lonlar" value={stats.listings} />
              <Stat label="Tasdiqlash kutilmoqda" value={stats.pending_listings} />
              <Stat label="Buyurtmalar" value={stats.orders} />
              <Stat label="Kutilayotgan buyurtma" value={stats.pending_orders} />
              <Stat label="Suhbatlar" value={stats.conversations} />
              <Stat label="Xabarlar" value={stats.messages} />
              <Stat label="Shikoyatlar" value={stats.reports} />
              <Stat label="Bloklangan akkauntlar" value={stats.blocked_users} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="users">
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="p-3">Foydalanuvchi</th>
                  <th className="p-3">Telegram</th>
                  <th className="p-3">Rol</th>
                  <th className="p-3">E'lon / buyurtma</th>
                  <th className="p-3">Amal</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <p className="font-medium">{u.name || "Ismsiz"}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.phone || "—"} · {fmt(u.created_at)}
                      </p>
                    </td>
                    <td className="p-3">
                      {u.telegram_verified ? (
                        <span className="inline-flex items-center gap-1 text-xs text-primary">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {u.telegram_username ? `@${u.telegram_username}` : "tasdiqlangan"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.role === "admin"
                            ? "bg-primary/15 text-primary"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {u.listings_count} / {u.orders_count}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void changeRole(u, u.role === "admin" ? "user" : "admin")}
                        >
                          {u.role === "admin" ? "Oddiy qilish" : "Admin qilish"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={u.is_blocked ? "outline" : "destructive"}
                          onClick={() => void toggleBlock(u)}
                        >
                          <Ban /> {u.is_blocked ? "Blokdan chiqarish" : "Bloklash"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      Foydalanuvchi topilmadi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="reports">
          {reports.length === 0 && (
            <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Shikoyatlar yo&apos;q.
            </p>
          )}
          <div className="space-y-2">
            {reports.map((r) => (
              <div key={r.report_id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <MessageSquareWarning className="h-4 w-4 text-destructive" />
                    {r.reason}
                  </span>
                  <span className="text-xs text-muted-foreground">{fmt(r.created_at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">{r.message_body}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Xabar ID: {r.message_id} · Yuboruvchi: {r.sender_id.slice(0, 8)}… · Suhbat:{" "}
                  {r.conversation_id.slice(0, 8)}…
                </p>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="audit">
          <div className="space-y-2">
            {audit.map((a) => (
              <div key={a.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{a.action}</span>
                  <span className="text-xs text-muted-foreground">{fmt(a.created_at)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.actor_email ?? "tizim"} → {a.target_table ?? "—"}
                  {a.target_id ? ` #${a.target_id.slice(0, 8)}` : ""}
                </p>
              </div>
            ))}
            {audit.length === 0 && (
              <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                Audit log bo&apos;sh.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
