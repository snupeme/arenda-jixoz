import { useState } from "react";
import { CalendarDays, Check, X } from "lucide-react";
import type { ChatMessage } from "@/lib/chat";
import { respondToBooking } from "@/lib/chat";
import { Button } from "@/components/ui/button";

const fmt = (s: string) =>
  new Date(s).toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" });

type Props = {
  message: ChatMessage;
  mine: boolean;
  canRespond: boolean;
  onChanged?: () => void;
};

export function BookingRequestCard({ message, mine, canRespond, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(message.booking_payload?.status ?? "pending");
  const payload = message.booking_payload;

  if (!payload) return null;

  const respond = async (accept: boolean) => {
    setBusy(true);
    setError("");
    try {
      const res = await respondToBooking(message.id, accept);
      setStatus((res.status as "accepted" | "rejected") ?? (accept ? "accepted" : "rejected"));
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Amalni bajarishda xatolik");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`w-[270px] rounded-2xl border p-3 text-sm ${
        mine ? "border-primary/40 bg-primary/10" : "border-border bg-secondary/40"
      }`}
    >
      <div className="flex items-center gap-2 font-semibold">
        <CalendarDays className="h-4 w-4" />
        Band qilish so&apos;rovi
      </div>
      <p className="mt-2 text-muted-foreground">
        {fmt(payload.from)} — {fmt(payload.to)}
      </p>
      <p className="text-muted-foreground">
        {payload.days} kun · {payload.qty} dona
      </p>

      <div className="mt-2">
        {status === "pending" && canRespond && (
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void respond(true)}>
              <Check /> Qabul qilish
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void respond(false)}>
              <X /> Rad etish
            </Button>
          </div>
        )}
        {status === "accepted" && (
          <p className="font-medium text-primary">Qabul qilindi — buyurtma yaratildi</p>
        )}
        {status === "rejected" && <p className="font-medium text-destructive">Rad etildi</p>}
        {status === "pending" && !canRespond && (
          <p className="text-muted-foreground">Eganing javobini kutilmoqda</p>
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
