import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useStreamBuffer } from "@/hooks/use-stream-buffer";
import { queryFirecrawl } from "@/lib/firecrawl.functions";

interface ChatMessage { id: string; role: "user" | "assistant"; content: string }

function getSessionId() {
  if (typeof window === "undefined") return "";
  const key = "chatb2k_session_id";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionStorage.setItem(key, id);
  return id;
}

function decodeStreamChunk(chunk: string) {
  if (!chunk.includes("data:")) return chunk;
  return chunk.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).filter((line) => line !== "[DONE]").join("\n");
}

export function ChatB2KStreamPanel() {
  const { user, session } = useAuth();
  const { startStream, stopStream } = useChatStream();
  const getWebContext = useServerFn(queryFirecrawl);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webSearching, setWebSearching] = useState(false);
  const assistantIdRef = useRef<string | null>(null);
  const sessionId = useMemo(getSessionId, []);
  const assistantTextRef = useRef("");

  const appendAssistantChunk = useCallback((chunk: string) => {
    const decoded = decodeStreamChunk(chunk);
    if (!decoded) return;
    assistantTextRef.current += decoded;
    const id = assistantIdRef.current;
    if (!id) return;
    setMessages((current) => current.map((message) => message.id === id ? { ...message, content: message.content + decoded } : message));
  }, []);
  const { pushChunk, clearBuffer } = useStreamBuffer(appendAssistantChunk);

  useEffect(() => {
    if (!user || !sessionId) return;
    let cancelled = false;
    (async () => {
      const { data, error: loadError } = await (supabase as any).from("chatb2k_messages").select("id,role,content").eq("user_id", user.id).eq("session_id", sessionId).in("role", ["user", "assistant"]).order("created_at", { ascending: true }).limit(100);
      if (!cancelled && !loadError) setMessages((data ?? []) as ChatMessage[]);
    })();
    return () => { cancelled = true; };
  }, [sessionId, user]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || !user || !session?.access_token || streaming) return;
    setError(null); setInput(""); clearBuffer(); assistantTextRef.current = "";

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "" };
    assistantIdRef.current = assistantMessage.id;
    setMessages((current) => [...current, userMessage, assistantMessage]);

    const { error: saveError } = await (supabase as any).from("chatb2k_messages").insert({ id: userMessage.id, user_id: user.id, session_id: sessionId, role: "user", content });
    if (saveError) { setError(saveError.message); assistantIdRef.current = null; return; }

    setStreaming(true);
    setWebSearching(false);
    let webContext: unknown = undefined;
    try {
      setWebSearching(true);
      const result = await getWebContext({ data: { query: content } });
      if (result.used && result.sources.length) webContext = result.sources;
    } catch (webError) {
      console.warn("[chatb2k] Firecrawl context unavailable", webError);
    } finally { setWebSearching(false); }

    const streamUrl = import.meta.env.VITE_CHATB2K_STREAM_URL || "/api/stream/chatb2k";
    await startStream({
      url: streamUrl,
      token: session.access_token,
      body: { message: content, session_id: sessionId, web_context: webContext },
      onChunk: pushChunk,
      onComplete: async () => {
        clearBuffer();
        const assistantContent = assistantTextRef.current.trim();
        if (assistantContent) {
          const { error: persistError } = await (supabase as any).from("chatb2k_messages").insert({ id: assistantMessage.id, user_id: user.id, session_id: sessionId, role: "assistant", content: assistantContent });
          if (persistError) setError(persistError.message);
        }
        assistantIdRef.current = null; setStreaming(false); setWebSearching(false);
      },
      onError: (streamError) => { clearBuffer(); assistantIdRef.current = null; setStreaming(false); setWebSearching(false); setError(streamError.message); },
    });
  }

  return (
    <section className="glass rounded-md p-6 lg:col-span-3">
      <div className="flex items-center justify-between gap-4"><div><div className="text-xs tracking-[0.3em] uppercase text-gold">ChatB2K™ Companion</div><h3 className="font-display text-2xl mt-1">Live intelligence stream</h3></div><span className="text-[10px] tracking-widest uppercase text-muted-foreground">{webSearching ? "Web intelligence" : streaming ? "Streaming" : "Ready"}</span></div>
      <div className="mt-5 min-h-40 max-h-80 overflow-y-auto space-y-3 rounded-sm border border-[var(--glass-border)] bg-[var(--ink)] p-4">
        {messages.length === 0 ? <p className="text-sm text-muted-foreground">Ask ChatB2K what your next best action should be.</p> : messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[85%] rounded-sm bg-gold-gradient p-3 text-sm text-[var(--ink)]" : "max-w-[85%] rounded-sm border border-[var(--glass-border)] p-3 text-sm text-foreground/90"}>{message.content || (streaming && message.id === assistantIdRef.current ? "…" : "")}</div>)}
      </div>
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      <form onSubmit={sendMessage} className="mt-4 flex gap-2"><input value={input} onChange={(event) => setInput(event.target.value)} disabled={!user || streaming} placeholder="Ask ChatB2K…" className="min-w-0 flex-1 rounded-sm border border-[var(--glass-border)] bg-[var(--ink)] px-4 py-3 text-sm outline-none focus:border-[var(--gold)] disabled:opacity-50" />{streaming ? <button type="button" onClick={() => stopStream()} className="rounded-sm border border-[var(--glass-border)] px-4 py-3 text-sm text-muted-foreground hover:border-[var(--gold)]">Stop</button> : <button type="submit" disabled={!user || !input.trim()} className="rounded-sm bg-gold-gradient px-5 py-3 text-sm font-semibold text-[var(--ink)] disabled:opacity-50">Send</button>}</form>
    </section>
  );
}
