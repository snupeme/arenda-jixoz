import { useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { chatErrorText, sendBookingRequest } from "@/lib/chat";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function defaultDates() {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 1);
  return { from: iso(from), to: iso(to) };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  onSent?: () => void;
};

export function BookingRequestDialog({ open, onOpenChange, conversationId, onSent }: Props) {
  const [from, setFrom] = useState(() => defaultDates().from);
  const [to, setTo] = useState(() => defaultDates().to);
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const d = defaultDates();
    setFrom(d.from);
    setTo(d.to);
    setQty("1");
    setError(null);
  }, [open]);

  const submit = async () => {
    setError(null);
    const qtyNum = Number(qty);
    if (!from || !to) {
      setError("Sanani tanlang.");
      return;
    }
    if (to < from) {
      setError("Tugash sanasi boshlanish sanasidan oldin bo'lmaydi.");
      return;
    }
    if (!Number.isInteger(qtyNum) || qtyNum < 1) {
      setError("Miqdor kamida 1 bo'lishi kerak.");
      return;
    }
    setBusy(true);
    try {
      await sendBookingRequest(conversationId, from, to, qtyNum);
      onOpenChange(false);
      onSent?.();
    } catch (err) {
      setError(chatErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5" /> Band qilish so&apos;rovi
          </DialogTitle>
          <DialogDescription>
            Sana va miqdorni tanlang — ega so&apos;rovni tasdiqlaydi.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="book-from">Boshlanish</Label>
            <Input
              id="book-from"
              type="date"
              className="mt-1 h-11"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="book-to">Tugash</Label>
            <Input
              id="book-to"
              type="date"
              className="mt-1 h-11"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="book-qty">Miqdor (dona)</Label>
            <Input
              id="book-qty"
              type="number"
              min={1}
              step={1}
              className="mt-1 h-11"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Bekor qilish
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Yuborilmoqda…" : "So'rovni yuborish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
