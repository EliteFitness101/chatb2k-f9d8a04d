import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  attachNoCappnHighlight,
  createNoCappnAgency,
  createNoCappnCampaign,
  getNoCappnAgencyWorkspace,\n  saveNoCappnCampaignCreative,
} from "@/lib/no-cappn-agency.functions";

export const Route = createFileRoute("/_authenticated/agency/no-cappn")({
  head: () => ({
    meta: [
      { title: "No Cappn — Agency Recruitment Workspace" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: NoCappnAgencyWorkspace,
});

type Workspace = {
  ok: true;
  agencies: Array<{ id: string; name: string; slug: string; status: string }>;
  memberships: Array<{ agency_id: string; role: string; status: string }>;
  hosts: Array<{ id: string; agency_id: string; status: string; source_id: string }>;
  campaigns: Array<{ id: string; agency_id: string; host_mapping_id: string; name: string; status: string; primary_platform: string; application_url: string }>;
  assets: Array<{ id: string; campaign_id: string; highlight_id: string; approval_status: string }>;
  eligibleHighlights: Array<{ id: string; agency_id: string; host_mapping_id: string; title: string | null; host_name: string | null; created_at: string; asset: { canonical_url: string } }>;
};

function NoCappnAgencyWorkspace() {
  const queryClient = useQueryClient();
  const getWorkspace = useServerFn(getNoCappnAgencyWorkspace);
  const createAgency = useServerFn(createNoCappnAgency);
  const createCampaign = useServerFn(createNoCappnCampaign);
  const attachHighlight = useServerFn(attachNoCappnHighlight);\n  const saveCreative = useServerFn(saveNoCappnCampaignCreative);
  const { data, isLoading, error } = useQuery({
    queryKey: ["no-cappn-agency-workspace"],
    queryFn: () => getWorkspace(),
    refetchInterval: 30_000,
  });

  const [agencyName, setAgencyName] = useState("");
  const [agencySlug, setAgencySlug] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [campaignName, setCampaignName] = useState("BIGO Host Recruitment");
  const [hostMappingId, setHostMappingId] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [applicationUrl, setApplicationUrl] = useState("https://elite.resofit.fit");
  const [campaignId, setCampaignId] = useState("");
  const [highlightId, setHighlightId] = useState("");\n  const [creativeCopy, setCreativeCopy] = useState("");
  const [busy, setBusy] = useState(false);

  const workspace = data as Workspace | undefined;
  const agencies = workspace?.ok ? workspace.agencies : [];
  const activeAgencyId = agencyId || agencies[0]?.id || "";
  const hosts = workspace?.ok ? workspace.hosts.filter((h) => h.agency_id === activeAgencyId && h.status === "verified") : [];
  const campaigns = workspace?.ok ? workspace.campaigns.filter((c) => c.agency_id === activeAgencyId) : [];
  const highlights = workspace?.ok ? workspace.eligibleHighlights.filter((h) => h.agency_id === activeAgencyId) : [];
  const activeCampaign = useMemo(() => campaigns.find((c) => c.id === campaignId) ?? campaigns[0], [campaigns, campaignId]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["no-cappn-agency-workspace"] });
  }

  async function onCreateAgency(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await createAgency({ data: { name: agencyName, slug: agencySlug } });
      if (!result.ok) throw new Error(result.error);
      toast.success("Agency workspace created.");
      setAgencyId(result.agencyId);
      setAgencyName("");
      setAgencySlug("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Agency could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateCampaign(event: React.FormEvent) {
    event.preventDefault();
    if (!activeAgencyId || !hostMappingId) return toast.error("A verified host assignment is required.");
    setBusy(true);
    try {
      const result = await createCampaign({ data: { agencyId: activeAgencyId, hostMappingId, name: campaignName, platform: platform as "tiktok" | "instagram" | "youtube" | "facebook", applicationUrl } });
      if (!result.ok) throw new Error(result.error);
      setCampaignId(result.campaign.id);
      toast.success("Campaign draft saved.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Campaign draft could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function generateCreative() {
    if (!activeCampaign || !highlightId) return toast.error("Choose a campaign and a cleared highlight first.");
    const selected = highlights.find((h) => h.id === highlightId);
    if (!selected) return toast.error("Selected highlight is not eligible for this agency.");
    const host = selected.host_name || "a verified BIGO host";
    const moment = selected.title || "a live-stream highlight";
    const copy = [
      `See ${host} in action: ${moment}.`,
      "Ready to build your own audience through live streaming? Join the creator community, develop your on-camera presence and explore BIGO host opportunities with agency support.",
      "",
      `Apply now: ${activeCampaign.application_url}`,
      "",
      "#BIGO #LiveHost #CreatorCommunity #HostRecruitment",
    ].join("\n");
    setCreativeCopy(copy);
    toast.success("Recruitment creative generated from the selected highlight.");
  }

  async function persistCreative() {
    if (!activeCampaign || !creativeCopy.trim()) return toast.error("Generate or enter campaign copy first.");
    setBusy(true);
    try {
      const result = await saveCreative({ data: {
        campaignId: activeCampaign.id,
        creativeCopy,
        campaignCta: `Apply now: ${activeCampaign.application_url}`,
        hashtags: ["#BIGO", "#LiveHost", "#CreatorCommunity", "#HostRecruitment"],
      } });
      if (!result.ok) throw new Error(result.error);
      toast.success("Campaign creative saved to the draft.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Campaign creative could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function onAttachHighlight() {
    if (!activeCampaign || !highlightId) return toast.error("Choose a campaign and a cleared highlight.");
    setBusy(true);
    try {
      const result = await attachHighlight({ data: { campaignId: activeCampaign.id, highlightId } });
      if (!result.ok) throw new Error(result.error);
      toast.success("Highlight attached and submitted for operator review.");
      setHighlightId("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Highlight could not be attached.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <main className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">Loading agency workspace…</main>;
  if (error || !data || !data.ok) return <main className="mx-auto max-w-6xl p-6"><h1 className="text-2xl font-display">No Cappn Agency Workspace</h1><p className="mt-3 text-sm text-muted-foreground">{(data as any)?.error ?? "The workspace could not be loaded."} Apply the pending No Cappn agency migration before enabling this portal.</p></main>;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <header className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.35em] text-gold">No Cappn · Agency Operations</p>
        <h1 className="font-display text-3xl sm:text-4xl text-gold-gradient">BIGO Recruitment Workspace</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Build host-recruitment campaigns from highlights belonging to hosts that have been verified for your agency. Every asset passes rights, commercial-use and technical QA checks before it can be attached.</p>
      </header>

      {!agencies.length ? (
        <section className="rounded-lg border border-[var(--glass-border)] bg-[var(--ink-soft)]/40 p-5">
          <h2 className="text-lg font-semibold">Register your agency</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create the agency workspace. A ResoFit operator must verify host ownership before campaign creation is enabled.</p>
          <form onSubmit={onCreateAgency} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input required minLength={2} maxLength={120} value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Agency name" className="rounded-md border border-[var(--glass-border)] bg-background px-3 py-2 text-sm" />
            <input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={agencySlug} onChange={(e) => setAgencySlug(e.target.value)} placeholder="agency-slug" className="rounded-md border border-[var(--glass-border)] bg-background px-3 py-2 text-sm" />
            <button disabled={busy} className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-black disabled:opacity-50 sm:col-span-2">{busy ? "Creating…" : "Create agency workspace"}</button>
          </form>
        </section>
      ) : (
        <>
          <section className="rounded-lg border border-[var(--glass-border)] bg-[var(--ink-soft)]/40 p-4">
            <label className="text-xs text-muted-foreground" htmlFor="agency">Agency workspace</label>
            <select id="agency" value={activeAgencyId} onChange={(e) => { setAgencyId(e.target.value); setHostMappingId(""); setCampaignId(""); }} className="mt-2 w-full rounded-md border border-[var(--glass-border)] bg-background px-3 py-2 text-sm">
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.status}</option>)}
            </select>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-[var(--glass-border)] p-4"><p className="text-xs text-muted-foreground">Verified hosts</p><p className="mt-2 text-2xl font-semibold">{hosts.length}</p></div>
            <div className="rounded-lg border border-[var(--glass-border)] p-4"><p className="text-xs text-muted-foreground">Campaign drafts</p><p className="mt-2 text-2xl font-semibold">{campaigns.length}</p></div>
            <div className="rounded-lg border border-[var(--glass-border)] p-4"><p className="text-xs text-muted-foreground">Cleared highlights</p><p className="mt-2 text-2xl font-semibold">{highlights.length}</p></div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--ink-soft)]/30 p-5">
              <h2 className="text-lg font-semibold">Create recruitment campaign</h2>
              <form onSubmit={onCreateCampaign} className="mt-4 space-y-3">
                <input required value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Campaign name" className="w-full rounded-md border border-[var(--glass-border)] bg-background px-3 py-2 text-sm" />
                <select required value={hostMappingId} onChange={(e) => setHostMappingId(e.target.value)} className="w-full rounded-md border border-[var(--glass-border)] bg-background px-3 py-2 text-sm">
                  <option value="">Select verified BIGO host</option>
                  {hosts.map((h) => <option key={h.id} value={h.id}>Verified source · {h.source_id.slice(0, 8)}</option>)}
                </select>
                <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-full rounded-md border border-[var(--glass-border)] bg-background px-3 py-2 text-sm">
                  <option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="youtube">YouTube</option><option value="facebook">Facebook</option>
                </select>
                <input required type="url" value={applicationUrl} onChange={(e) => setApplicationUrl(e.target.value)} placeholder="HTTPS application URL" className="w-full rounded-md border border-[var(--glass-border)] bg-background px-3 py-2 text-sm" />
                <button disabled={busy || !hosts.length} className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-black disabled:opacity-50">{busy ? "Saving…" : "Save campaign draft"}</button>
                {!hosts.length && <p className="text-xs text-muted-foreground">No host has been assigned and verified for this agency yet. Campaign creation stays disabled until an operator verifies the host authorization.</p>}
              </form>
            </div>

            <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--ink-soft)]/30 p-5">
              <h2 className="text-lg font-semibold">Attach cleared highlight</h2>
              <p className="mt-1 text-xs text-muted-foreground">Only highlights from your verified host mapping are listed. Rights, commercial authorization and QA must all pass.</p>
              <div className="mt-4 space-y-3">
                <select value={campaignId || activeCampaign?.id || ""} onChange={(e) => setCampaignId(e.target.value)} className="w-full rounded-md border border-[var(--glass-border)] bg-background px-3 py-2 text-sm">
                  <option value="">Select campaign draft</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}
                </select>
                <select value={highlightId} onChange={(e) => setHighlightId(e.target.value)} className="w-full rounded-md border border-[var(--glass-border)] bg-background px-3 py-2 text-sm">
                  <option value="">Select eligible highlight</option>
                  {highlights.map((h) => <option key={h.id} value={h.id}>{h.host_name || "BIGO host"} · {h.title || h.id.slice(0, 8)}</option>)}
                </select>
                <button type="button" disabled={busy || !campaigns.length || !highlights.length} onClick={generateCreative} className="rounded-full border border-[var(--glass-border)] px-5 py-2 text-sm disabled:opacity-50">Generate recruitment creative</button>
                <textarea rows={5} value={creativeCopy} onChange={(e) => setCreativeCopy(e.target.value)} placeholder="Highlight-led recruitment copy will appear here…" className="w-full rounded-md border border-[var(--glass-border)] bg-background px-3 py-2 text-sm" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy || !creativeCopy.trim()} onClick={persistCreative} className="rounded-full bg-gold px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">Save creative to draft</button>
                  <button type="button" disabled={!creativeCopy.trim()} onClick={() => navigator.clipboard.writeText(creativeCopy).then(() => toast.success("Creative copied."), () => toast.error("Clipboard unavailable."))} className="rounded-full border border-[var(--glass-border)] px-4 py-2 text-xs disabled:opacity-50">Copy</button>
                  <button type="button" disabled={busy || !campaigns.length || !highlights.length} onClick={onAttachHighlight} className="rounded-full border border-[var(--glass-border)] px-4 py-2 text-xs disabled:opacity-50">{busy ? "Attaching…" : "Attach highlight for operator review"}</button>
                </div>
                {!highlights.length && <p className="text-xs text-muted-foreground">No eligible highlights found for this agency’s verified hosts.</p>}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--glass-border)] p-5">
            <h2 className="text-lg font-semibold">Campaigns</h2>
            <div className="mt-3 divide-y divide-[var(--glass-border)]">
              {campaigns.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.primary_platform} · {c.application_url}</p></div><span className="rounded-full border border-[var(--glass-border)] px-3 py-1 text-xs">{c.status}</span></div>)}
              {!campaigns.length && <p className="py-3 text-sm text-muted-foreground">No campaigns created yet.</p>}
            </div>
          </section>
        </>
      )}

      <aside className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <strong>Publishing is not enabled in this agency portal.</strong>
        <p className="mt-1 text-xs text-muted-foreground">Campaigns are saved as drafts. Attached highlights enter operator review. Scheduling, Buffer dispatch and verified-post receipts remain disabled until the separate approval and publisher controls are connected.</p>
      </aside>
    </main>
  );
}
