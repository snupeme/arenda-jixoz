import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarPlus, MoreVertical, Send, ShieldAlert, Ban, CircleSlash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageBubble } from "./MessageBubble";
import { BookingRequestCard } from "./BookingRequestCard";
import { BookingRequestDialog } from "./BookingRequestDialog";
import {
  chatErrorText,
  fetchMessages,
  markConversationRead,
  sendChatMessage,
  blockUser,
  unblockUser,
  useChat,
  type ChatConversation,
  type ChatMessage,
} from "@/lib/chat";
import { getSupabase } from "@/lib/supabase";

const MAX_LEN = 1000;
const SAFETY_NOTICE =
  "Oldindan to'lov o'tkazmang. Jihozni ko'rib, topshirish vaqtida to'lang.";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  if (day.getTime() === today.getTime()) return "Bugun";
  if (day.getTime() === yest.getTime()) return "Kecha";
  return d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "long" });
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

type Props = {
  conversation: ChatConversation;
  userId: string | null;
  onBack?: () => void;
};

export function ChatWindow({ conversation, userId, onBack }: Props) {
  const { refresh } = useChat();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const convIdRef = useRef(conversation.id);

  convIdRef.current = conversation.id;

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    atBottomRef.current = true;
  }, []);

  // ── Xabarlarni yuklash ─────────────────────────────────────────
  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMessages(id);
      setMessages(res.messages);
      setHasMore(res.hasMore);
      requestAnimationFrame(() => scrollToBottom(false));
      void markConversationRead(id);
    } catch (err) {
      setError(chatErrorText(err));
    } finally {
      setLoading(false);
    }
  }, [scrollToBottom]);

  useEffect(() => {
    setMessages([]);
    setHasMore(false);
    void load(conversation.id);
  }, [conversation.id, load]);

  // ── Realtime ───────────────────────────────────────────────────
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const id = convIdRef.current;

    const channel = supabase
      .channel(`chat-messages-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as unknown as ChatMessage;
          if (!row?.id) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const next = [...prev, row].sort((a, b) =>
              a.created_at.localeCompare(b.created_at),
            );
            if (atBottomRef.current) requestAnimationFrame(() => scrollToBottom(true));
            return next;
          });
          void markConversationRead(id);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as unknown as ChatMessage;
          if (!row?.id) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === row.id ? { ...m, read_at: row.read_at } : m)),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversation.id, scrollToBottom]);

  // ── Scroll: yuqoriga scroll qilinganda eski xabarlar yuklanadi ─
  const loadOlder = useCallback(async () => {
    const el = scrollRef.current;
    const first = messages[0];
    if (!el || !first) return;
    setLoadingOlder(true);
    const prevHeight = el.scrollHeight;
    try {
      const res = await fetchMessages(convIdRef.current, first.created_at);
      if (res.messages.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const older = res.messages.filter((m) => !seen.has(m.id));
          return [...older, ...prev];
        });
        setHasMore(res.hasMore);
        requestAnimationFrame(() => {
          const node = scrollRef.current;
          if (node) node.scrollTop = node.scrollHeight - prevHeight;
        });
      } else {
        setHasMore(false);
      }
    } catch (err) {
      setError(chatErrorText(err));
    } finally {
      setLoadingOlder(false);
    }
  }, [messages]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distance < 80;

    if (el.scrollTop < 60 && hasMore && !loadingOlder) {
      void loadOlder();
    }
  }, [hasMore, loadingOlder, loadOlder]);

  // ── Yuborish ───────────────────────────────────────────────────
  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    if (body.length > MAX_LEN) {
      setError(`Xabar ${MAX_LEN} belgidan uzun bo'lishi mumkin emas.`);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendChatMessage(convIdRef.current, body);
      setDraft("");
      atBottomRef.current = true;
      scrollToBottom(true);
    } catch (err) {
      setError(chatErrorText(err));
    } finally {
      setSending(false);
    }
  }, [draft, sending, scrollToBottom]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  // ── Bloklash / blokdan chiqarish ──────────────────────────────
  const toggleBlock = async () => {
    setMenuError(null);
    try {
      if (conversation.blocked) {
        await unblockUser(conversation.peer_id);
      } else {
        await blockUser(conversation.peer_id);
      }
      await refresh();
    } catch (err) {
      setMenuError(chatErrorText(err));
    }
  };

  const isOwner = conversation.owner_id === userId;
  const grouped = useMemo(() => {
    const out: { label: string; items: ChatMessage[] }[] = [];
    for (const m of messages) {
      const last = out[out.length - 1];
      if (last && sameDay(last.items[0]?.created_at ?? m.created_at, m.created_at)) {
        last.items.push(m);
      } else {
        out.push({ label: dayLabel(m.created_at), items: [m] });
      }
    }
    return out;
  }, [messages]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Sarlavha */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2.5">
        {onBack && (
          <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Orqaga">
            <ArrowLeft />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{conversation.peer_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {conversation.listing_title}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Menyu">
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void toggleBlock()}>
              {conversation.blocked ? (
                <>
                  <CircleSlash /> Blokdan chiqarish
                </>
              ) : (
                <>
                  <Ban /> Bloklash
                </>
              )}
            </DropdownMenuItem>
            {menuError && (
              <DropdownMenuItem disabled className="text-destructive">
                {menuError}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Jihoz kartasi */}
      <Link
        to="/jihoz/$id"
        params={{ id: conversation.listing_id }}
        className="flex items-center gap-3 border-b border-border bg-card/60 px-3 py-2.5 transition-colors hover:bg-secondary/50"
      >
        {conversation.listing_image ? (
          <img
            src={conversation.listing_image}
            alt=""
            className="h-11 w-14 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="grid h-11 w-14 shrink-0 place-items-center rounded-lg bg-secondary text-xs text-muted-foreground">
            Rasmsiz
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{conversation.listing_title}</span>
          <span className="block text-xs text-muted-foreground">
            {new Intl.NumberFormat("uz-UZ").format(conversation.listing_price)} so&apos;m / kun
          </span>
        </span>
      </Link>

      {/* Xavfsizlik eslatmasi */}
      <div className="flex items-start gap-2 border-b border-border bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{SAFETY_NOTICE}</p>
      </div>

      {/* Xabarlar */}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading && messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Yuklanmoqda…</p>
        )}
        {!loading && messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Hozircha xabarlar yo&apos;q. Birinchi xabarni yozing!
          </p>
        )}
        {loadingOlder && (
          <p className="py-2 text-center text-xs text-muted-foreground">Yuklanmoqda…</p>
        )}
        {!loadingOlder && hasMore && (
          <div className="flex justify-center py-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => void loadOlder()}>
              Avvalgi xabarlar
            </Button>
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="my-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="rounded-full bg-secondary px-3 py-0.5 text-xs text-muted-foreground">
                {group.label}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2">
              {group.items.map((m) => (
                <div key={m.id} className={m.sender_id === userId ? "flex justify-end" : "flex justify-start"}>
                  {m.type === "booking_request" ? (
                    <BookingRequestCard
                      message={m}
                      mine={m.sender_id === userId}
                      canRespond={isOwner && m.sender_id !== userId}
                      onChanged={() => void load(conversation.id)}
                    />
                  ) : (
                    <MessageBubble
                      message={m}
                      mine={m.sender_id === userId}
                      canReport={m.sender_id !== userId}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Xabar yozish */}
      <div className="border-t border-border bg-card p-2.5">
        {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Xabar yozing…"
            className="max-h-32 min-h-[44px] resize-none"
          />
          <div className="flex flex-col gap-1.5">
            {!isOwner && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Band qilish so'rovi"
                onClick={() => setBookingOpen(true)}
              >
                <CalendarPlus />
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              aria-label="Yuborish"
              disabled={!draft.trim() || sending}
              onClick={() => void send()}
            >
              <Send />
            </Button>
          </div>
        </div>
        <p className="mt-1.5 flex justify-between px-1 text-[11px] text-muted-foreground">
          <span>Enter — yuborish · Shift+Enter — yangi qator</span>
          <span>{draft.length}/{MAX_LEN}</span>
        </p>
      </div>

      <BookingRequestDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        conversationId={conversation.id}
        onSent={() => void load(conversation.id)}
      />
    </div>
  );
}
