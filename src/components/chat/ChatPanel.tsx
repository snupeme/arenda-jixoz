import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChat, type ChatConversation } from "@/lib/chat";
import { ChatWindow } from "./ChatWindow";

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff === 0) return d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
  if (diff === 1) return "Kecha";
  return d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit" });
}

function preview(c: ChatConversation): string {
  if (c.last_message_type === "booking_request") return "Band qilish so'rovi";
  return c.last_message ?? "";
}

function ConversationRow({
  conversation,
  active,
  onSelect,
}: {
  conversation: ChatConversation;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full gap-3 rounded-xl border p-3 text-left transition-colors ${
        active
          ? "border-primary bg-secondary/60"
          : "border-border bg-card hover:bg-secondary/40"
      }`}
    >
      <div className="relative shrink-0">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-sm font-bold text-primary">
          {conversation.peer_name?.[0]?.toUpperCase() ?? "?"}
        </span>
        {conversation.unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
            {conversation.unread > 99 ? "99+" : conversation.unread}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold">{conversation.peer_name}</p>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {timeLabel(conversation.last_message_at)}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{conversation.listing_title}</p>
        <p
          className={`mt-0.5 truncate text-xs ${
            conversation.unread > 0 ? "font-medium text-foreground" : "text-muted-foreground"
          }`}
        >
          {preview(conversation)}
        </p>
      </div>
    </button>
  );
}

type Props = {
  initialConversationId?: string | null;
};

export function ChatPanel({ initialConversationId }: Props) {
  const { enabled, signedIn, conversations, loading, error, userId } = useChat();
  const [activeId, setActiveId] = useState<string | null>(initialConversationId ?? null);
  const [mobileChat, setMobileChat] = useState(Boolean(initialConversationId));

  useEffect(() => {
    if (initialConversationId) {
      setActiveId(initialConversationId);
      setMobileChat(true);
    }
  }, [initialConversationId]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-semibold">Chat vaqtincha ishlamayapti</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Chat tizimi uchun Supabase sozlanishi kerak. Administratorga murojaat qiling.
        </p>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-semibold">Xabarlar uchun tizimga kiring</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Kirgandan so&apos;ng e&apos;lon sahifasidan &quot;Yozish&quot; tugmasi orqali xabar
          yozishingiz mumkin.
        </p>
        <Button asChild className="mt-4">
          <Link to="/kabinet">Kabinetga o&apos;tish</Link>
        </Button>
      </div>
    );
  }

  const list = (
    <div className="space-y-2">
      {loading && conversations.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">Yuklanmoqda…</p>
      )}
      {!loading && conversations.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Hozircha xabarlar yo&apos;q.
          <br />
          <span className="text-xs">
            Jihoz sahifasidagi &quot;Yozish&quot; tugmasi orqali suhbat boshlang.
          </span>
        </p>
      )}
      {conversations.map((c) => (
        <ConversationRow
          key={c.id}
          conversation={c}
          active={c.id === activeId}
          onSelect={() => {
            setActiveId(c.id);
            setMobileChat(true);
          }}
        />
      ))}
      {error && <p className="px-1 pt-2 text-xs text-destructive">{error}</p>}
    </div>
  );

  const window_ = active ? (
    <ChatWindow
      conversation={active}
      userId={userId}
      onBack={() => setMobileChat(false)}
    />
  ) : (
    <div className="grid h-full place-items-center p-8 text-center">
      <div>
        <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 font-semibold">Suhbatni tanlang</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Chapdagi ro&apos;yxatdan suhbatni tanlang.
        </p>
      </div>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card md:grid md:h-[620px] md:grid-cols-[320px_1fr]">
      {/* Ro'yxat */}
      <div className={`${mobileChat ? "hidden md:block" : "block"} border-b border-border p-3 md:overflow-y-auto md:border-b-0 md:border-r`}>
        <div className="mb-3 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Xabarlar</h2>
        </div>
        {list}
      </div>

      {/* Oyna */}
      <div className={`${mobileChat ? "block" : "hidden md:block"} h-[70vh] min-h-0 md:h-full`}>
        {window_}
      </div>
    </div>
  );
}
