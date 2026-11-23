import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, Clipboard, Film, RadioTower, ShieldCheck, Sparkles, Users, Workflow } from "lucide-react";
import { toast } from "sonner";
import { AdminGate, AdminLoading, Panel, StatCard, StatusPill } from "@/components/admin/AdminUI";
import { getNoCappnOverview } from "@/lib/no-cappn.functions";
import { getNoCappnAgencyReviewQueue, reviewNoCappnCampaignAsset, setNoCappnHostAuthorization } from "@/lib/no-cappn-agency.functions";

export const Route = createFileRoute("/_authenticated/admin/no-cappn")({
  head: () => ({
    meta: [
      { title: "No Cappn — BIGO Agency Command Center" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: NoCappnCommandCenter,
});

type Highlight = {
  id: string;
  host_id: string;
  host_name: string | null;
  title: string | null;
  status: string;
  content_asset_id: string | null;
  created_at: string;
};

const labelClass = "text-[10px] tracking-[0.28em] uppercase text-muted-foreground";
const panelClass = "rounded-sm border border-[var(--glass-border)] bg-[var(--ink-soft)]/35 backdrop-blur-xl";


function AgencyOpsPanel({ agencies, sources }: { agencies: any[]; sources: any[] }) {
  const getReviewQueue = useServerFn(getNoCappnAgencyReviewQueue);
  const reviewAsset = useServerFn(reviewNoCappnCampaignAsset);
  const setHostAuthorization = useServerFn(setNoCappnHostAuthorization);
  const { data, refetch } = useQuery({
    queryKey: ["no-cappn-agency-review-queue"],
    queryFn: () => getReviewQueue(),
    refetchInterval: 30_000,
  });
  const [agencyId, setAgencyId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [verificationNote, setVerificationNote] = useState("");
  const [busyId, setBusyId] = useState("");
  const eligibleSources = sources.filter((source) => source.active === true && source.capture_enabled === true);
  const rows = data?.ok ? data.rows : [];

  async function verifyHost() {
    if (!agencyId || !sourceId || !evidenceUrl.startsWith("https://")) {
      toast.error("Choose an agency, an active capture-enabled host and HTTPS ownership evidence.");
      return;
    }
    setBusyId("host");
    try {
      const result = await setHostAuthorization({ data: {
        agencyId, sourceId, evidenceUrl, decision: "verified", note: verificationNote,
      } });
      if (!result.ok) throw new Error(result.error);
      toast.success("Host ownership verified and agency activated.");
      setEvidenceUrl("");
      setVerificationNote("");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Host verification failed.");
    } finally {
      setBusyId("");
    }
  }

  async function decideAsset(campaignAssetId: string, decision: "approved" | "rejected") {
    setBusyId(campaignAssetId);
    try {
      const result = await reviewAsset({ data: { campaignAssetId, decision } });
      if (!result.ok) throw new Error(result.error);
      toast.success(decision === "approved" ? "Highlight approved for campaign use." : "Highlight rejected.");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Review action failed.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <Panel title="Agency onboarding and creative clearance">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-sm border border-[var(--glass-border)] bg-[var(--ink)]/40 p-4">
          <p className={labelClass}>Host ownership verification</p>
          <p className="mt-2 text-xs text-muted-foreground">Only active, capture-enabled BIGO sources are selectable. Verification requires evidence and is performed by a ResoFit operator.</p>
          <div className="mt-3 space-y-2">
            <select value={agencyId} onChange={(e) => setAgencyId(e.target.value)} className="w-full rounded-md border border-[var(--glass-border)] bg-background px-3 py-2 text-sm">
              <option value="">Select agency</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.status}</option>)}
            </select>
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="w-full rounded-md border border-[var(--glass-border)] bg-background px-3 py-2 text-sm">
              <option value="">Select active BIGO host source</option>
              {eligibleSources.map((source) => <option key={source.id} value={source.id}>{source.display_name || source.bigo_id} · {source.bigo_id}</option>)}
            </select>
            <input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} type="url" placeholder="HTTPS host authorization evidence URL" className="w-full rounded-md border border-[var(--glass-border)] bg-background px-3 py-2 text-sm" />
            <input value={verificationNote} onChange={(e) => setVerificationNote(e.target.value)} placeholder="Verification note (optional)" className="w-full rounded-md border border-[var(--glass-border)] bg-background px-3 py-2 text-sm" />
            <button type="button" onClick={verifyHost} disabled={busyId === "host" || !agencies.length || !eligibleSources.length} className="rounded-full bg-gold px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">{busyId === "host" ? "Verifying…" : "Verify host and activate agency"}</button>
          </div>
        </div>
        <div className="rounded-sm border border-[var(--glass-border)] bg-[var(--ink)]/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className={labelClass}>Pending campaign assets</p>
            <StatusPill value={String(rows.length) + " pending"} />
          </div>
          <div className="mt-3 space-y-3">
            {rows.map((row: any) => (
              <div key={row.id} className="border-b border-[var(--glass-border)] pb-3 last:border-0">
                <p className="text-sm font-medium">{row.highlight_title} · {row.host_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.agency_name} / {row.campaign_name} · {row.platform}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">Rights: {row.asset?.rights_status ?? "unknown"} · Commercial: {row.asset?.commercial_status ?? "unknown"} · QA: {row.asset?.qa_status ?? "unknown"}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => decideAsset(row.id, "approved")} disabled={busyId === row.id} className="rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50">Approve</button>
                  <button type="button" onClick={() => decideAsset(row.id, "rejected")} disabled={busyId === row.id} className="rounded-full border border-[var(--glass-border)] px-3 py-1.5 text-xs disabled:opacity-50">Reject</button>
                </div>
              </div>
            ))}
            {!rows.length && <p className="text-xs text-muted-foreground">{data?.ok === false ? data.error : "No campaign assets are awaiting review."}</p>}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function NoCappnCommandCenter() {
  const fetchOverview = useServerFn(getNoCappnOverview);
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["no-cappn-command-center"],
    queryFn: () => fetchOverview(),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
  const [campaignName, setCampaignName] = useState("BIGO Host Recruitment");
  const [platform, setPlatform] = useState("tiktok_recruit");
  const [highlightId, setHighlightId] = useState("");
  const [applicationUrl, setApplicationUrl] = useState("https://elite.resofit.fit");
  const [draft, setDraft] = useState("");

  const highlights = (data?.ok ? data.highlights.recent : []) as Highlight[];
  const campaignHighlights = (data?.ok ? data.highlights.campaign_eligible : []) as Highlight[];
  const selected = useMemo(() => campaignHighlights.find((h) => h.id === highlightId), [campaignHighlights, highlightId]);
  const eligible = data?.ok ? data.assets.eligible : 0;

  function generateDraft() {
    if (!selected) {
      toast.error("Select a captured highlight first.");
      return;
    }
    const host = selected.host_name || "a BIGO live host";
    const clip = selected.title || "a live-stream highlight";
    const copy = [
      campaignName.trim() || "BIGO Host Recruitment",
      "",
      `See ${host} in action: ${clip}.`,
      "Ready to build your own live audience? Join a creator community, grow your presence and explore BIGO live-host opportunities.",
      "",
      "18+ only. Apply here: " + applicationUrl.trim(),
      "",
      "#BIGO #LiveHost #CreatorCommunity #HostRecruitment",
    ].join("\n");
    setDraft(copy);
    toast.success("Recruitment creative draft generated locally.");
  }

  async function copyDraft() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      toast.success("Campaign copy copied.");
    } catch {
      toast.error("Clipboard access unavailable. Select and copy the draft manually.");
    }
  }

  if (isLoading) return <AdminLoading />;
  if (error || !data || !data.ok) return <AdminGate error={data?.ok === false ? data.error : "No Cappn data could not be loaded."} />;

  const stages = [
    { title: "BIGO source registry", detail: `${data.sources.active} active · ${data.sources.capture_enabled} capture-enabled`, state: data.sources.capture_enabled > 0 ? "Configured" : "No active capture sources", icon: RadioTower },
    { title: "Scheduled capture", detail: "bigo-live-automation.yml · 5-minute schedule", state: "Workflow configured · run receipt not connected", icon: Workflow },
    { title: "Media archive", detail: "Cloudflare R2 primary · media.resofit.fit", state: "Public read-back not verified by this dashboard", icon: Film },
    { title: "Highlight ingestion", detail: `${data.highlights.processed} recent rows linked to content assets`, state: data.highlights.failed ? `${data.highlights.failed} recent failures` : "Registry connected", icon: Sparkles },
    { title: "Rights and technical QA", detail: `${eligible} recent assets pass all three publication checks`, state: "Per-asset clearance required", icon: ShieldCheck },
    { title: "Recruitment distribution", detail: `${data.campaigns.total_recent} recent queue rows`, state: "Publisher receipt required for verified-post status", icon: Users },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] tracking-[0.4em] uppercase text-gold">No Cappn · Agency Media Operations</p>
          <h1 className="font-display text-3xl sm:text-4xl text-gold-gradient mt-2">BIGO Recruitment Command Center</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Connect authorized livestream highlights to host-recruitment campaigns, creative review and social distribution.
          </p>
        </div>
        <div className="text-right">
          <StatusPill value="Internal operator preview" />
          <p className="text-[10px] text-muted-foreground mt-2">Refreshes every 60 seconds</p>
        </div>
      </header>

      <div className={panelClass + " p-4 sm:p-5"}>
        <div className="flex items-start gap-3">
          <CircleAlert className="h-5 w-5 text-gold mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">Agency isolation is not yet provisioned.</p>
            <p className="text-xs text-muted-foreground mt-1">
              This route is restricted to ResoFit content operators. The current BIGO registry and content queue are global;
              agency-specific memberships, host ownership and campaign partitions must be deployed before external agencies can access or save campaigns.
            </p>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Registered BIGO sources" value={data.sources.total} hint={`${data.sources.active} active`} />
        <StatCard label="Capture-enabled" value={data.sources.capture_enabled} hint="Source registry state" />
        <StatCard label="Recent highlights" value={data.highlights.recent_count} hint={`${data.highlights.failed} failed in recent sample`} tone={data.highlights.failed ? "warn" : "default"} />
        <StatCard label="QA + rights eligible" value={eligible} hint={`of ${data.assets.total} total asset records · latest 30 checked`} tone={eligible ? "good" : "default"} />
      </section>

      <AgencyOpsPanel agencies={data.agencies ?? []} sources={data.sources.source_rows ?? []} />

      <Panel title="End-to-end production architecture">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            return (
              <div key={stage.title} className="rounded-sm border border-[var(--glass-border)] bg-[var(--ink)]/50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className={labelClass}>0{index + 1} · {stage.title}</span>
                  <Icon className="h-4 w-4 text-gold" />
                </div>
                <p className="text-sm mt-3">{stage.detail}</p>
                <p className="text-[11px] text-muted-foreground mt-2">{stage.state}</p>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid xl:grid-cols-2 gap-6">
        <Panel title="Recent BIGO highlights">
          <div className="space-y-3">
            {highlights.length ? highlights.slice(0, 10).map((h) => (
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--glass-border)] pb-3 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm truncate">{h.title || h.host_name || "Untitled highlight"}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{h.host_name || "BIGO host"} · {new Date(h.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill value={h.status} />
                  {h.content_asset_id ? <CheckCircle2 className="h-4 w-4 text-gold" /> : null}
                </div>
              </div>
            )) : <p className="text-sm text-muted-foreground">No highlight rows returned by the connected registry.</p>}
          </div>
        </Panel>

        <Panel title="Recruitment content queue">
          <div className="space-y-3">
            {data.campaigns.recent.length ? data.campaigns.recent.slice(0, 10).map((item: any) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--glass-border)] pb-3 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm truncate">{item.title || "Untitled campaign item"}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{item.platform || "Platform pending"} · {new Date(item.created_at).toLocaleString()}</p>
                </div>
                <StatusPill value={item.status || "unknown"} />
              </div>
            )) : <p className="text-sm text-muted-foreground">No recruitment queue rows returned.</p>}
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            {Object.entries(data.campaigns.status_counts).map(([status, count]) => (
              <span key={status} className="text-[10px] uppercase tracking-wider text-muted-foreground">{status}: {count}</span>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Recruitment campaign creative builder">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Campaign name</span>
            <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} className="mt-2 w-full rounded-sm border border-[var(--glass-border)] bg-[var(--ink)] px-3 py-3 text-sm" maxLength={100} />
          </label>
          <label className="block">
            <span className={labelClass}>Distribution target</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="mt-2 w-full rounded-sm border border-[var(--glass-border)] bg-[var(--ink)] px-3 py-3 text-sm">
              <option value="tiktok_recruit">TikTok recruitment</option>
              <option value="instagram">Instagram</option>
              <option value="youtube">YouTube</option>
              <option value="multi_channel">Multi-channel (approval required)</option>
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Rights + QA-cleared source highlight</span>
            <select value={highlightId} onChange={(e) => setHighlightId(e.target.value)} className="mt-2 w-full rounded-sm border border-[var(--glass-border)] bg-[var(--ink)] px-3 py-3 text-sm">
              <option value="">Select a cleared highlight</option>
              {campaignHighlights.map((h) => <option key={h.id} value={h.id}>{h.title || h.host_name || h.id}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Host application destination</span>
            <input value={applicationUrl} onChange={(e) => setApplicationUrl(e.target.value)} className="mt-2 w-full rounded-sm border border-[var(--glass-border)] bg-[var(--ink)] px-3 py-3 text-sm" type="url" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-5">
          <button type="button" onClick={generateDraft} disabled={!selected} className="inline-flex items-center gap-2 rounded-sm bg-gold-gradient px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink)] disabled:opacity-40">
            <Sparkles className="h-4 w-4" /> Generate creative draft
          </button>
          <span className="text-[10px] text-muted-foreground">Only rights + QA-cleared assets · local preview only</span>
        </div>
        {draft ? (
          <div className="mt-5 rounded-sm border border-[var(--glass-border)] bg-[var(--ink)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={labelClass}>Generated copy · {platform.replace(/_/g, " ")}</p>
              <button type="button" onClick={copyDraft} className="inline-flex items-center gap-2 text-xs text-gold hover:underline"><Clipboard className="h-3.5 w-3.5" /> Copy text</button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-6 mt-3">{draft}</pre>
          </div>
        ) : null}
        <div className="mt-5 border-t border-[var(--glass-border)] pt-4 flex items-start gap-3">
          <ShieldCheck className="h-4 w-4 text-gold mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Campaign persistence and automation remain gated until agency tenancy, agency-to-host authorization, per-asset commercial rights,
            technical QA, approval records and publishing receipts are linked. The existing publisher remains the only publishing path.
          </p>
        </div>
      </Panel>

      {data.errors.length ? (
        <Panel title="Data-source exceptions">
          <ul className="space-y-2 text-xs text-muted-foreground">
            {data.errors.map((e) => <li key={e.source}><strong>{e.source}:</strong> {e.message}</li>)}
          </ul>
        </Panel>
      ) : null}

      <p className="text-[10px] text-muted-foreground">Source refresh: {new Date(data.generated_at).toLocaleString()} · UI refreshed {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—"}. Dashboard reads production records but performs no writes.</p>
    </div>
  );
}
