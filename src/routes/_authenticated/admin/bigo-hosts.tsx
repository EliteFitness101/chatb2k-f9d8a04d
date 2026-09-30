import { createFileRoute } from "@tanstack/react-router";
import { useEffect,useState } from "react";
import { SiteShell } from "@/components/site/SiteShell";
import { supabase } from "@/integrations/supabase/client";

export const Route=createFileRoute("/_authenticated/admin/bigo-hosts")({component:BigoHostsAdmin});

function BigoHostsAdmin(){
 const [data,setData]=useState<any>(null),[error,setError]=useState("");
 useEffect(()=>{supabase.rpc("elite_host_dashboard").then(({data,error})=>{if(error)setError(error.message);else setData(data);});},[]);
 return <SiteShell><main className="mx-auto max-w-7xl px-4 py-10"><div className="flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">BIGO 808 Command Center</p><h1 className="mt-2 text-4xl font-semibold">Host growth engine</h1></div><a href="/bigo-host" className="rounded-xl border px-4 py-2 text-sm">Open onboarding</a></div>{error&&<p className="mt-6 text-red-500">{error}</p>}{data&&<><div className="mt-8 grid gap-4 sm:grid-cols-4">{[["Verified",data.verified,data.target_verified],["Activated",data.activated],["Active",data.active],["Target",data.target_verified]].map(([label,value,target])=><div key={String(label)} className="glass rounded-2xl p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold">{value??0}</p>{target&&<p className="mt-1 text-xs text-muted-foreground">target {target}</p>}</div>)}</div><div className="mt-8 glass rounded-2xl p-5"><h2 className="font-semibold">Country pipeline</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="py-2">Country</th><th>Hosts</th><th>Verified</th><th>Activated</th></tr></thead><tbody>{(data.by_country||[]).map((r:any)=><tr key={r.country} className="border-t"><td className="py-2">{r.country||"—"}</td><td>{r.hosts}</td><td>{r.verified}</td><td>{r.activated}</td></tr>)}</tbody></table></div></div></>}</main></SiteShell>;
}
