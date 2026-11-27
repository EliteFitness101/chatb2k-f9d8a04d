import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity, ArrowLeft, CheckCircle2, CirclePlay, Clapperboard, FileCheck,
  LockKeyhole, RotateCcw, ShieldCheck, Sparkles, Video,
} from "lucide-react";

export const Route = createFileRoute("/demo/no-cappn")({
  head: () => ({
    meta: [
      { title: "No Cappn — Interactive Client Demo | ResoFit" },
      { name: "description", content: "Explore the No Cappn creator-media review and campaign workflow." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: NoCappnClientDemo,
});

const assets = [
  { id: "noble-terra-20261020", title: "Noble_terra · 30-second highlight", creator: "Noble_terra", format: "MP4 · H.264 · 1080×1920 · 30 FPS", duration: "00:30", size: "18.53 MB", source: "BIGO LIVE · room 6968419311726404006", campaign: "Creator highlight review", rights: "HOLD · origin / commercial rights unverified", quality: "Archive verified" },
];

type EventItem = { label: string; detail: string; time: string };
const initialEvents: EventItem[] = [
  { label: "Verified archive record loaded", detail: "Noble_terra BIGO capture · 2026-10-20 17:22:05 UTC · raw and 30-second derivative archived in Dropbox.", time: "Verified record" },
  { label: "Usage rights review", detail: "Usage documentation is part of the campaign review process.", time: "Review workflow" },
];

function NoCappnClientDemo() {
  const [selectedId, setSelectedId] = useState(assets[0].id);
  const [qaDone, setQaDone] = useState(false);
  const [rightsDone, setRightsDone] = useState(false);
  const [approved, setApproved] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [events, setEvents] = useState<EventItem[]>(initialEvents);
  const rightsCleared = false; // Verified registry evidence: this asset remains on rights hold.
  const selected = useMemo(() => assets.find((asset) => asset.id === selectedId) ?? assets[0], [selectedId]);
  const addEvent = (label: string, detail: string) => setEvents((current) => [{ label, detail, time: "Just now" }, ...current].slice(0, 8));
  const reset = () => {
    setQaDone(false); setRightsDone(false); setApproved(false); setHandoff(false);
    setEvents([{ label: "Demo reset", detail: "Workflow state cleared. Fixture records remain unchanged.", time: "Just now" }]);
  };
  const chooseAsset = (id: string) => { setSelectedId(id); setQaDone(false); setRightsDone(false); setApproved(false); setHandoff(false); addEvent("Asset selected", "A new sample asset was opened for review."); };
  const runQa = () => { setQaDone(true); setApproved(false); setHandoff(false); addEvent("Technical archive QA completed", "Verified: 30-second MP4 derivative, 18.53 MB; raw 49.97-second capture archived at 38.77 MB; Dropbox metadata and archive-status readback exist. This does not clear rights."); };
  const checkRights = () => { setRightsDone(true); setApproved(false); setHandoff(false); addEvent("Rights review completed · HOLD", "Registry confirms verified_host=false, allowlist_member=false, commercial_republication_attested=false and configured_republication_authorized=false. Approval remains blocked."); };
  const approve = () => { if (!qaDone || !rightsDone || !rightsCleared) return; setApproved(true); setHandoff(false); addEvent("Approval recorded", "Approval applies only to this browser session."); };
  const prepareHandoff = () => { if (!approved || !rightsCleared) return; setHandoff(true); addEvent("Publishing handoff preview prepared", "A non-executable handoff summary was generated. No channel was contacted."); };

  return (
    <main className="min-h-screen bg-[#08090b] text-[#f4f0e7]">
      <div className="pointer-events-none fixed inset-0 opacity-70" style={{ background: "radial-gradient(ellipse at 10% 0%, rgba(196,157,86,.17), transparent 36%), radial-gradient(ellipse at 90% 35%, rgba(93,74,46,.13), transparent 35%)" }} />
      <header className="relative z-10 border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <a href="/demo" className="inline-flex items-center gap-2 text-sm text-white/65 hover:text-white"><ArrowLeft size={16} /> Ecosystem demo</a>
          <div className="text-right"><div className="text-sm font-semibold tracking-[.2em]">NO CAPPN</div><div className="text-[9px] tracking-[.3em] text-[#c9a76a]">CREATOR MEDIA OPERATIONS</div></div>
        </div>
      </header>
      <section className="relative mx-auto max-w-7xl px-5 pt-8">
        <div className="relative overflow-hidden rounded-3xl border border-[#c9a76a]/25 bg-black shadow-2xl">
          <video className="absolute inset-0 h-full w-full object-cover opacity-45" autoPlay muted loop playsInline preload="metadata" poster="https://www.dropbox.com/scl/fi/hdcqe33veoome2p51mkb5/Noble_terra-20261020T172205Z-cover.jpg?rlkey=y8ircpg84gm0u46fklxkkjkbu&raw=1" src="https://www.dropbox.com/scl/fi/35f0pkz58w2qf89uti4s9/Noble_terra-20261020T172205Z-30s.mp4?rlkey=bm00t7dsikkt219dnrg0gufvw&raw=1" aria-label="No Cappn creator highlight video preview" />
          <div className="relative z-10 grid min-h-[300px] items-end gap-6 p-6 md:min-h-[420px] md:grid-cols-[1fr_auto] md:p-10">
            <div className="max-w-2xl"><span className="inline-flex rounded-full border border-[#d9bd83]/45 bg-black/40 px-3 py-1 text-[10px] uppercase tracking-[.25em] text-[#e2c990]">No Cappn · Creator media studio</span><h2 className="mt-5 font-serif text-4xl leading-tight md:text-6xl">Your live moments.<br/><span className="text-[#e2c990]">Ready for their next audience.</span></h2><p className="mt-4 max-w-xl text-sm leading-6 text-white/75">See a real archived creator highlight, explore the review experience and preview how content moves toward campaign publishing.</p><a href="#source-library" className="mt-6 inline-flex rounded-full bg-[#d2b477] px-6 py-3 text-xs font-semibold text-[#17130d]">Explore the video demo</a></div>
            <div className="rounded-2xl border border-white/20 bg-black/55 p-4 backdrop-blur-md"><div className="text-[9px] uppercase tracking-[.22em] text-[#e2c990]">Featured highlight</div><div className="mt-2 text-sm font-medium">Noble_terra · 00:30</div><div className="mt-1 text-xs text-white/55">Vertical creator video · 1080 × 1920</div><a className="mt-4 inline-block text-xs text-[#e2c990] underline" href="https://www.dropbox.com/scl/fi/35f0pkz58w2qf89uti4s9/Noble_terra-20261020T172205Z-30s.mp4?rlkey=bm00t7dsikkt219dnrg0gufvw&raw=1" target="_blank" rel="noreferrer">Watch full highlight</a></div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.035]"><img className="aspect-[16/9] w-full object-cover" src="https://www.dropbox.com/scl/fi/hdcqe33veoome2p51mkb5/Noble_terra-20261020T172205Z-cover.jpg?rlkey=y8ircpg84gm0u46fklxkkjkbu&raw=1" alt="Creator highlight cover preview"/><div className="p-4"><div className="text-sm font-medium">Creator source</div><p className="mt-1 text-xs leading-5 text-white/45">Start with an archived livestream recording and its source details.</p></div></div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.035]"><img className="aspect-[16/9] w-full object-cover" src="https://www.dropbox.com/scl/fi/hdcqe33veoome2p51mkb5/Noble_terra-20261020T172205Z-cover.jpg?rlkey=y8ircpg84gm0u46fklxkkjkbu&raw=1" alt="Edited vertical highlight preview"/><div className="p-4"><div className="text-sm font-medium">Short-form highlight</div><p className="mt-1 text-xs leading-5 text-white/45">Preview a concise vertical clip designed for social channels.</p></div></div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.035]"><img className="aspect-[16/9] w-full object-cover" src="https://www.dropbox.com/scl/fi/hdcqe33veoome2p51mkb5/Noble_terra-20261020T172205Z-cover.jpg?rlkey=y8ircpg84gm0u46fklxkkjkbu&raw=1" alt="Campaign review cover preview"/><div className="p-4"><div className="text-sm font-medium">Review &amp; campaign flow</div><p className="mt-1 text-xs leading-5 text-white/45">Keep media review, usage rights and campaign handoff in one place.</p></div></div>
        </div>
      </section>
      <section className="relative mx-auto max-w-7xl px-5 pb-10 pt-12">
        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[.25em] text-[#d9bd83]"><Sparkles size={13} /> Creator media preview <span className="rounded-full border border-[#c9a76a]/30 px-3 py-1">Explore instantly</span></div>
        <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div><h1 className="font-serif text-4xl md:text-6xl">From creator source<br /><span className="text-[#d7b979]">to campaign-ready media.</span></h1><p className="mt-5 max-w-2xl leading-7 text-white/55">Explore the creator-media experience with a sample highlight. No login is needed to watch this demo.</p></div>
          <div className="flex gap-3"><button onClick={reset} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-3 text-xs text-white/70 hover:border-white/30"><RotateCcw size={14}/> Reset demo</button><a href="https://wa.me/2348132255842?text=Hello%20ResoFit%2C%20I%27d%20like%20a%20No%20Cappn%20demo." target="_blank" rel="noreferrer" className="rounded-full bg-[#d2b477] px-5 py-3 text-xs font-semibold text-[#17130d]">Book a walkthrough</a></div>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[["01","Sample assets"],[qaDone ? "01" : "00","QA completed"],[rightsDone ? "01" : "00","Rights checklists"],[approved ? "READY" : "PENDING","Approval state"]].map(([value,label]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[.035] p-4"><div className="font-serif text-2xl text-[#dfc58f]">{value}</div><div className="mt-1 text-[10px] uppercase tracking-[.18em] text-white/40">{label}</div></div>)}
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
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">{[["Creator",selected.creator],["Format",selected.format],["Source",selected.source],["Campaign",selected.campaign],["Duration",selected.duration],["Derivative size",selected.size],["Raw capture", "49.97 sec · 38.77 MB"],["Captured at", "20 Oct 2026 · 17:22:05 UTC"]].map(([k,v])=><div key={k} className="rounded-lg bg-white/[.035] p-3"><div className="text-white/35">{k}</div><div className="mt-1 text-white/80">{v}</div></div>)}</div>
            <div className="mt-4 flex flex-wrap gap-2"><a className="rounded-full border border-[#c9a76a]/40 px-4 py-2 text-[11px] text-[#e2c990]" href="https://www.dropbox.com/scl/fi/35f0pkz58w2qf89uti4s9/Noble_terra-20261020T172205Z-30s.mp4?rlkey=bm00t7dsikkt219dnrg0gufvw&raw=1" target="_blank" rel="noreferrer">Open archived 30s video</a><a className="rounded-full border border-white/15 px-4 py-2 text-[11px] text-white/65" href="https://www.dropbox.com/scl/fi/k347mcsusgb0lvgs873fk/Noble_terra-20261020T172205Z-raw.mp4?rlkey=6ah14ummfrfdajo9sta97mz3y&dl=0" target="_blank" rel="noreferrer">Open raw capture</a><a className="rounded-full border border-white/15 px-4 py-2 text-[11px] text-white/65" href="https://www.dropbox.com/scl/fi/hdcqe33veoome2p51mkb5/Noble_terra-20261020T172205Z-cover.jpg?rlkey=y8ircpg84gm0u46fklxkkjkbu&raw=1" target="_blank" rel="noreferrer">Open cover image</a><a className="rounded-full border border-white/15 px-4 py-2 text-[11px] text-white/65" href="https://www.dropbox.com/scl/fi/zhaexd597iiht5atfcheu/Noble_terra-20261020T172205Z.json" target="_blank" rel="noreferrer">Capture metadata</a><a className="rounded-full border border-white/15 px-4 py-2 text-[11px] text-white/65" href="https://www.dropbox.com/scl/fi/a17lzr1rge4p9htjow6qb/Noble_terra-20261020T172205Z-archive-status.json" target="_blank" rel="noreferrer">Archive receipt</a></div>
            <div className="mt-4 overflow-hidden rounded-xl border border-[#c9a76a]/25 bg-black"><video className="aspect-video w-full bg-black object-contain" controls playsInline preload="metadata" poster="https://www.dropbox.com/scl/fi/hdcqe33veoome2p51mkb5/Noble_terra-20261020T172205Z-cover.jpg?rlkey=y8ircpg84gm0u46fklxkkjkbu&raw=1" src="https://www.dropbox.com/scl/fi/35f0pkz58w2qf89uti4s9/Noble_terra-20261020T172205Z-30s.mp4?rlkey=bm00t7dsikkt219dnrg0gufvw&raw=1"><track kind="captions" /></video><div className="flex items-center justify-between gap-3 px-3 py-2"><div><div className="text-xs text-white/75">Noble_terra · archived 30-second highlight</div><div className="text-[10px] text-white/35">Dropbox source · 18.53 MB · 1080×1920</div></div><a className="shrink-0 text-[10px] text-[#e2c990] underline" href="https://www.dropbox.com/scl/fi/35f0pkz58w2qf89uti4s9/Noble_terra-20261020T172205Z-30s.mp4?rlkey=bm00t7dsikkt219dnrg0gufvw&raw=1" target="_blank" rel="noreferrer">Open in Dropbox</a></div></div>
          </div>
        </div>
        <div className="space-y-5">
          <div className="rounded-2xl border border-[#c9a76a]/25 bg-[#141311]/90 p-6 md:p-8">
            <div className="text-[10px] uppercase tracking-[.25em] text-[#c9a76a]">03 / Review and approval</div><h2 className="mt-2 font-serif text-3xl">Move the asset through the workflow.</h2><p className="mt-3 text-sm leading-6 text-white/50">Each control changes the demo state and records a visible event. Complete the review steps to see how campaign approval is handled.</p>
            <div className="mt-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-3"><Activity className="text-[#d9bd83]" /><div><div className="text-sm font-medium">Media quality checks</div><div className="text-xs text-white/40">Metadata, duration and preview manifest</div></div></div><div className="flex items-center gap-3"><span className={"text-[9px] uppercase " + (qaDone ? "text-emerald-300" : "text-white/35")}>{qaDone ? "Passed" : "Not run"}</span><button onClick={runQa} className="rounded-full border border-[#c9a76a]/40 px-4 py-2 text-xs text-[#e2c990]">Run media QA</button></div></div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-3"><FileCheck className="text-[#d9bd83]" /><div><div className="text-sm font-medium">Usage rights review</div><div className="text-xs text-white/40">Registry evidence · host / allowlist / commercial-use status</div></div></div><div className="flex items-center gap-3"><span className={"text-[9px] uppercase " + (rightsDone ? "text-emerald-300" : "text-white/35")}>{rightsDone ? "Reviewed" : "Not reviewed"}</span><button onClick={checkRights} className="rounded-full border border-[#c9a76a]/40 px-4 py-2 text-xs text-[#e2c990]">Review rights</button></div></div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-3"><ShieldCheck className="text-[#d9bd83]" /><div><div className="text-sm font-medium">Campaign approval</div><div className="text-xs text-white/40">Usage documentation</div></div></div><div className="flex items-center gap-3"><span className={"text-[9px] uppercase " + (approved ? "text-emerald-300" : "text-white/35")}>{approved ? "Demo step complete" : rightsDone ? "Review required" : "Awaiting review"}</span><button disabled={!qaDone || !rightsDone || !rightsCleared} onClick={approve} className="rounded-full bg-[#d2b477] px-4 py-2 text-xs font-semibold text-[#17130d] disabled:cursor-not-allowed disabled:opacity-35">Approve sample</button></div></div>
            </div>
            <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[.2em] text-[#d9bd83]"><LockKeyhole size={13}/> 04 / Publishing handoff</div><p className="mt-2 text-xs leading-5 text-white/45">The publishing step follows campaign approval. This product preview does not send or publish content to external channels.</p><button disabled={!approved || !rightsCleared} onClick={prepareHandoff} className="mt-4 w-full rounded-full border border-[#c9a76a]/50 px-5 py-3 text-sm text-[#e2c990] disabled:cursor-not-allowed disabled:opacity-35">Prepare publishing handoff preview</button>
              {handoff && <div className="mt-4 rounded-lg border border-emerald-400/25 bg-emerald-400/[.06] p-4"><div className="flex items-center gap-2 text-sm font-medium text-emerald-200"><CheckCircle2 size={16}/> Handoff preview ready</div><div className="mt-2 text-xs leading-5 text-white/55">Asset: {selected.title}<br/>Campaign: {selected.campaign}<br/>Approval: Demo session only<br/>Destination: Not selected · no post created</div></div>}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#111214] p-6">
            <div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[.25em] text-[#c9a76a]">05 / Evidence trail</div><h3 className="mt-2 font-serif text-2xl">Activity log</h3></div><Clapperboard className="text-[#d9bd83]" /></div>
            <div className="mt-5 space-y-3">{events.map((event,index)=><div key={index} className="flex gap-3 border-l border-[#c9a76a]/35 pl-4"><div className="min-w-0 flex-1"><div className="text-sm font-medium">{event.label}</div><div className="mt-1 text-xs leading-5 text-white/45">{event.detail}</div></div><span className="shrink-0 text-[9px] text-white/30">{event.time}</span></div>)}</div>
          </div>
        </div>
      </section>
      <footer className="relative border-t border-white/10 px-5 py-8 text-center"><div className="text-[10px] uppercase tracking-[.25em] text-[#c9a76a]">ResoFit · No Cappn</div><p className="mt-2 text-[10px] text-white/35">Sample media preview · external channel publishing is not triggered from this page</p><p className="mt-2 text-[10px] text-white/25">Campaign release follows documented usage-rights review and approval.</p></footer>
    </main>
  );
}
