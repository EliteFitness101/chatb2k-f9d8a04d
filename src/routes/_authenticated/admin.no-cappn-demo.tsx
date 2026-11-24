import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity, ArrowUpRight, BadgeCheck, Camera, Check, ChevronRight,
  CircleAlert, Clapperboard, Clock3, Film, Gauge, Instagram, Layers3,
  Play, Plus, Radio, RefreshCw, ShieldCheck, Sparkles, Target, Users,
  Video, Youtube
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/no-cappn-demo")({
  head: () => ({
    meta: [
      { title: "No Cappn Demo — BIGO Agency Command Center" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: NoCappnDemo,
});

type Host = { id: number; name: string; handle: string; state: "LIVE" | "OFFLINE"; clips: number; lastSeen: string };
type Clip = { id: number; host: string; title: string; time: string; qa: "Needs review" | "Approved"; rights: "Demo cleared"; };

const initialHosts: Host[] = [
  { id: 1, name: "MsZap", handle: "NO_CAPPING01", state: "LIVE", clips: 8, lastSeen: "Live now" },
  { id: 2, name: "Noble Terra", handle: "NOBLE_TERRA", state: "OFFLINE", clips: 5, lastSeen: "Today · 14:22" },
  { id: 3, name: "Zaphira", handle: "ZAPHIRA_LIVE", state: "LIVE", clips: 12, lastSeen: "Live now" },
];
const initialClips: Clip[] = [
  { id: 101, host: "MsZap", title: "Creator welcome & live-room energy", time: "Today · 16:42", qa: "Approved", rights: "Demo cleared" },
  { id: 102, host: "Noble Terra", title: "Community interaction highlight", time: "Today · 15:18", qa: "Needs review", rights: "Demo cleared" },
  { id: 103, host: "Zaphira", title: "Host recruitment callout", time: "Today · 13:06", qa: "Approved", rights: "Demo cleared" },
];
const baseCampaigns = [
  { id: 1, name: "November Host Discovery", channel: "TikTok", state: "Creative ready", reach: "—" },
  { id: 2, name: "Creator Community Stories", channel: "Instagram", state: "In review", reach: "—" },
];

const pill = (value: string, good = false) =>
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide " +
  (good ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-amber-300/25 bg-amber-300/10 text-amber-200");

function NoCappnDemo() {
  const [hosts, setHosts] = useState(initialHosts);
  const [clips, setClips] = useState(initialClips);
  const [campaigns, setCampaigns] = useState(baseCampaigns);
  const [selected, setSelected] = useState(101);
  const [campaignName, setCampaignName] = useState("BIGO Host Recruitment · Wave 03");
  const [channel, setChannel] = useState("TikTok");
  const [notice, setNotice] = useState("Demo workspace ready. All activity is simulated.");
  const [captureCount, setCaptureCount] = useState(25);
  const [demoPosts, setDemoPosts] = useState(0);
  const [tab, setTab] = useState("Overview");
  const selectedClip = useMemo(() => clips.find((clip) => clip.id === selected) ?? clips[0], [clips, selected]);

  function simulateCapture() {
    const nextId = Math.max(...clips.map((clip) => clip.id), 100) + 1;
    const host = hosts[0];
    setClips((current) => [{ id: nextId, host: host.name, title: "New live-room moment · demo capture", time: "Just now", qa: "Needs review", rights: "Demo cleared" }, ...current]);
    setCaptureCount((count) => count + 1);
    setSelected(nextId);
    setNotice("Simulated capture added to the demo media queue. No BIGO account or recorder was contacted.");
    setTab("Media Studio");
  }
  function reviewClip() {
    if (!selectedClip) return;
    setClips((current) => current.map((clip) => clip.id === selectedClip.id ? { ...clip, qa: "Approved" } : clip));
    setNotice("Demo QA approved. This is a local simulation and does not change production asset records.");
  }
  function createCampaign() {
    const name = campaignName.trim();
    if (!name) { setNotice("Enter a campaign name before creating the demo campaign."); return; }
    setCampaigns((current) => [{ id: Date.now(), name, channel, state: "Draft · demo", reach: "—" }, ...current]);
    setNotice("Demo campaign created locally. No external channel was connected.");
    setTab("Campaigns");
  }
  function simulatePublish(id: number) {
    setCampaigns((current) => current.map((campaign) => campaign.id === id ? { ...campaign, state: "Published · demo" } : campaign));
    setDemoPosts((count) => count + 1);
    setNotice("Demo publishing lifecycle completed locally. No post was sent to TikTok, Instagram or YouTube.");
  }

  const stats = [
    { label: "Registered hosts", value: String(hosts.length), note: "Sample workspace", icon: Users },
    { label: "Capture events", value: String(captureCount), note: "Demo counter", icon: Camera },
    { label: "Media assets", value: String(clips.length), note: "Local sample queue", icon: Film },
    { label: "Demo posts", value: String(demoPosts), note: "Not externally published", icon: Activity },
  ];

  return (
    <main className="min-h-screen bg-[#090909] text-[#f5f1e8]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-7 lg:px-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/20 bg-amber-200/[0.06] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-200/10 text-amber-200"><Sparkles size={18}/></span>
            <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-200">Interactive demo environment</p><p className="mt-0.5 text-xs text-white/55">Sample records only · no production writes · no real publishing</p></div>
          </div>
          <a href="/admin/no-cappn" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs hover:bg-white/5">Production operator view <ArrowUpRight size={14}/></a>
        </div>

        <header className="flex flex-col justify-between gap-5 border-b border-white/10 pb-7 md:flex-row md:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.42em] text-amber-200/80">ResoFit · No Cappn</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Agency Media Command</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/55">BIGO host operations, highlight review and creator recruitment distribution — with a safe, interactive walkthrough.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/50"><span className="h-2 w-2 rounded-full bg-emerald-400"/><span>Demo system online</span><span className="mx-1 text-white/20">·</span><Clock3 size={13}/> Sample clock</div>
        </header>

        <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-white/10 pb-3">
          {["Overview", "Hosts", "Media Studio", "Campaigns"].map((item) => <button key={item} onClick={() => setTab(item)} className={"whitespace-nowrap rounded-full px-4 py-2 text-xs transition " + (tab === item ? "bg-amber-200 text-black" : "text-white/55 hover:bg-white/5 hover:text-white")}>{item}</button>)}
        </nav>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/60"><CircleAlert size={15} className="mt-0.5 shrink-0 text-amber-200"/><span>{notice}</span></div>

        {tab === "Overview" && <>
          <section className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {stats.map(({ label, value, note, icon: Icon }) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5"><div className="flex items-center justify-between text-white/45"><span className="text-[10px] uppercase tracking-[0.18em]">{label}</span><Icon size={16}/></div><p className="mt-4 text-3xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-[11px] text-white/40">{note}</p></div>)}
          </section>
          <section className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
              <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Host operations</p><h2 className="mt-1 text-lg font-semibold">BIGO source monitor</h2></div><Radio size={18} className="text-amber-200"/></div>
              <div className="mt-4 space-y-2">{hosts.map((host) => <div key={host.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/20 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{host.name}</p><p className="mt-1 truncate text-[10px] text-white/40">{host.handle} · {host.clips} sample clips</p></div><div className="text-right"><span className={pill(host.state, host.state === "LIVE")}>{host.state === "LIVE" ? "● LIVE" : "OFFLINE"}</span><p className="mt-1 text-[10px] text-white/35">{host.lastSeen}</p></div></div>)}</div>
              <button onClick={simulateCapture} className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-200 px-4 py-2.5 text-xs font-bold text-black hover:bg-amber-100"><Play size={14}/> Simulate capture event</button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Pipeline health</p><h2 className="mt-1 text-lg font-semibold">Demo lifecycle</h2>
              <div className="mt-5 space-y-4">{[{n:"01",t:"Host source registry",d:"Sample host profiles loaded"},{n:"02",t:"Capture & archive",d:"Simulated event queue"},{n:"03",t:"Rights & QA",d:"Demo clearance labels only"},{n:"04",t:"Creative & campaign",d:"Local draft builder"},{n:"05",t:"Distribution",d:"Simulated publishing receipt"}].map((s) => <div key={s.n} className="flex gap-3"><span className="text-[10px] text-amber-200/70">{s.n}</span><div><p className="text-xs font-medium">{s.t}</p><p className="mt-1 text-[10px] text-white/40">{s.d}</p></div><span className="ml-auto text-emerald-300"><Check size={14}/></span></div>)}</div>
            </div>
          </section>
        </>}

        {tab === "Hosts" && <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.2em] text-white/45">Agency roster</p><h2 className="mt-1 text-xl font-semibold">Host profiles</h2></div><Users className="text-amber-200"/></div><div className="mt-5 grid gap-3 md:grid-cols-3">{hosts.map((host) => <article key={host.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between"><span className={pill(host.state, host.state === "LIVE")}>{host.state}</span><span className="text-[10px] text-white/35">DEMO HOST</span></div><h3 className="mt-4 text-lg font-semibold">{host.name}</h3><p className="mt-1 text-xs text-white/45">{host.handle}</p><div className="mt-5 flex justify-between border-t border-white/10 pt-3 text-xs"><span className="text-white/45">Sample clips</span><strong>{host.clips}</strong></div></article>)}</div></section>}

        {tab === "Media Studio" && <section className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]"><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><p className="text-xs uppercase tracking-[0.2em] text-white/45">Asset review</p><h2 className="mt-1 text-xl font-semibold">Highlight queue</h2><div className="mt-4 space-y-2">{clips.map((clip) => <button key={clip.id} onClick={() => setSelected(clip.id)} className={"w-full rounded-xl border p-3 text-left " + (selected === clip.id ? "border-amber-200/50 bg-amber-200/[0.07]" : "border-white/10 bg-black/20")}><p className="text-sm font-medium">{clip.title}</p><p className="mt-1 text-[10px] text-white/40">{clip.host} · {clip.time}</p><div className="mt-2 flex gap-2"><span className={pill(clip.qa, clip.qa === "Approved")}>{clip.qa}</span><span className={pill("DEMO CLEARED", true)}>DEMO CLEARED</span></div></button>)}</div><button onClick={simulateCapture} className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs hover:bg-white/5"><RefreshCw size={13}/> Add sample capture</button></div><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.2em] text-white/45">Selected highlight</p><h2 className="mt-1 text-xl font-semibold">{selectedClip?.host ?? "No clip selected"}</h2></div><Clapperboard className="text-amber-200"/></div><div className="mt-5 grid aspect-video place-items-center rounded-xl border border-white/10 bg-[radial-gradient(ellipse_at_center,_rgba(214,178,104,0.12),_transparent_65%),#111]"><div className="text-center"><Video size={34} className="mx-auto text-amber-200/70"/><p className="mt-3 text-xs text-white/55">Preview placeholder · demo media only</p><p className="mt-1 text-[10px] text-white/30">No real video file is attached to this sample record</p></div></div>{selectedClip && <><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-lg bg-black/20 p-3"><p className="text-[10px] text-white/40">Technical QA</p><p className="mt-1 text-sm">{selectedClip.qa}</p></div><div className="rounded-lg bg-black/20 p-3"><p className="text-[10px] text-white/40">Rights state</p><p className="mt-1 text-sm">{selectedClip.rights}</p></div></div><button onClick={reviewClip} disabled={selectedClip.qa === "Approved"} className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-200 px-4 py-2.5 text-xs font-bold text-black disabled:opacity-40"><ShieldCheck size={14}/> Mark demo QA approved</button></>}</div></section>}

        {tab === "Campaigns" && <section className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]"><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><p className="text-xs uppercase tracking-[0.2em] text-white/45">Campaign builder</p><h2 className="mt-1 text-xl font-semibold">Create recruitment campaign</h2><label className="mt-5 block text-[10px] uppercase tracking-wider text-white/45">Campaign name</label><input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none focus:border-amber-200/50"/><label className="mt-4 block text-[10px] uppercase tracking-wider text-white/45">Distribution channel</label><select value={channel} onChange={(e) => setChannel(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#111] px-3 py-3 text-sm"><option>TikTok</option><option>Instagram</option><option>YouTube</option></select><button onClick={createCampaign} className="mt-5 inline-flex items-center gap-2 rounded-full bg-amber-200 px-4 py-2.5 text-xs font-bold text-black"><Plus size={14}/> Create demo campaign</button><p className="mt-3 text-[10px] text-white/35">Campaigns are held in browser state and disappear when the demo is refreshed.</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><p className="text-xs uppercase tracking-[0.2em] text-white/45">Campaign workspace</p><h2 className="mt-1 text-xl font-semibold">Creative & distribution queue</h2><div className="mt-4 space-y-3">{campaigns.map((campaign) => <div key={campaign.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">{campaign.name}</h3><p className="mt-1 text-[10px] text-white/40">{campaign.channel} · Demo campaign</p></div><span className={pill(campaign.state, campaign.state.includes("Published"))}>{campaign.state}</span></div><div className="mt-4 flex items-center justify-between"><span className="text-[10px] text-white/35">External reach: {campaign.reach}</span><button onClick={() => simulatePublish(campaign.id)} disabled={campaign.state.includes("Published")} className="rounded-full border border-amber-200/35 px-3 py-1.5 text-[10px] text-amber-100 disabled:opacity-40">Simulate publish</button></div></div>)}</div></div></section>}

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-[10px] text-white/35"><span>NO CAPPN · RESOFIT INTERNAL DEMO · SAMPLE DATA ONLY</span><span className="flex items-center gap-2"><BadgeCheck size={13}/> Isolated from production actions</span></footer>
      </div>
    </main>
  );
}
