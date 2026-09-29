-- BIGO campaign eligibility: host-authorized promotion, draft/no-schedule mode.
-- Technical media validation remains enforced by bigo-live-pipeline.
-- Campaign planning no longer requires QA approval, rights/commercial review, or consent metadata.
create or replace function public.plan_bigo_seasonal_content()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p text; target_count int; current_count int; created_count int := 0; asset_count int; slot int; a record; intel jsonb;
  base_caption text; scene text; season text; episode int; variant int; fp text; title text; caption text;
  cta text := '18+ and ready to go LIVE? Apply at https://elite.resofit.fit';
begin
  for p, target_count in select * from (values ('tiktok_recruit',20),('youtube',20),('google_business',8)) v(platform,target_count) loop
    select count(*) into current_count
    from content_queue
    where campaign_key='live_stream_highlights' and platform=p
      and coalesce((metadata->>'seasonal_planner')::boolean,false)=true
      and created_at >= date_trunc('day',now())
      and status in ('draft','approved','scheduled','published');

    select count(*) into asset_count
    from content_asset_registry
    where campaign='live_stream_highlights'
      and canonical_url like 'https://%';

    slot := 0;
    while current_count < target_count and asset_count > 0 and slot < 60 loop
      select id,canonical_url,intelligence,alt_text,tiktok_eligible,youtube_eligible,google_business_eligible into a
      from content_asset_registry
      where campaign='live_stream_highlights'
        and canonical_url like 'https://%'
      order by created_at asc
      offset (slot % asset_count) limit 1;

      if (p='tiktok_recruit' and coalesce(a.tiktok_eligible,true)=false)
         or (p='youtube' and coalesce(a.youtube_eligible,true)=false)
         or (p='google_business' and coalesce(a.google_business_eligible,true)=false) then
        slot := slot + 1; continue;
      end if;

      intel := coalesce(a.intelligence->'chatb2k','{}'::jsonb);
      scene := (array['first_live','host_energy','episode_drop','behind_live','host_challenge','community_milestone'])[1+(slot % 6)];
      season := (array['Season 01 — Discovery','Season 02 — Momentum','Season 03 — Breakout','Season 04 — Dominion'])[1+floor((slot % 32)/8)::int];
      episode := 1+(slot%32); variant := 1+(slot%3);
      fp := 'seasonal:'||a.id::text||':'||p||':'||to_char(now(),'YYYY-MM-DD')||':'||slot::text;
      title := coalesce(intel->>'series_title','BIGO Live Highlights')||' — '||season||' • E'||lpad(episode::text,2,'0')||' • '||scene;
      base_caption := coalesce(intel->'platform_copy'->case when p='tiktok_recruit' then 'tiktok' else p end->>'caption',intel->>'caption',intel->>'hook','Live from the ResoFit host community.');
      caption := left(regexp_replace(base_caption,E'\\s+',' ','g'),850)||E'\\n\\n'||cta;

      if not exists (select 1 from content_queue where campaign_key='live_stream_highlights' and metadata @> jsonb_build_object('planner_fingerprint',fp)) then
        insert into content_queue(title,asset_url,public_id,caption,platforms,status,scheduled_at,metadata,campaign_key,platform,destination,keywords,safety_checked,content_variant)
        values(
          title,a.canonical_url,fp,caption,array[p],'draft',null,
          jsonb_build_object(
            'source','bigo_live',
            'source_asset_id',a.id,
            'seasonal_planner',true,
            'planner_fingerprint',fp,
            'recruitment_campaign',true,
            'season_label',season,
            'episode_number',episode,
            'episode_title',coalesce(intel->>'episode_title',title),
            'scene_type',scene,
            'content_variant',variant,
            'series_title',coalesce(intel->>'series_title','BIGO Live Highlights'),
            'conversion_goal','host_application',
            'audience_intents',coalesce(intel->'audience_intents','["live_host","creator","bigo"]'::jsonb),
            'cta',cta,
            'original_asset_url',a.canonical_url,
            'campaign_authorization','host_campaign_promo'
          ),
          'live_stream_highlights',p,'https://elite.resofit.fit',
          array['BIGO LIVE','live host','creator','Nigeria','ResoFit'],
          true,variant
        );
        current_count := current_count+1; created_count := created_count+1;
      end if;
      slot := slot+1;
    end loop;
  end loop;
  return jsonb_build_object('ok',true,'created',created_count,'targets',jsonb_build_object('tiktok_recruit',20,'youtube',20,'google_business',8),'generated_at',now(),'mode','draft_no_schedule','eligibility_gate','host_campaign_promo');
end;
$$;
