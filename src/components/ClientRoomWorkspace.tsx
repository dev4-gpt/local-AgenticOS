"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { History, Plus, Send, Trash2, TriangleAlert, Users } from "lucide-react";
import AgentAvatar, { type AgentKey } from "@/components/AgentAvatar";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import {
  roomFormatMicros, roomTimeAgo,
  type RoomConversation, type RoomMessage, type RoomRosterEntry, type RoomRound,
} from "@/lib/clientRoomAdapter";

const PURPLE = "#a855f7";

export default function ClientRoomWorkspace() {
  const [roster, setRoster] = useState<RoomRosterEntry[]>([]);
  const [conversations, setConversations] = useState<RoomConversation[]>([]);
  const [conversation, setConversation] = useState<RoomConversation | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [activeRound, setActiveRound] = useState<RoomRound | null>(null);
  const [lastRound, setLastRound] = useState<RoomRound | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`/api/client-runtime/room/${path}`, { cache: "no-store", ...init }).catch(() => null);
    const data = await response?.json().catch(() => null);
    return { ok: Boolean(response?.ok), status: response?.status ?? 0, data } as const;
  }, []);

  const loadConversations = useCallback(async () => {
    const { ok, data } = await api("conversations");
    if (!ok) { setError(typeof data?.error === "string" ? data.error : "room_read_failed"); return null; }
    if (data?.configured === false) { setConfigured(false); setError("room_schema_missing"); return null; }
    setConfigured(true);
    setRoster(Array.isArray(data?.roster) ? data.roster as RoomRosterEntry[] : []);
    const list = Array.isArray(data?.conversations) ? data.conversations as RoomConversation[] : [];
    setConversations(list);
    return list;
  }, [api]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { ok, data } = await api(`messages?conversationId=${encodeURIComponent(conversationId)}`);
    if (!ok || data?.configured === false) return;
    setConversation((data?.conversation as RoomConversation) ?? null);
    setMessages(Array.isArray(data?.messages) ? data.messages as RoomMessage[] : []);
    setActiveRound((data?.activeRound as RoomRound) ?? null);
    setLastRound((data?.lastRound as RoomRound) ?? null);
  }, [api]);

  useEffect(() => { void (async () => {
    const list = await loadConversations();
    if (list && list[0]) await loadMessages(list[0].id);
  })(); }, [loadConversations, loadMessages]);

  // A round runs in the queue, so the transcript is polled. Each agent's reply
  // is written the moment it lands, so they still arrive one at a time.
  useEffect(() => {
    if (!activeRound || !conversation) return;
    const timer = window.setInterval(() => { void loadMessages(conversation.id); }, 2500);
    return () => window.clearInterval(timer);
  }, [activeRound, conversation, loadMessages]);

  useEffect(() => { if (messages.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, activeRound]);

  async function newChat() {
    setShowHistory(false);
    const { ok, data } = await api("conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    if (!ok) { setError(typeof data?.error === "string" ? data.error : "room_write_failed"); return; }
    await loadConversations();
    if (typeof data?.conversationId === "string") { setMessages([]); await loadMessages(data.conversationId); }
  }

  async function openConversation(id: string) { setShowHistory(false); await loadMessages(id); }

  async function deleteConversation(id: string) {
    const { ok } = await api(`conversations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!ok) { setError("room_delete_failed"); return; }
    const list = await loadConversations();
    if (conversation?.id === id) {
      setConversation(null); setMessages([]); setActiveRound(null);
      if (list && list[0]) await loadMessages(list[0].id);
    }
  }

  async function toggleAgent(id: string) {
    if (!conversation) return;
    const present = conversation.presentAgents.includes(id)
      ? conversation.presentAgents.filter((value) => value !== id)
      : [...conversation.presentAgents, id];
    setConversation({ ...conversation, presentAgents: present });
    const { ok } = await api("conversations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: conversation.id, presentAgents: present }) });
    if (!ok) { setError("room_write_failed"); await loadMessages(conversation.id); }
  }

  async function send() {
    const message = input.trim();
    if (!message || busy || !conversation) return;
    setBusy(true); setError(""); setInput("");
    const { ok, data } = await api("messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: conversation.id, message }) });
    if (!ok) setError(typeof data?.error === "string" ? data.error : "room_send_failed");
    await loadMessages(conversation.id);
    setBusy(false);
  }

  const present = conversation?.presentAgents ?? [];
  const speaking = activeRound?.speakingAgentId ? roster.find((entry) => entry.id === activeRound.speakingAgentId) : null;
  const roundCost = messages.reduce((total, message) => total + message.costMicros, 0);

  if (!configured) return <div className="space-y-5 pb-8">
    <RoomHeader />
    <section className="panel p-6 text-center">
      <TriangleAlert size={24} className="mx-auto" style={{ color: "#fbbf24" }} />
      <h2 className="mt-3 text-[14px] font-semibold" style={{ color: "var(--cream)" }}>Room tables are not in this tenant yet</h2>
      <p className="mx-auto mt-2 max-w-[520px] text-[11.5px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>
        Conversations, messages, and round state live in Supabase under tenant RLS. Apply <span className="font-mono">product-experience/supabase-client-room.sql</span>, then reload.
      </p>
    </section>
    <ClientRuntimeNotice code="room_schema_missing" />
  </div>;

  return <div className="mx-auto flex max-w-[900px] flex-col pb-8">
    <div className="mb-3 flex items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border" style={{ borderColor: "rgba(168,85,247,0.4)", background: "rgba(168,85,247,0.12)", color: PURPLE }}><Users size={20} /></div>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-medium tracking-tight" style={{ color: "var(--cream)" }}>AI Agent <span style={{ color: PURPLE }}>Mastermind</span></h1>
        <div className="text-[12.5px]" style={{ color: "var(--cream-dim)" }}>Talk to available agents at once. An agent may use the tenant’s approved fallback provider when its preferred provider is unavailable. Tag one with <span className="font-mono">@claude</span> to ask just them.</div>
      </div>
      <div className="relative flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={() => void newChat()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Plus size={13} />New chat</button>
        <button type="button" onClick={() => setShowHistory((value) => !value)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px]" style={{ borderColor: showHistory ? PURPLE : "var(--line-soft)", color: showHistory ? PURPLE : "var(--cream-dim)", background: showHistory ? "rgba(168,85,247,0.1)" : "transparent" }}><History size={13} />History{conversations.length ? ` (${conversations.length})` : ""}</button>
        {showHistory && <div className="absolute right-0 top-full z-30 mt-2 max-h-[64vh] w-[320px] overflow-y-auto rounded-xl border p-1.5" style={{ borderColor: "var(--line-soft)", background: "var(--panel)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          {conversations.length === 0 && <div className="p-3 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>No saved chats yet.</div>}
          {conversations.map((entry) => <div key={entry.id} onClick={() => void openConversation(entry.id)} className="group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: entry.id === conversation?.id ? "rgba(168,85,247,0.12)" : "transparent" }}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px]" style={{ color: "var(--cream)" }}>{entry.title}</div>
              <div className="text-[10.5px]" style={{ color: "var(--cream-mute)" }}>{roomTimeAgo(entry.updatedAt)}</div>
            </div>
            <button type="button" onClick={(event) => { event.stopPropagation(); void deleteConversation(entry.id); }} title="Delete chat" className="p-1 opacity-0 group-hover:opacity-100" style={{ color: "var(--cream-mute)" }}><Trash2 size={13} /></button>
          </div>)}
        </div>}
      </div>
    </div>

    <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b pb-3" style={{ borderColor: "var(--line-soft)" }}>
      <span className="mr-1 text-[10px] uppercase tracking-widest" style={{ color: "var(--cream-mute)" }}>In the room</span>
      {roster.map((entry) => {
        const on = present.includes(entry.id);
        return <button key={entry.id} type="button" disabled={!entry.available || !conversation} onClick={() => void toggleAgent(entry.id)}
          title={entry.available ? `${entry.name} · ${entry.resolvedProvider} · ${entry.model}` : `${entry.name} unavailable — ${entry.blockedReason}`}
          className="flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[12px] transition disabled:cursor-not-allowed"
          style={{ borderColor: on ? entry.color : "var(--line-soft)", background: on ? `${entry.color}1e` : "transparent", color: on ? "var(--cream)" : "var(--cream-mute)", opacity: entry.available ? (on ? 1 : 0.55) : 0.3 }}>
          <span style={{ filter: on ? "none" : "grayscale(1)" }}><AgentAvatar agent={entry.id as AgentKey} size={18} /></span>
          {entry.name}
        </button>;
      })}
      {roster.some((entry) => !entry.available) && <span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>· dimmed agents need an approved provider credential</span>}
    </div>

    <div className="mb-3 border-b pb-3" style={{ borderColor: "var(--line-soft)" }}>
      <div className="flex gap-2">
        <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void send(); }}
          placeholder={!conversation ? "Start a new chat first…" : present.length === 0 ? "Add an agent to the room first…" : "Message the room…  (tag @claude to ask one)"}
          disabled={!conversation || present.length === 0 || Boolean(activeRound)}
          className="h-11 min-w-0 flex-1 rounded-xl border px-4 text-sm outline-none" style={{ background: "rgba(0,0,0,0.3)", borderColor: "var(--line-soft)", color: "var(--cream)" }} />
        <button type="button" onClick={() => void send()} disabled={!input.trim() || busy || !conversation || present.length === 0 || Boolean(activeRound)}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-5 text-[13px] font-semibold disabled:opacity-40" style={{ background: PURPLE, color: "#fff" }}>
          <Send size={15} />{activeRound ? "Round running" : busy ? "Sending" : "Send"}
        </button>
      </div>
      <div className="mt-1.5 text-[10.5px]" style={{ color: "var(--cream-mute)" }}>
        {present.length} in the room · they reply in turn through the approved provider lane and read this workspace&apos;s memory
        {roundCost > 0 ? ` · ${roomFormatMicros(roundCost)} settled in this chat` : ""}
      </div>
    </div>

    <div className="min-h-[320px] flex-1 space-y-3 overflow-y-auto pr-1">
      {messages.length === 0 && <div className="pt-10 text-center text-[13px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>
        {conversation ? <>Drop a question and watch them go.<br /><span style={{ color: "var(--cream-dim)" }}>&ldquo;What should we ship next?&rdquo;</span> · <span style={{ color: "var(--cream-dim)" }}>&ldquo;@codex how would you structure this?&rdquo;</span></> : "Create a new chat to open the room."}
      </div>}
      <AnimatePresence initial={false}>
        {messages.map((message) => message.role === "user" ? (
          <motion.div key={message.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
            <div className="max-w-[78%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[14px] leading-relaxed" style={{ background: "rgba(212,165,116,0.16)", border: "1px solid rgba(212,165,116,0.35)", color: "var(--cream)" }}>{message.content}</div>
          </motion.div>
        ) : message.role === "system" ? (
          <motion.div key={message.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center">
            <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px]" style={systemPill(message.kind)}>
              <span>{message.kind === "context" ? "🔎" : message.kind === "error" ? "⚠" : "✓"}</span>{message.content}
            </div>
          </motion.div>
        ) : (
          <motion.div key={message.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0"><AgentAvatar agent={(message.agentId ?? "claude") as AgentKey} size={26} /></span>
            <div className="max-w-[82%]">
              <div className="mb-0.5 text-[11px] font-semibold" style={{ color: message.agentColor ?? PURPLE }}>
                {message.agentName}
                {message.model && <span className="ml-1.5 font-normal" style={{ color: "var(--cream-mute)" }}>{message.model}</span>}
              </div>
              <div className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-[14px] leading-relaxed" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${message.agentColor ?? PURPLE}33`, color: "var(--cream)" }}>{message.content}</div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {activeRound && <div className="flex items-center gap-2.5">
        {speaking && <span className="shrink-0"><AgentAvatar agent={speaking.id as AgentKey} size={26} /></span>}
        <div className="flex items-center gap-1.5 text-[12px]" style={{ color: speaking?.color ?? "var(--cream-mute)" }}>
          {speaking ? `${speaking.name} is thinking` : `Round ${activeRound.status} · ${activeRound.completedAgents}/${activeRound.agentIds.length} replied`}
          <span className="flex gap-0.5">
            {[0, 120, 240].map((delay) => <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ background: speaking?.color ?? PURPLE, animationDelay: `${delay}ms` }} />)}
          </span>
        </div>
      </div>}
      {!activeRound && lastRound?.status === "failed" && <div className="flex justify-center">
        <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px]" style={systemPill("error")}>⚠ Round failed{lastRound.errorCode ? ` · ${lastRound.errorCode}` : ""}</div>
      </div>}
      <div ref={endRef} />
    </div>

    {error && <ClientRuntimeNotice code={error} />}
  </div>;
}

function RoomHeader() {
  return <div className="mb-3 flex items-center gap-3">
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border" style={{ borderColor: "rgba(168,85,247,0.4)", background: "rgba(168,85,247,0.12)", color: PURPLE }}><Users size={20} /></div>
    <div><h1 className="text-2xl font-medium tracking-tight" style={{ color: "var(--cream)" }}>AI Agent <span style={{ color: PURPLE }}>Mastermind</span></h1></div>
  </div>;
}

function systemPill(kind: string) {
  if (kind === "context") return { background: "rgba(34,211,238,0.10)", border: "1px solid rgba(34,211,238,0.3)", color: "var(--cream-dim)" };
  if (kind === "error") return { background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)", color: "#fca5a5" };
  return { background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.35)", color: "var(--cream-dim)" };
}
