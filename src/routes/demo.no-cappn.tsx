import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity, ArrowLeft, CheckCircle2, CirclePlay, Clapperboard, FileCheck,
  LockKeyhole, RotateCcw, ShieldCheck, Sparkles, Video, XCircle,
} from "lucide-react";

export const Route = createFileRoute("/demo/no-cappn")({
  head: () => ({
    meta: [
      { title: "No Cappn — Interactive Client Demo | ResoFit" },
      { name: "description", content: "Explore a working, fixture-based No Cappn creator media review and campaign-readiness workflow." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: NoCappnClientDemo,
});

const assets = [
  { id: "asset-01", title: "Creator highlight · Sample 01", creator: "Creator profile A", format: "MP4 video", duration: "00:18", size: "8.4 MB", source: "Demo source / BIGO", campaign: "Summer training stories", rights: "Pending review", quality: "Ready to scan" },
  { id: "asset-02", title: "Workout tutorial · Sample 02", creator: "Creator profile B", format: "MP4 video", duration: "00:32", size: "14.2 MB", source: "Demo source / Upload", campaign: "Fitness education", rights: "Pending review", quality: "Ready to scan" },
  { id: "asset-03", title: "Campaign teaser · Sample 03", creator: "Creator profile C", format: "MP4 video", duration: "00:12", size: "5.1 MB", source: "Demo source / BIGO", campaign: "Partner launch", rights: "Pending review", quality: "Ready to scan" },
];

type EventItem = { label: string; detail: string; time: string };
const initialEvents: EventItem[] = [
  { label: "Demo workspace opened", detail: "Three fictional assets loaded from the local demo fixture.", time: "Just now" },
];

function NoCappnClientDemo() {
  const [selectedId, setSelectedId] = useState(assets[0].id);
  const [qaDone, setQaDone] = useState(false);
  const [rightsDone, setRightsDone] = useState(false);
  const [approved, setApproved] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [events, setEvents] = useState<EventItem[]>(initialEvents);
  const selected = useMemo(() => assets.find((asset) => asset.id === selectedId) ?? assets[0], [selectedId]);
  const addEvent = (label: string, detail: string) => setEvents((current) => [{ label, detail, time: "Just now" }, ...current].slice(0, 8));
  const reset = () => {
    setQaDone(false); setRightsDone(false); setApproved(false); setHandoff(false);
    setEvents([{ label: "Demo reset", detail: "Workflow state cleared. Fixture records remain unchanged.", time: "Just now" }]);
  };
  const chooseAsset = (id: string) => { setSelectedId(id); setQaDone(false); setRightsDone(false); setApproved(false); setHandoff(false); addEvent("Asset selected", "A new sample asset was opened for review."); };
  const runQa = () => { setQaDone(true); setApproved(false); setHandoff(false); addEvent("Media QA completed", "Sample checks passed: file metadata present, duration valid, preview manifest available."); };
  const checkRights = () => { setRightsDone(true); setApproved(false); setHandoff(false); addEvent("Rights checklist reviewed", "Demo consent and usage fields are present. Real-world rights still require documentary verification."); };
  const approve = () => { if (!qaDone || !rightsDone) return; setApproved(true); setHandoff(false); addEvent("Demo approval recorded", "Approval applies only to this browser session and fictional asset."); };
  const prepareHandoff = () => { if (!approved) return; setHandoff(true); addEvent("Publishing handoff preview prepared", "A non-executable handoff summary was generated. No channel was contacted."); };

  return (
    <main className="min-h-screen bg-[#08090b] text-[#f4f0e7]">
      <div className="pointer-events-none fixed inset-0 opacity-70" style={{ background: "radial-gradient(ellipse at 10% 0%, rgba(196,157,86,.17), transparent 36%), radial-gradient(ellipse at 90% 35%, rgba(93,74,46,.13), transparent 35%)" }} />
      <header className="relative z-10 border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <a href="/demo" className="inline-flex items-center gap-2 text-sm text-white/65 hover:text-white"><ArrowLeft size={16} /> Ecosystem demo</a>
          <div className="text-right"><div className="text-sm font-semibold tracking-[.2em]">NO CAPPN</div><div className="text-[9px] tracking-[.3em] text-[#c9a76a]">CREATOR MEDIA OPERATIONS</div></div>
        </div>
      </header>
      <section className="relative mx-auto max-w-7xl px-5 pb-10 pt-12">
        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[.25em] text-[#d9bd83]"><Sparkles size={13} /> Interactive client sandbox <span className="rounded-full border border-[#c9a76a]/30 px-3 py-1">Fixture data only</span></div>
        <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div><h1 className="font-serif text-4xl md:text-6xl">From creator source<br /><span className="text-[#d7b979]">to campaign-ready media.</span></h1><p className="mt-5 max-w-2xl leading-7 text-white/55">Walk through a realistic creator-media workflow: select an asset, run media checks, review usage rights, record an approval and prepare a publishing handoff.</p></div>
          <div className="flex gap-3"><button onClick={reset} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-3 text-xs text-white/70 hover:border-white/30"><RotateCcw size={14}/> Reset demo</button><a href="https://wa.me/2348132255842?text=Hello%20ResoFit%2C%20I%27d%20like%20a%20No%20Cappn%20demo." target="_blank" rel="noreferrer" className="rounded-full bg-[#d2b477] px-5 py-3 text-xs font-semibold text-[#17130d]">Book a walkthrough</a></div>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[["03","Sample assets"],[qaDone ? "01" : "00","QA completed"],[rightsDone ? "01" : "00","Rights checklists"],[approved ? "READY" : "PENDING","Approval state"]].map(([value,label]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[.035] p-4"><div className="font-serif text-2xl text-[#dfc58f]">{value}</div><div className="mt-1 text-[10px] uppercase tracking-[.18em] text-white/40">{label}</div></div>)}
        </div>
      </section>
      <section className="relative mx-auto grid max-w-7xl gap-6 px-5 pb-20 xl:grid-cols-[.8fr_1.2fr]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
            <div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[.25em] text-[#c9a76a]">01 / Source library</div><h2 className="mt-2 font-serif text-2xl">Select a sample asset</h2></div><Video className="text-[#d9bd83]" /></div>
            <div className="mt-5 space-y-2">{assets.map((asset) => <button key={asset.id} onClick={() => chooseAsset(asset.id)} className={"w-full rounded-xl border p-4 text-left transition " + (selectedId === asset.id ? "border-[#c9a76a]/70 bg-[#c9a76a]/10" : "border-white/10 bg-black/20 hover:border-white/25")}><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium">{asset.title}</div><div className="mt-1 text-xs text-white/45">{asset.creator} · {asset.duration} · {asset.size}</div></div><span className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-white/40">{selectedId === asset.id ? "SELECTED" : "SAMPLE"}</span></div></button>)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#111214] p-5">
            <div className="text-[10px] uppercase tracking-[.25em] text-[#c9a76a]">02 / Asset details</div><h3 className="mt-2 font-serif text-2xl">{selected.title}</h3>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">{[["Creator",selected.creator],["Format",selected.format],["Source",selected.source],["Campaign",selected.campaign],["Duration",selected.duration],["File size",selected.size]].map(([k,v])=><div key={k} className="rounded-lg bg-white/[.035] p-3"><div className="text-white/35">{k}</div><div className="mt-1 text-white/80">{v}</div></div>)}</div>
            <div className="mt-4 flex aspect-video items-center justify-center rounded-xl border border-dashed border-[#c9a76a]/25 bg-[radial-gradient(ellipse_at_center,rgba(201,167,106,.12),transparent_65%)]"><div className="text-center"><CirclePlay size={36} className="mx-auto text-[#d9bd83]" /><div className="mt-2 text-xs text-white/55">Sample media preview</div><div className="mt-1 text-[10px] text-white/30">Illustrative preview · no source video loaded</div></div></div>
          </div>
        </div>
        <div className="space-y-5">
          <div className="rounded-2xl border border-[#c9a76a]/25 bg-[#141311]/90 p-6 md:p-8">
            <div className="text-[10px] uppercase tracking-[.25em] text-[#c9a76a]">03 / Review and approval</div><h2 className="mt-2 font-serif text-3xl">Move the asset through the workflow.</h2><p className="mt-3 text-sm leading-6 text-white/50">Each control changes the demo state and records a visible event. Approval is blocked until both review checks are complete.</p>
            <div className="mt-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-3"><Activity className="text-[#d9bd83]" /><div><div className="text-sm font-medium">Media quality checks</div><div className="text-xs text-white/40">Metadata, duration and preview manifest</div></div></div><div className="flex items-center gap-3"><span className={"text-[9px] uppercase " + (qaDone ? "text-emerald-300" : "text-white/35")}>{qaDone ? "Passed" : "Not run"}</span><button onClick={runQa} className="rounded-full border border-[#c9a76a]/40 px-4 py-2 text-xs text-[#e2c990]">Run media QA</button></div></div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-3"><FileCheck className="text-[#d9bd83]" /><div><div className="text-sm font-medium">Usage rights review</div><div className="text-xs text-white/40">Consent and permitted-use checklist</div></div></div><div className="flex items-center gap-3"><span className={"text-[9px] uppercase " + (rightsDone ? "text-emerald-300" : "text-white/35")}>{rightsDone ? "Reviewed" : "Not reviewed"}</span><button onClick={checkRights} className="rounded-full border border-[#c9a76a]/40 px-4 py-2 text-xs text-[#e2c990]">Review rights</button></div></div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-3"><ShieldCheck className="text-[#d9bd83]" /><div><div className="text-sm font-medium">Campaign approval</div><div className="text-xs text-white/40">Human approval checkpoint</div></div></div><div className="flex items-center gap-3"><span className={"text-[9px] uppercase " + (approved ? "text-emerald-300" : "text-white/35")}>{approved ? "Approved in demo" : "Awaiting checks"}</span><button disabled={!qaDone || !rightsDone} onClick={approve} className="rounded-full bg-[#d2b477] px-4 py-2 text-xs font-semibold text-[#17130d] disabled:cursor-not-allowed disabled:opacity-35">Approve sample</button></div></div>
            </div>
            <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[.2em] text-[#d9bd83]"><LockKeyhole size={13}/> 04 / Publishing handoff</div><p className="mt-2 text-xs leading-5 text-white/45">See the channel-ready summary that would be handed to an authorised publisher. This demo does not publish, upload, capture or contact any channel.</p><button disabled={!approved} onClick={prepareHandoff} className="mt-4 w-full rounded-full border border-[#c9a76a]/50 px-5 py-3 text-sm text-[#e2c990] disabled:cursor-not-allowed disabled:opacity-35">Prepare publishing handoff preview</button>
              {handoff && <div className="mt-4 rounded-lg border border-emerald-400/25 bg-emerald-400/[.06] p-4"><div className="flex items-center gap-2 text-sm font-medium text-emerald-200"><CheckCircle2 size={16}/> Handoff preview ready</div><div className="mt-2 text-xs leading-5 text-white/55">Asset: {selected.title}<br/>Campaign: {selected.campaign}<br/>Approval: Demo session only<br/>Destination: Not selected · no post created</div></div>}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#111214] p-6">
            <div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[.25em] text-[#c9a76a]">05 / Evidence trail</div><h3 className="mt-2 font-serif text-2xl">Activity log</h3></div><Clapperboard className="text-[#d9bd83]" /></div>
            <div className="mt-5 space-y-3">{events.map((event,index)=><div key={index} className="flex gap-3 border-l border-[#c9a76a]/35 pl-4"><div className="min-w-0 flex-1"><div className="text-sm font-medium">{event.label}</div><div className="mt-1 text-xs leading-5 text-white/45">{event.detail}</div></div><span className="shrink-0 text-[9px] text-white/30">{event.time}</span></div>)}</div>
          </div>
        </div>
      </section>
      <footer className="relative border-t border-white/10 px-5 py-8 text-center"><div className="text-[10px] uppercase tracking-[.25em] text-[#c9a76a]">ResoFit · No Cappn</div><p className="mt-2 text-[10px] text-white/35">Client sandbox · fictional records · no production writes or external actions</p><p className="mt-2 text-[10px] text-white/25">Real source capture, storage, rights evidence and publishing remain separate authorised workflows.</p></footer>
    </main>
  );
}
