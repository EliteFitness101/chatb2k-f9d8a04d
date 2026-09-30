import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Radio, ShieldCheck, Users } from "lucide-react";
import { SiteShell } from "@/components/site/SiteShell";
import { supabase } from "@/integrations/supabase/client";

const COUNTRIES=["Nigeria","Ghana","Kenya","South Africa","Tanzania","Uganda","Rwanda","Zambia","Zimbabwe","Cameroon","Sierra Leone","Liberia"];

export const Route=createFileRoute("/bigo-host")({
 head:()=>({meta:[{title:"Become a BIGO Live Host | ResoFit Elite"},{name:"description",content:"Apply to become a trained ResoFit BIGO live host. 18+ only."}]}),
 component:BigoHostRecruitment,
});

function BigoHostRecruitment(){
 const [busy,setBusy]=useState(false),[done,setDone]=useState<string|null>(null),[error,setError]=useState("");
 const [f,setF]=useState({full_name:"",email:"",phone:"",age:"",country:"Nigeria",state:"",city:"",bigo_username:"",bigo_uid:"",content_category:"",availability:"",experience:"",device:"",internet_ready:true,whatsapp_opt_in:true,consent_age:false,consent_identity:false,consent_terms:false,website:""});
 const set=(k:string,v:string|boolean)=>setF(x=>({...x,[k]:v}));
 async function submit(e:React.FormEvent){e.preventDefault();setError("");setBusy(true);try{
  const p=new URLSearchParams(window.location.search);
  const {data,error:e}=await supabase.functions.invoke("elite-host-apply",{body:{...f,age:Number(f.age),source_channel:p.get("utm_source")||"elite.resofit.fit",utm_source:p.get("utm_source"),utm_medium:p.get("utm_medium"),utm_campaign:p.get("utm_campaign"),referral_code:p.get("ref")||null}});
  if(e||!data?.ok)throw new Error(data?.message||e?.message||"Application could not be submitted.");
  setDone(data.reference);
 }catch(e){setError(e instanceof Error?e.message:"Application could not be submitted.");}finally{setBusy(false);}}
 if(done)return <SiteShell><main className="mx-auto max-w-3xl px-4 py-20"><div className="glass rounded-2xl p-8 text-center"><CheckCircle2 className="mx-auto h-12 w-12"/><h1 className="mt-4 text-3xl font-semibold">Application received.</h1><p className="mt-3 text-muted-foreground">Reference: <strong>{done}</strong></p><p className="mt-2 text-sm text-muted-foreground">Next: eligibility verification, agency review and your first-live mission.</p></div></main></SiteShell>;
 return <SiteShell><main className="mx-auto max-w-5xl px-4 py-12 sm:py-20"><section className="grid gap-8 lg:grid-cols-[1fr_1fr]"><div><div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em]"><Radio className="h-4 w-4"/> B2K Live Host Academy</div><h1 className="mt-5 text-4xl font-semibold sm:text-6xl">Build your live audience from zero.</h1><p className="mt-5 text-lg text-muted-foreground">18+ creators can apply for ResoFit BIGO host recruitment, onboarding, training and content support.</p><div className="mt-8 grid gap-3 sm:grid-cols-3"><Mini icon={<ShieldCheck/>} title="18+" text="Adult applicants"/><Mini icon={<Users/>} title="Train" text="Day 1 → Day 30"/><Mini icon={<Radio/>} title="LIVE" text="First-live mission"/></div></div>
 <form onSubmit={submit} className="glass rounded-2xl p-5 sm:p-7 space-y-4">
  <Field label="Full name" value={f.full_name} onChange={v=>set("full_name",v)} required/><div className="grid gap-4 sm:grid-cols-2"><Field label="Email" type="email" value={f.email} onChange={v=>set("email",v)} required/><Field label="WhatsApp / phone" value={f.phone} onChange={v=>set("phone",v)} required/></div>
  <div className="grid gap-4 sm:grid-cols-2"><Field label="Age" type="number" min="18" max="80" value={f.age} onChange={v=>set("age",v)} required/><Select label="Country" value={f.country} options={COUNTRIES} onChange={v=>set("country",v)}/></div>
  <div className="grid gap-4 sm:grid-cols-2"><Field label="State / region" value={f.state} onChange={v=>set("state",v)}/><Field label="City" value={f.city} onChange={v=>set("city",v)} required/></div>
  <div className="grid gap-4 sm:grid-cols-2"><Field label="BIGO username" value={f.bigo_username} onChange={v=>set("bigo_username",v)}/><Field label="BIGO ID / UID" value={f.bigo_uid} onChange={v=>set("bigo_uid",v)}/></div>
  <Field label="Content category" placeholder="lifestyle, music, gaming, beauty, fitness…" value={f.content_category} onChange={v=>set("content_category",v)}/><Field label="Availability" placeholder="e.g. evenings, 3 days/week" value={f.availability} onChange={v=>set("availability",v)}/><Field label="Existing live experience" value={f.experience} onChange={v=>set("experience",v)}/><Field label="Device + internet readiness" value={f.device} onChange={v=>set("device",v)}/>
  {([["internet_ready","I have a usable phone and reliable internet for LIVE sessions."],["whatsapp_opt_in","I agree to receive onboarding reminders on WhatsApp."],["consent_age","I confirm I am 18 or older."],["consent_identity","I consent to identity/eligibility verification."],["consent_terms","I agree to the host recruitment terms."]] as const).map(([k,label])=><label key={k} className="flex items-center gap-3 text-sm"><input type="checkbox" required={k.startsWith("consent_")} checked={Boolean(f[k])} onChange={e=>set(k,e.target.checked)}/>{label}</label>)}
  <input tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={e=>set("website",e.target.value)}/>{error&&<p className="text-sm text-red-500">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-foreground px-5 py-3 text-background font-semibold disabled:opacity-50">{busy?"Submitting…":"Apply to Become a BIGO Host"}</button><p className="text-xs text-muted-foreground">No earnings guarantee is implied; platform eligibility and agency arrangements apply.</p>
 </form></section></main></SiteShell>;
}
function Mini({icon,title,text}:{icon:React.ReactNode;title:string;text:string}){return <div className="glass rounded-xl p-4"><div className="h-5 w-5">{icon}</div><p className="mt-3 font-semibold">{title}</p><p className="text-xs text-muted-foreground">{text}</p></div>}
function Field({label,type="text",value,onChange,required,placeholder,min,max}:{label:string;type?:string;value:string;onChange:(v:string)=>void;required?:boolean;placeholder?:string;min?:string;max?:string}){return <label className="block text-sm"><span className="mb-1.5 block text-muted-foreground">{label}</span><input required={required} type={type} min={min} max={max} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)} className="w-full rounded-xl border bg-background/40 px-3 py-2.5 outline-none"/></label>}
function Select({label,value,options,onChange}:{label:string;value:string;options:string[];onChange:(v:string)=>void}){return <label className="block text-sm"><span className="mb-1.5 block text-muted-foreground">{label}</span><select value={value} onChange={e=>onChange(e.target.value)} className="w-full rounded-xl border bg-background/40 px-3 py-2.5">{options.map(o=><option key={o}>{o}</option>)}</select></label>}
