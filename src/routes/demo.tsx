import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity, ArrowRight, Bot, CheckCircle2, ChevronRight, CirclePlay, Clapperboard,
  Dumbbell, Globe2, Layers3, MessageCircle, RadioTower, ShieldCheck, ShoppingBag,
  Sparkles, Users, Workflow, X,
} from "lucide-react";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "ResoFit Ecosystem Demo — ChatB2K Intelligence" },
      { name: "description", content: "Explore the ResoFit and ChatB2K client experience: wellness, AI-assisted customer journeys, commerce, creator growth, media operations and business intelligence." },
      { property: "og:title", content: "ResoFit Ecosystem Demo" },
      { property: "og:description", content: "One connected ecosystem for customer journeys, wellness, commerce and creator operations." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: EcosystemDemo,
});

const modules = [
  { id: "chat", icon: Bot, name: "ChatB2K Intelligence", tag: "AI customer journeys", desc: "Turn customer intent into guided discovery, recommendations, conversion and follow-up.", points: ["Intent-led conversations", "Context-aware routing", "Journey and referral continuity"] },
  { id: "wellness", icon: Dumbbell, name: "ResoFit Wellness", tag: "Member experience", desc: "Connect fitness goals with training, nutrition, coaching and progress experiences.", points: ["Goal and needs discovery", "Training and nutrition pathways", "Membership and coaching journeys"] },
  { id: "commerce", icon: ShoppingBag, name: "Commerce & Fulfilment", tag: "Digital commerce", desc: "Bring product discovery, checkout and fulfilment into a coherent customer pathway.", points: ["Product and offer discovery", "Checkout hand-off", "Order and fulfilment visibility"] },
  { id: "elite", icon: Users, name: "Elite NG", tag: "Talent marketplace", desc: "Support talent discovery, onboarding, profile management and opportunity workflows.", points: ["Talent profiles and portfolios", "Application and onboarding flows", "Opportunity and partner journeys"] },
  { id: "nocappn", icon: RadioTower, name: "No Cappn", tag: "Creator & media operations", desc: "A governed workspace concept for creator sources, media review, rights checks and campaign readiness.", points: ["Source and creator registry", "Media and rights review", "Campaign preparation and audit trail"] },
  { id: "media", icon: Clapperboard, name: "Media & Distribution", tag: "Content operations", desc: "Organise approved creative assets and prepare content for channel distribution.", points: ["Asset library and metadata", "Creative review checkpoints", "Publishing status and receipts"] },
  { id: "intelligence", icon: Activity, name: "Business Intelligence", tag: "Operations visibility", desc: "Give teams a clearer view of customer activity, workflow health and operational outcomes.", points: ["Operational dashboards", "Journey and funnel visibility", "Evidence-led status reporting"] },
  { id: "automation", icon: Workflow, name: "Workflow Automation", tag: "Connected operations", desc: "Coordinate repeatable tasks across teams while keeping approvals and governance explicit.", points: ["Event-driven workflow concepts", "Human approval checkpoints", "Traceable execution states"] },
];

const steps = [
  ["Discover", "A prospective customer shares a goal or business need."],
  ["Assess", "The experience gathers relevant context and intent."],
  ["Recommend", "Eligible pathways, services or products are presented."],
  ["Convert", "The customer is guided to the appropriate next action."],
  ["Fulfil", "The team coordinates delivery and service operations."],
  ["Retain", "Follow-up supports continuity and future engagement."],
];

