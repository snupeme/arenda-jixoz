import { useState } from "react";
import { Check, CheckCheck, Flag } from "lucide-react";
import type { ChatMessage } from "@/lib/chat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { REPORT_REASONS, reportMessage, type ReportReason } from "@/lib/chat";

/** Xabar matnidagi havolalarni topadi (faqat http/https) */
const URL_RE = /(https?:\/\/[^\s<]+)/gi;

export function MessageText({ body }: { body: string }) {
  const parts = body.split(URL_RE);
  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {parts.map((part, i) =>
        /^https?:\/\//i.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

type Props = {
  message: ChatMessage;
  mine: boolean;
  canReport: boolean;
};

export function MessageBubble({ message, mine, canReport }: Props) {
  const [reportOpen, setReportOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [error, setError] = useState("");

  const submitReport = async () => {
    setError("");
    try {
      await reportMessage(message.id, reason);
      setReportOpen(false);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Shikoyat yuborilmadi");
    }
  };

  return (
    <div className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
      <div
        className={`max-w-[85%] rounded-2xl border px-3 py-2 ${
          mine
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-foreground"
        }`}
      >
        <MessageText body={message.body} />
        <div
          className={`mt-1 flex items-center gap-1 text-[11px] ${
            mine ? "text-primary-foreground/70" : "text-muted-foreground"
          }`}
        >
          <span>
            {new Date(message.created_at).toLocaleTimeString("uz-UZ", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {mine &&
            (message.read_at ? (
              <CheckCheck className="h-3.5 w-3.5" aria-label="O'qilgan" />
            ) : (
              <Check className="h-3.5 w-3.5" aria-label="Yuborilgan" />
            ))}
          {sent && <span className="ml-1">Shikoyat yuborildi</span>}
        </div>
      </div>

      {canReport && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          aria-label="Shikoyat qilish"
          onClick={() => setReportOpen(true)}
        >
          <Flag className="h-3.5 w-3.5" />
        </Button>
      )}

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Shikoyat qilish</DialogTitle>
            <DialogDescription>Sababni tanlang — moderator ko'rib chiqadi.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {REPORT_REASONS.map((r) => (
              <label key={r.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="report-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                {r.label}
              </label>
            ))}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>
              Bekor qilish
            </Button>
            <Button onClick={() => void submitReport()}>Yuborish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
