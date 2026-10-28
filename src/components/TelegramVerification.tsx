import { useEffect, useRef, useState } from "react";
import { ArrowRight, Copy, ExternalLink, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { BOT_LINK, BOT_USERNAME } from "@/lib/telegram-bot";
import {
  fetchVerificationStatus,
  requestVerificationLink,
  type TelegramVerificationStatus,
} from "@/lib/telegram-verify";

const POLL_MS = 3000;

export function TelegramVerification() {
  const { profile, updateProfile } = useStore();
  const [status, setStatus] = useState<TelegramVerificationStatus | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Supabase sessiyasi
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [signedInAs, setSignedInAs] = useState<string | null>(null);

  const updateRef = useRef(updateProfile);
  updateRef.current = updateProfile;

  // Holatni bir marta olish
  useEffect(() => {
    let alive = true;
    const supabase = getSupabase();
    void supabase?.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSignedInAs(data.session?.user?.email ?? null);
    });
    void fetchVerificationStatus().then((s) => {
      if (!alive) return;
      setStatus(s);
      if (s.verified) {
        updateRef.current({
          telegramVerified: true,
          telegramUsername: s.telegramUsername ?? profile.telegramUsername,
        });
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verified = status?.verified === true || profile.telegramVerified;

  // Tasdiqlash kutilayotgan paytda holatni tekshirib turamiz
  useEffect(() => {
    if (!link || verified) return;
    const id = window.setInterval(() => {
      void fetchVerificationStatus().then((s) => {
        setStatus(s);
        if (s.verified) {
          updateRef.current({
            telegramVerified: true,
            telegramUsername: s.telegramUsername ?? "",
          });
        }
      });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [link, verified]);

  const request = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await requestVerificationLink();
      setLink(res.url);
      setExpiresAt(res.expiresAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik yuz berdi");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Havolani nusxalash mumkin bo'lmadi");
    }
  };

  const auth = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase) {
      setAuthError("Supabase sozlanmagan");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setAuthError("Ro'yxatdan o'tdingiz. Email orqali tasdiqlash xabarini tekshiring.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
      const { data } = await supabase.auth.getSession();
      setSignedInAs(data.session?.user?.email ?? null);
      const s = await fetchVerificationStatus();
      setStatus(s);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Kirishda xatolik");
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    const supabase = getSupabase();
    await supabase?.auth.signOut();
    setSignedInAs(null);
    setStatus((s) => (s ? { ...s, verified: false, signedIn: false } : s));
  };

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Telegram orqali tasdiqlash</h3>
          <p className="text-sm text-muted-foreground">
            Tasdiqlangan akkaunt e&apos;lonlarida &quot;Tasdiqlangan&quot; belgisini oladi.
          </p>
        </div>
        {verified ? <VerifiedBadge /> : null}
      </div>

      {status && !status.configured && (
        <p className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
          {status.message ??
            `Telegram boti (@${status.botUsername ?? BOT_USERNAME}) uchun serverda TELEGRAM_BOT_TOKEN o'rnlanmagan.`}
        </p>
      )}

      {status?.mode === "local" && !verified && (
        <p className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
          Lokal rejim: Telegram akkauntingiz shu qurilmaga bog&apos;lanadi. Bot orqali tasdiqlang —
          bot sizga havolani ochishni so&apos;raydi.
        </p>
      )}

      {status?.configured === false ? null : verified ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm">
            Akkauntingiz tasdiqlangan
            {profile.telegramUsername ? (
              <>
                {" "}
                <a
                  className="font-medium text-primary underline underline-offset-4"
                  href={`https://t.me/${profile.telegramUsername.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @{profile.telegramUsername.replace(/^@/, "")}
                </a>
              </>
            ) : null}
            .
          </p>
          {signedInAs && (
            <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
              Chiqish
            </Button>
          )}
        </div>
      ) : (
        <>
          {!signedInAs && status?.mode !== "local" && (
            <form onSubmit={auth} className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Email</Label>
                <Input
                  className="mt-1 h-11"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Parol</Label>
                <Input
                  className="mt-1 h-11"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kamida 6 ta belgi"
                />
              </div>
              {authError && <p className="text-sm text-destructive sm:col-span-2">{authError}</p>}
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                <Button type="submit" variant="outline" disabled={authBusy}>
                  {authBusy ? <Loader2 className="animate-spin" /> : null}
                  {mode === "signup" ? "Ro'yxatdan o'tish" : "Kirish"}
                </Button>
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline underline-offset-4"
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                >
                  {mode === "signin" ? "Akkauntim yo'q — ro'yxatdan o'tish" : "Akkauntim bor — kirish"}
                </button>
              </div>
            </form>
          )}

          {signedInAs && (
            <p className="mt-3 text-sm text-muted-foreground">
              Kirgan akkaunt: <b className="text-foreground">{signedInAs}</b>{" "}
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={() => void signOut()}
              >
                chiqish
              </button>
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void request()}
              disabled={busy || (!signedInAs && status?.mode !== "local")}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Send />}
              Telegram&apos;ni tasdiqlash
            </Button>
            {!signedInAs && status?.mode !== "local" && (
              <span className="text-sm text-muted-foreground">Avval tizimga kiring</span>
            )}
          </div>

          {link && (
            <div className="mt-4 rounded-lg border border-border bg-secondary/40 p-3">
              <p className="text-sm font-medium">
                Botni ochib &quot;Start&quot; bosing:{" "}
                <a
                  className="text-primary underline underline-offset-4"
                  href={BOT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @{BOT_USERNAME}
                </a>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input className="h-10 flex-1 min-w-[16rem] font-mono text-xs" readOnly value={link} />
                <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
                  <Copy /> {copied ? "Nusxalandi" : "Nusxa"}
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={link} target="_blank" rel="noopener noreferrer">
                    Ochish <ExternalLink />
                  </a>
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Havola {expiresAt ? new Date(expiresAt).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" }) : "10 daqiqa"} daqiqa davomida Amal qiladi va bir marta ishlatiladi.
              </p>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </>
      )}

      {status?.verificationRequired && !verified && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>Tasdiqlash majburiy rejimda: e&apos;lon qo&apos;shish uchun avval Telegram orqali tasdiqlang.</span>
        </p>
      )}
    </div>
  );
}
