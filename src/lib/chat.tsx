import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSupabase, isSupabaseConfigured } from "./supabase";

/* ─────────────────────────── Tiplar ─────────────────────────── */

export type ChatConversation = {
  id: string;
  listing_id: string;
  renter_id: string;
  owner_id: string;
  created_at: string;
  last_message_at: string;
  peer_id: string;
  peer_name: string;
  listing_title: string;
  listing_image: string | null;
  listing_price: number;
  last_message: string | null;
  last_message_type: "text" | "booking_request" | null;
  unread: number;
  blocked: boolean;
};

export type BookingPayload = {
  from: string;
  to: string;
  qty: number;
  days: number;
  status: "pending" | "accepted" | "rejected";
  order_id?: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  type: "text" | "booking_request";
  booking_payload: BookingPayload | null;
  created_at: string;
  read_at: string | null;
};

export type ReportReason = "spam" | "fraud" | "abuse" | "other";

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "fraud", label: "Firibgarlik" },
  { value: "abuse", label: "Haqorat" },
  { value: "other", label: "Boshqa" },
];

/* ─────────────────────────── Yordamchilar ─────────────────────────── */

export function chatErrorText(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const msg = String((err as { message?: unknown }).message ?? "");
    // Supabase xatolar: "code: message" yoki "message"
    const clean = msg.replace(/^.*?:\s*/, "").trim();
    if (clean) return clean;
  }
  if (typeof err === "string" && err.trim()) return err.trim();
  return "Xabar yuborishda xatolik yuz berdi.";
}

/* ─────────────────────────── Ma'lumot qatlami ─────────────────────────── */

export async function fetchConversations(): Promise<ChatConversation[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("chat_conversations");
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return (rows as unknown as ChatConversation[]).sort((a, b) =>
    b.last_message_at.localeCompare(a.last_message_at),
  );
}

export async function fetchMessages(
  conversationId: string,
  before?: string | null,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const supabase = getSupabase();
  if (!supabase) return { messages: [], hasMore: false };
  const { data, error } = await supabase.rpc("chat_messages", {
    p_conversation_id: conversationId,
    p_before: before ?? null,
    p_limit: 30,
  });
  if (error) throw error;
  const payload = (data ?? {}) as { messages?: ChatMessage[]; has_more?: boolean };
  return { messages: payload.messages ?? [], hasMore: payload.has_more === true };
}

export async function openConversationForListing(listingId: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Chat uchun Supabase sozlanmagan.");
  const { data, error } = await supabase.rpc("start_conversation", {
    p_listing_id: listingId,
  });
  if (error) throw error;
  const id = (data as { conversation_id?: string } | null)?.conversation_id;
  if (!id) throw new Error("Suhbatni ochib bo'lmadi.");
  return id;
}

export async function sendChatMessage(
  conversationId: string,
  body: string,
): Promise<ChatMessage> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Chat uchun Supabase sozlanmagan.");
  const { data, error } = await supabase.rpc("send_chat_message", {
    p_conversation_id: conversationId,
    p_body: body,
  });
  if (error) throw error;
  return data as unknown as ChatMessage;
}

export async function sendBookingRequest(
  conversationId: string,
  from: string,
  to: string,
  qty: number,
): Promise<ChatMessage> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Chat uchun Supabase sozlanmagan.");
  const { data, error } = await supabase.rpc("send_booking_request", {
    p_conversation_id: conversationId,
    p_from: from,
    p_to: to,
    p_qty: qty,
  });
  if (error) throw error;
  return data as unknown as ChatMessage;
}

export async function respondToBooking(
  messageId: string,
  accept: boolean,
): Promise<{ status: string; order_id?: string }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Chat uchun Supabase sozlanmagan.");
  const { data, error } = await supabase.rpc("respond_booking_request", {
    p_message_id: messageId,
    p_accept: accept,
  });
  if (error) throw error;
  return (data ?? {}) as { status: string; order_id?: string };
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.rpc("mark_conversation_read", {
    p_conversation_id: conversationId,
  });
  if (error) console.error("markConversationRead:", error);
}

export async function blockUser(userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.rpc("block_conversation_user", { p_blocked_id: userId });
  if (error) throw error;
}

export async function unblockUser(userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.rpc("unblock_conversation_user", { p_blocked_id: userId });
  if (error) throw error;
}

export async function reportMessage(messageId: string, reason: ReportReason): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.rpc("report_chat_message", {
    p_message_id: messageId,
    p_reason: reason,
  });
  if (error) throw error;
}

/* ─────────────────────────── Kontekst ─────────────────────────── */

type ChatContextValue = {
  enabled: boolean;
  signedIn: boolean;
  userId: string | null;
  conversations: ChatConversation[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  openConversation: (listingId: string) => Promise<string>;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const enabled = isSupabaseConfigured;
  const [signedIn, setSignedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabase>>["channel"]> | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setConversations([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchConversations();
      setConversations(rows);
      setError(null);
    } catch (err) {
      console.error("chat refresh:", err);
      setError(chatErrorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Sessiya + realtime
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let alive = true;

    const setup = async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      const session = data.session;
      setSignedIn(!!session);
      setUserId(session?.user?.id ?? null);

      if (!session) {
        setConversations([]);
        return;
      }

      // Realtime uchun tokenni o'rnatish
      try {
        await supabase.realtime.setAuth(session.access_token);
      } catch {
        /* esda qoladi */
      }

      const channel = supabase
        .channel("jihoz-chat")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          () => {
            void refresh();
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "conversations" },
          () => {
            void refresh();
          },
        )
        .subscribe();
      channelRef.current = channel;

      void refresh();
    };

    void setup();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void setup();
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [refresh]);

  // Ro'yxat vaqtida va interval bilan yangilash
  useEffect(() => {
    if (!signedIn) return;
    const id = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(id);
  }, [signedIn, refresh]);

  const unreadCount = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread || 0), 0),
    [conversations],
  );

  const openConversation = useCallback(
    async (listingId: string) => {
      const id = await openConversationForListing(listingId);
      await refresh();
      return id;
    },
    [refresh],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      enabled,
      signedIn,
      userId,
      conversations,
      unreadCount,
      loading,
      error,
      refresh,
      openConversation,
    }),
    [enabled, signedIn, userId, conversations, unreadCount, loading, error, refresh, openConversation],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat faqat ChatProvider ichida ishlatiladi");
  return ctx;
}
