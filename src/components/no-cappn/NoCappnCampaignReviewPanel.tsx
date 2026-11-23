import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getNoCappnCampaignReviewQueue, reviewNoCappnCampaign } from "@/lib/no-cappn-agency-lifecycle.functions";

export function NoCappnCampaignReviewPanel() {
  const getQueue=useServerFn(getNoCappnCampaignReviewQueue), review=useServerFn(reviewNoCappnCampaign);
  const {data,refetch,isLoading}=useQuery({queryKey:["no-cappn-campaign-review-queue"],queryFn:()=>getQueue(),refetchInterval:30000});
  async function decide(campaignId:string,decision:"approved"|"rejected") {
    try { const result=await review({data:{campaignId,decision}}); if(!result.ok) throw new Error(result.error); toast.success(decision==="approved"?"Campaign approved.":"Campaign rejected."); await refetch(); }
    catch(error) { toast.error(error instanceof Error?error.message:"Campaign review failed."); }
  }
  return <section className="rounded-lg border border-[var(--glass-border)] bg-[var(--ink-soft)]/30 p-5">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Pending agency campaign approvals</h2><span className="rounded-full border border-[var(--glass-border)] px-3 py-1 text-xs">{data?.ok?data.rows.length:0} pending</span></div>
    {isLoading?<p className="mt-3 text-sm text-muted-foreground">Loading campaign queue…</p>:data&&!data.ok?<p className="mt-3 text-sm text-red-400">{data.error}</p>:<div className="mt-3 divide-y divide-[var(--glass-border)]">
      {(data?.ok?data.rows:[]).map((row:any)=><div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div><p className="text-sm font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.agency_name} · {row.primary_platform} · {row.approved_assets} approved highlights</p><a className="text-xs text-gold underline" href={row.application_url} target="_blank" rel="noreferrer">Application destination</a></div>
        <div className="flex gap-2"><button type="button" onClick={()=>decide(row.id,"approved")} disabled={!row.approved_assets} className="rounded-full bg-gold px-3 py-2 text-xs font-semibold text-black disabled:opacity-40">Approve</button><button type="button" onClick={()=>decide(row.id,"rejected")} className="rounded-full border border-[var(--glass-border)] px-3 py-2 text-xs">Reject</button></div>
      </div>)}
      {data?.ok&&!data.rows.length&&<p className="py-3 text-sm text-muted-foreground">No campaigns are waiting for approval.</p>}
    </div>}
  </section>;
}
