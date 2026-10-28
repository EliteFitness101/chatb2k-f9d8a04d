import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Volume2, VolumeX, Sparkles, UserRound, ShieldCheck } from "lucide-react";

type ChatMessage = { role: "assistant" | "user"; text: string };
const welcome = "Hello, welcome to the ResoFit ecosystem. I’m Coach B2K, your ChatB2K onboarding assistant. I can help you find your dashboard, start onboarding, explore Elite Media, or route a request to the right support team. What would you like to do today?";
const quickActions = [
  { label: "Start onboarding", text: "I want to start onboarding." },
  { label: "Find my dashboard", text: "Help me find my dashboard." },
  { label: "Elite Media", text: "Tell me about Elite Media." },
  { label: "Technical support", text: "I need technical support." },
  { label: "Talk to a person", text: "I want to talk to a human support representative." },
];
function replyFor(input: string) {
  const q = input.toLowerCase();
  if (q.includes("onboard") || q.includes("start")) return "Let’s get you started. First, sign in or create your account. Then tell us your role, your main goal, and which ResoFit or Elite service you want to use. I’ll guide you one step at a time.";
  if (q.includes("dashboard") || q.includes("login") || q.includes("sign in")) return "Your next step is to sign in to the service you registered for. If you’re unsure which dashboard applies, tell me the product or service name—please don’t send passwords or verification codes.";
  if (q.includes("media") || q.includes("video") || q.includes("creator")) return "Elite Media supports creator and business content workflows. I can help you find the right offer and onboarding route. Actual video generation or rendering depends on the connected production worker and account entitlement.";
  if (q.includes("technical") || q.includes("devops") || q.includes("error") || q.includes("bug")) return "I can help triage the issue. Share the page or service, what you expected, what happened, and any non-sensitive error message. I won’t claim a fix has shipped until it’s verified.";
  if (q.includes("human") || q.includes("person") || q.includes("agent") || q.includes("support")) return "I’ll help prepare your support request. Include the service, a short description, and the best way for the authorised team to reach you. I can’t promise a live human handoff unless that channel is connected.";
  if (q.includes("privacy") || q.includes("trust") || q.includes("security")) return "Your safety matters. Never share passwords, API keys, payment card details, or one-time codes here. For account-specific actions, use the official sign-in and support routes.";
  return "I’m with you. To guide you accurately, tell me which service you’re using, what you’re trying to accomplish, and where you got stuck. I’ll clarify the next step and distinguish guidance from actions that need a connected system.";
}
export default function CoachB2KAssist() {
  const [open, setOpen] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", text: welcome }]);
  const [speaking, setSpeaking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);
  useEffect(() => () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);
  function speak(text: string) {
    if (!voiceOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.96; utterance.pitch = 1.03;
    utterance.onstart = () => setSpeaking(true); utterance.onend = () => setSpeaking(false); utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }
  function send(text = input) {
    const clean = text.trim(); if (!clean) return;
    const answer = replyFor(clean);
    setMessages(current => [...current, { role: "user", text: clean }, { role: "assistant", text: answer }]);
    setInput(""); speak(answer);
  }
  return <div className="cb2k-assist-root" aria-label="ChatB2K AI onboarding assistant">
    {open && <section className="cb2k-assist-panel" role="dialog" aria-modal="false" aria-label="Coach B2K chat assistant">
      <header className="cb2k-assist-header">
        <div className="cb2k-assist-avatar" aria-hidden="true"><span>B2K</span><i /></div>
        <div className="cb2k-assist-heading"><strong>Coach B2K</strong><span>{speaking ? "Speaking to you" : "AI onboarding concierge · Online"}</span></div>
        <button className="cb2k-assist-icon" onClick={() => setVoiceOn(v => !v)} aria-label={voiceOn ? "Turn voice off" : "Turn voice on"} title={voiceOn ? "Turn voice off" : "Turn voice on"}>{voiceOn ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button>
        <button className="cb2k-assist-icon" onClick={() => setOpen(false)} aria-label="Close chat"><X size={20}/></button>
      </header>
      <div className="cb2k-assist-trust"><ShieldCheck size={14}/> Compassionate guidance · Clear next steps · No password requests</div>
      <div className="cb2k-assist-messages" aria-live="polite">
        {messages.map((message, i) => <div key={i} className={`cb2k-assist-message ${message.role}`}>
          {message.role === "assistant" && <div className="cb2k-assist-mini">B2K</div>}
          <p>{message.text}</p>
          {message.role === "assistant" && voiceOn && <button className="cb2k-assist-replay" onClick={() => speak(message.text)}><Volume2 size={13}/> Listen</button>}
        </div>)}<div ref={bottomRef}/>
      </div>
      {messages.length === 1 && <div className="cb2k-assist-quick">{quickActions.map(action => <button key={action.label} onClick={() => send(action.text)}>{action.label}<span>↗</span></button>)}</div>}
      <form className="cb2k-assist-compose" onSubmit={e => { e.preventDefault(); send(); }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Tell Coach B2K how to help…" aria-label="Message Coach B2K" maxLength={1200}/>
        <button type="submit" aria-label="Send message" disabled={!input.trim()}><Send size={17}/></button>
      </form>
      <footer className="cb2k-assist-footer"><Sparkles size={12}/> Powered by ChatB2K · ResoFit ecosystem</footer>
    </section>}
    <button className={`cb2k-assist-launcher ${open ? "is-open" : ""}`} onClick={() => setOpen(v => !v)} aria-label={open ? "Close Coach B2K assistant" : "Open Coach B2K assistant"}>
      {open ? <X size={22}/> : <span className="cb2k-assist-launcher-face"><UserRound size={21}/><i/></span>}
      {!open && <span className="cb2k-assist-launcher-copy"><strong>Coach B2K</strong><small>How can I help?</small></span>}{!open && <MessageCircle size={19}/>}
    </button>
  </div>;
}
