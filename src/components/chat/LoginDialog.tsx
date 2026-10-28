import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignedIn?: () => void;
};

export function LoginDialog({ open, onOpenChange, onSignedIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setNotice("");
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase) {
      setError("Supabase sozlanmagan — kirish vaqtincha ishlamayapti.");
      return;
    }
    if (!email.trim() || password.length < 6) {
      setError("Emailni va kamida 6 ta belgili parolni kiriting.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          onSignedIn?.();
          onOpenChange(false);
        } else {
          setNotice("Ro'yxatdan o'tdingiz. Email orqali tasdiqlash xabarini tekshiring.");
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        onSignedIn?.();
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kirishda xatolik yuz berdi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Xabar yozish uchun kiring</DialogTitle>
          <DialogDescription>
            Jihoz.uz hisobingiz bilan kiring — xabarlar faqat sizga ko&apos;rinadi.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-3">
          <div>
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              className="mt-1 h-11"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <Label htmlFor="login-password">Parol</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="mt-1 h-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Kamida 6 ta belgi"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-primary">{notice}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {mode === "signup" ? "Ro'yxatdan o'tish" : "Kirish"}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground underline underline-offset-4"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError("");
                setNotice("");
              }}
            >
              {mode === "signin"
                ? "Hisobingiz yo'qmi? Ro'yxatdan o'tish"
                : "Akkauntingiz bormi? Kirish"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