function EcosystemDemo() {
  const [active, setActive] = useState("chat");
  const [scenario, setScenario] = useState("wellness");
  const [ran, setRan] = useState(false);
  const [showNotice, setShowNotice] = useState(true);
  const selected = modules.find((item) => item.id === active) ?? modules[0];
  const Icon = selected.icon;

  const scenarioCopy: Record<string, { title: string; prompt: string; result: string; route: [string, string][] }> = {
    wellness: { title: "A customer wants a wellness plan", prompt: "“I want to improve my fitness and need help getting started.”", result: "Suggested pathway: goal discovery → training and nutrition options → coaching or membership enquiry.", route: [["Discover", "Goal captured from the member enquiry."], ["Assess", "Training needs and constraints are clarified."], ["Recommend", "Relevant training and nutrition pathways are presented."], ["Convert", "Coaching or membership enquiry is prepared."], ["Fulfil", "Service onboarding can be completed by the team."], ["Retain", "Progress check-ins support continuity."]] },
    commerce: { title: "A customer is choosing equipment", prompt: "“I need equipment that fits my home and training goals.”", result: "Suggested pathway: use-case discovery → suitable product categories → shop hand-off → fulfilment follow-up.", route: [["Discover", "Equipment use case and budget are captured."], ["Assess", "Space and training requirements are clarified."], ["Recommend", "Suitable product categories are presented."], ["Convert", "Customer is handed to the shop checkout."], ["Fulfil", "Order and delivery follow-up are prepared."], ["Retain", "Post-purchase support and related needs are surfaced."]] },
    creator: { title: "A creator team is preparing a campaign", prompt: "“We need to review creator content before using it in a campaign.”", result: "Suggested pathway: source registry → asset review → rights and quality checks → campaign approval.", route: [["Source registry", "Creator source selected."], ["Asset review", "Submitted media is reviewed."], ["Rights checks", "Usage rights and quality checks are highlighted."], ["Campaign approval", "Operator approval remains required."], ["Distribution", "Approved assets can be handed to the existing publisher."], ["Receipt review", "Publishing receipts provide evidence."]] },
    talent: { title: "A talent applicant wants to join", prompt: "“I want to create a profile and apply for opportunities.”", result: "Suggested pathway: applicant profile → portfolio submission → review → opportunity follow-up.", route: [["Applicant intent", "Talent application interest captured."], ["Profile setup", "Applicant profile pathway opened."], ["Portfolio submission", "Portfolio checklist and assets prepared."], ["Review", "Application review hand-off prepared."], ["Opportunity match", "Eligible opportunity pathway identified."], ["Follow-up", "Applicant follow-up is prepared."]] },
  };
  const activeScenario = scenarioCopy[scenario];

  return (
    <main className="min-h-screen bg-[#08090b] text-[#f4f0e7]">
      <div className="pointer-events-none fixed inset-0 opacity-70" style={{ background: "radial-gradient(ellipse at 12% 0%, rgba(196,157,86,.17), transparent 36%), radial-gradient(ellipse at 90% 38%, rgba(93,74,46,.13), transparent 35%)" }} />
      <header className="relative z-10 border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <a href="https://www.resofit.fit" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-[#c9a76a]/50 bg-[#c9a76a]/10 text-[#d9bd83]"><Layers3 size={20} /></div>
            <div><div className="text-sm font-semibold tracking-[.2em]">RESOFIT</div><div className="text-[9px] tracking-[.3em] text-[#c9a76a]">CONNECTED ECOSYSTEM</div></div>
          </a>
          <div className="hidden items-center gap-6 text-xs text-white/60 md:flex"><a href="#platform" className="hover:text-white">Platform</a><a href="#journey" className="hover:text-white">Customer journey</a><a href="#governance" className="hover:text-white">Governance</a></div>
          <a href="https://wa.me/2348132255842?text=Hello%20ResoFit%2C%20I%27d%20like%20a%20consultation%20about%20the%20ecosystem." target="_blank" rel="noreferrer" className="rounded-full bg-[#d2b477] px-4 py-2.5 text-xs font-semibold text-[#17130d] hover:bg-[#e2c990]">Talk to the team <ArrowRight className="ml-1 inline" size={14} /></a>
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-5 pb-20 pt-20 md:pb-28 md:pt-28">
        <div className="max-w-4xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#c9a76a]/30 bg-[#c9a76a]/10 px-4 py-2 text-[10px] uppercase tracking-[.24em] text-[#dfc58f]"><Sparkles size={13} /> Interactive client preview</div>
          <p className="text-xs uppercase tracking-[.34em] text-[#c9a76a]">ResoFit × ChatB2K</p>
          <h1 className="mt-5 font-serif text-5xl leading-[1.04] md:text-7xl">One ecosystem.<br /><span className="text-[#d7b979]">Connected outcomes.</span></h1>
          <p className="mt-7 max-w-2xl text-base leading-8 text-white/65 md:text-lg">Explore how wellness, customer engagement, commerce, talent, creator operations and business workflows can work together through a governed digital ecosystem.</p>
          <div className="mt-9 flex flex-wrap gap-3"><a href="#platform" className="rounded-full bg-[#d2b477] px-6 py-3.5 text-sm font-semibold text-[#17130d]">Explore the platform <ArrowRight className="ml-2 inline" size={16} /></a><a href="#journey" className="rounded-full border border-white/20 px-6 py-3.5 text-sm text-white/80 hover:border-[#d2b477]">Run an example journey <CirclePlay className="ml-2 inline" size={16} /></a></div>
        </div>
        <div className="mt-16 grid gap-3 sm:grid-cols-3">
          {[["01","Customer experience","Intent-led journeys"],["02","Connected operations","Teams and workflows"],["03","Governed execution","Approvals and evidence"]].map(([n,t,d]) => <div key={n} className="rounded-2xl border border-white/10 bg-white/[.035] p-5 backdrop-blur"><div className="text-xs tracking-[.25em] text-[#c9a76a]">{n}</div><div className="mt-3 font-serif text-2xl">{t}</div><div className="mt-1 text-sm text-white/45">{d}</div></div>)}
        </div>
      </section>

      <section id="platform" className="relative border-y border-white/10 bg-white/[.025] py-20">
        <div className="mx-auto max-w-7xl px-5">
          <div className="max-w-2xl"><p className="text-[10px] uppercase tracking-[.32em] text-[#c9a76a]">Explore capabilities</p><h2 className="mt-4 font-serif text-4xl md:text-5xl">More than a single product demo.</h2><p className="mt-4 leading-7 text-white/55">Select a capability to see its role in the wider ecosystem. This preview uses illustrative content and does not connect to live customer or operational records.</p></div>
          <div className="mt-10 grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {modules.map((item) => { const ItemIcon = item.icon; return <button key={item.id} onClick={() => setActive(item.id)} className={"flex items-center gap-4 rounded-xl border p-4 text-left transition " + (active === item.id ? "border-[#c9a76a]/70 bg-[#c9a76a]/10" : "border-white/10 bg-black/20 hover:border-white/25")}><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/[.06] text-[#d9bd83]"><ItemIcon size={19} /></div><div className="min-w-0 flex-1"><div className="text-sm font-medium">{item.name}</div><div className="mt-1 text-[11px] text-white/45">{item.tag}</div></div><ChevronRight size={16} className="text-white/30" /></button>})}
            </div>
            <div className="rounded-2xl border border-[#c9a76a]/25 bg-[#141311]/90 p-7 md:p-9">
              <div className="flex items-start justify-between gap-4"><div className="grid h-12 w-12 place-items-center rounded-xl border border-[#c9a76a]/30 bg-[#c9a76a]/10 text-[#d9bd83]"><Icon size={23} /></div><span className="rounded-full border border-[#c9a76a]/30 px-3 py-1 text-[9px] uppercase tracking-[.2em] text-[#d9bd83]">Capability preview</span></div>
              <p className="mt-8 text-[10px] uppercase tracking-[.3em] text-[#c9a76a]">{selected.tag}</p><h3 className="mt-3 font-serif text-3xl md:text-4xl">{selected.name}</h3><p className="mt-4 max-w-xl leading-7 text-white/60">{selected.desc}</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">{selected.points.map((point) => <div key={point} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[.03] p-3 text-sm text-white/75"><CheckCircle2 size={16} className="shrink-0 text-[#c9a76a]" />{point}</div>)}</div>
              <div className="mt-8 border-t border-white/10 pt-5"><div className="text-xs leading-6 text-white/40">Illustrative capability overview. Actual integrations, availability and workflow permissions are confirmed during solution scoping.</div>{selected.id === "nocappn" && <a href="/demo/no-cappn" className="mt-5 inline-flex items-center rounded-full bg-[#d2b477] px-5 py-3 text-xs font-semibold text-[#17130d]">Open the No Cappn interactive demo <ArrowRight className="ml-2 inline" size={14} /></a>}</div>
            </div>
          </div>
        </div>
      </section>

      <section id="journey" className="relative mx-auto max-w-7xl px-5 py-20 md:py-24">
        <div className="max-w-2xl"><p className="text-[10px] uppercase tracking-[.32em] text-[#c9a76a]">Interactive walkthrough</p><h2 className="mt-4 font-serif text-4xl md:text-5xl">See a connected journey.</h2><p className="mt-4 leading-7 text-white/55">Choose a sample business scenario, then run the walkthrough to see how a guided pathway could progress.</p></div>
        <div className="mt-9 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><label className="text-[10px] uppercase tracking-[.25em] text-white/45">Choose a scenario</label><div className="mt-4 space-y-2">{[["wellness","Wellness enquiry"],["commerce","Equipment discovery"],["creator","Creator campaign"],["talent","Talent onboarding"]].map(([id,label]) => <button key={id} onClick={() => {setScenario(id);setRan(false);}} className={"w-full rounded-lg border px-4 py-3 text-left text-sm " + (scenario === id ? "border-[#c9a76a]/60 bg-[#c9a76a]/10 text-[#e3ca98]" : "border-white/10 text-white/65 hover:border-white/25")}>{label}</button>)}</div><button onClick={() => setRan(true)} className="mt-6 w-full rounded-full bg-[#d2b477] px-5 py-3.5 text-sm font-semibold text-[#17130d]">{ran ? "Walkthrough completed" : "Run sample journey"} <ArrowRight className="ml-2 inline" size={15} /></button><p className="mt-3 text-center text-[10px] text-white/35">Simulation only · no external actions</p></div>
          <div className="rounded-2xl border border-white/10 bg-[#111214] p-6 md:p-8"><div className="flex items-center justify-between gap-3"><span className="text-[10px] uppercase tracking-[.25em] text-[#c9a76a]">Sample customer interaction</span><span className="rounded-full bg-white/[.06] px-3 py-1 text-[9px] text-white/45">DEMO DATA</span></div><h3 className="mt-5 font-serif text-2xl">{activeScenario.title}</h3><blockquote className="mt-4 rounded-xl border-l-2 border-[#c9a76a] bg-white/[.035] p-4 text-sm italic leading-6 text-white/70">{activeScenario.prompt}</blockquote><div className="mt-6 space-y-3">{activeScenario.route.map(([title,desc],i) => <div key={title} className="flex gap-4"><div className={"grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs " + (ran && i < 4 ? "border-[#c9a76a] bg-[#c9a76a] text-black" : "border-white/15 text-white/45")}>{ran && i < 4 ? <CheckCircle2 size={15} /> : i+1}</div><div className="flex-1 border-b border-white/[.07] pb-3"><div className="text-sm font-medium">{title}</div><div className="mt-1 text-xs leading-5 text-white/40">{desc}</div></div><span className="pt-1 text-[9px] uppercase tracking-wider text-white/30">{ran && i < 4 ? "Simulated" : "Preview"}</span></div>)}</div><div className="mt-6 rounded-xl border border-[#c9a76a]/20 bg-[#c9a76a]/[.06] p-4"><div className="text-[10px] uppercase tracking-[.2em] text-[#d9bd83]">Illustrative outcome</div><p className="mt-2 text-sm leading-6 text-white/65">{activeScenario.result}</p></div></div>
        </div>
      </section>

      <section id="governance" className="border-y border-white/10 bg-white/[.025] py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div><p className="text-[10px] uppercase tracking-[.32em] text-[#c9a76a]">Built around responsible operations</p><h2 className="mt-4 font-serif text-4xl md:text-5xl">Clear boundaries.<br />Visible accountability.</h2><p className="mt-5 leading-7 text-white/55">A client engagement should make clear what is live, what is configured, what is simulated and what requires approval. This demo keeps those states separate.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">{[[ShieldCheck,"Approval-led actions","Sensitive actions remain subject to authorised review."],[Globe2,"Connected touchpoints","Customer journeys can span web, messaging and commerce."],[Layers3,"Modular architecture","Capabilities can be scoped to a client's operating needs."],[Activity,"Evidence and status","Operational claims should be supported by execution records."]].map(([I,t,d]) => {const FeatureIcon=I as typeof ShieldCheck;return <div key={String(t)} className="rounded-xl border border-white/10 bg-black/20 p-5"><FeatureIcon size={20} className="text-[#d9bd83]" /><div className="mt-4 text-sm font-medium">{String(t)}</div><p className="mt-2 text-xs leading-5 text-white/45">{String(d)}</p></div>})}</div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-20 text-center md:py-28"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[#c9a76a]/30 bg-[#c9a76a]/10 text-[#d9bd83]"><MessageCircle size={25} /></div><p className="mt-6 text-[10px] uppercase tracking-[.32em] text-[#c9a76a]">Plan your client walkthrough</p><h2 className="mt-4 font-serif text-4xl md:text-6xl">Let’s map this to your business.</h2><p className="mx-auto mt-5 max-w-2xl leading-7 text-white/55">Discuss your goals, customer journey, operating model and the capabilities that make sense for your organisation.</p><a href="https://wa.me/2348132255842?text=Hello%20ResoFit%2C%20I%27d%20like%20to%20book%20a%20ResoFit%20ecosystem%20demo." target="_blank" rel="noreferrer" className="mt-8 inline-flex items-center rounded-full bg-[#d2b477] px-7 py-4 text-sm font-semibold text-[#17130d]">Request a tailored demo <ArrowRight className="ml-2" size={16} /></a><p className="mt-10 text-[10px] text-white/30">ResoFit · ChatB2K · Ecosystem preview · © {new Date().getFullYear()}</p></section>
      {showNotice && <div className="fixed bottom-4 right-4 z-20 flex max-w-sm items-start gap-3 rounded-xl border border-[#c9a76a]/30 bg-[#171614] p-4 shadow-2xl"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-[#d9bd83]" /><div><div className="text-xs font-semibold">Safe demo environment</div><p className="mt-1 text-[11px] leading-5 text-white/50">All interactions on this page are simulated. No production records or live workflows are changed.</p></div><button onClick={() => setShowNotice(false)} aria-label="Dismiss demo notice" className="text-white/40 hover:text-white"><X size={15} /></button></div>}
    </main>
  );
}
