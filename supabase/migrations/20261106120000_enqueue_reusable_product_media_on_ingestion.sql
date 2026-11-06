-- Product-ingestion-triggered reusable media enrichment queue.
-- Additive only: existing catalog, factory, storage, checkout and fulfillment remain authoritative.
-- Jobs are created during ingestion/enrichment; customer payment is not required to create reusable assets.

create table if not exists public.commerce_media_enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  source_entity text not null,
  source_record_id text not null,
  source_sku text null,
  source_handle text null,
  source_title text not null,
  source_snapshot jsonb not null,
  generation_spec jsonb not null default '{}'::jsonb,
  asset_plan jsonb not null default '[]'::jsonb,
  storage_route text not null default 'resofit_r2_primary',
  status text not null default 'queued'
    check (status in ('queued','held','processing','qa','ready','failed','superseded')),
  priority integer not null default 50,
  idempotency_key text not null unique,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz null,
  last_error_code text null,
  last_error_detail text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists commerce_media_enrichment_queue_idx
  on public.commerce_media_enrichment_jobs(status, priority, next_attempt_at, created_at);
create index if not exists commerce_media_enrichment_source_idx
  on public.commerce_media_enrichment_jobs(source_entity, source_record_id, created_at desc);

create table if not exists public.commerce_media_asset_links (
  id uuid primary key default gen_random_uuid(),
  enrichment_job_id uuid not null references public.commerce_media_enrichment_jobs(id) on delete cascade,
  source_entity text not null,
  source_record_id text not null,
  asset_registry_id uuid null references public.content_asset_registry(id) on delete set null,
  asset_role text not null,
  asset_type text not null,
  canonical_url text null,
  storage_provider text null,
  storage_bucket text null,
  storage_key text null,
  content_sha256 text null,
  qa_status text not null default 'pending',
  reuse_scope text not null default 'same_product_and_equivalent_products',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_media_asset_link_role_uq unique(enrichment_job_id, asset_role, asset_type)
);

create index if not exists commerce_media_asset_lookup_idx
  on public.commerce_media_asset_links(source_entity, source_record_id, qa_status);

alter table public.commerce_media_enrichment_jobs enable row level security;
alter table public.commerce_media_asset_links enable row level security;

comment on table public.commerce_media_enrichment_jobs is
  'Idempotent ingestion-time queue for reusable product, collection, offer and arrival media/guides. Queueing is independent of checkout.';
comment on table public.commerce_media_asset_links is
  'Maps generated or reused content assets to products, collections, offers and campaigns with provenance and QA state.';

create or replace function public.enqueue_commerce_media_enrichment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data jsonb := to_jsonb(new);
  source_data jsonb;
  record_id text;
  sku text;
  handle text;
  title text;
  snapshot jsonb;
  key text;
  eligible boolean := true;
  entity_name text := tg_table_name;
begin
  source_data := row_data;
  if entity_name = 'product_sources' then
    select to_jsonb(p) || row_data into source_data
    from public.products p
    where p.id = nullif(row_data->>'product_id','')::uuid;
    if source_data is null then return new; end if;
    record_id := source_data->>'product_id';
  else
    record_id := coalesce(row_data->>'id', row_data->>'handle', row_data->>'sku');
  end if;
  sku := nullif(coalesce(source_data->>'sku', source_data->>'source_product_sku'), '');
  handle := nullif(coalesce(source_data->>'handle', source_data->>'slug'), '');
  title := nullif(coalesce(source_data->>'title', source_data->>'product_title', source_data->>'service_name'), '');
  if record_id is null or title is null then
    return new;
  end if;

  -- Do not turn unapproved supplier inventory into a resale-ready asset package.
  if entity_name = 'supplier_products' then
    eligible := lower(coalesce(row_data->>'resale_status','')) in ('authorized','approved','verified','active')
      and coalesce(row_data->>'resale_status','') <> '';
  elsif entity_name = 'product_sources' then
    eligible := coalesce((row_data->>'resale_authorized')::boolean,false)
      or coalesce((row_data->>'media_authorized')::boolean,false);
  elsif entity_name = 'commerce_offers' then
    eligible := lower(coalesce(row_data->'metadata'->>'resale_authorized','')) in ('true','1','yes')
      or lower(coalesce(row_data->'metadata'->>'media_authorized','')) in ('true','1','yes');
  end if;

  snapshot := jsonb_strip_nulls(jsonb_build_object(
    'source_entity', entity_name,
    'source_record_id', record_id,
    'sku', sku,
    'handle', handle,
    'title', title,
    'description', coalesce(source_data->>'description', source_data->>'body_html'),
    'product_type', coalesce(source_data->>'product_type', source_data->>'collection_type'),
    'vendor', source_data->>'vendor',
    'tags', source_data->'tags',
    'features', coalesce(source_data->'features', source_data->'attributes', source_data->'raw_payload', source_data->'metadata'),
    'usage_instructions', coalesce(source_data->>'usage_instructions', source_data->>'instructions', source_data->>'how_to_use', source_data->>'setup_instructions'),
    'source_url', coalesce(row_data->>'source_url', source_data->>'product_url', source_data->>'source_url', source_data->>'external_url'),
    'image_url', coalesce(source_data->>'image_url', source_data->>'image_src'),
    'price', coalesce(source_data->'price', source_data->'variant_price'),
    'currency', source_data->>'currency',
    'availability', coalesce(source_data->>'availability', source_data->>'stock_status'),
    'fulfillment_mode', coalesce(source_data->>'fulfillment_mode', source_data->>'fulfillment_type'),
    'source_status', coalesce(row_data->>'status', source_data->>'status', source_data->>'resale_status'),
    'metadata', coalesce(row_data->'metadata', source_data->'metadata'),
    'source_provenance', case when entity_name = 'product_sources' then row_data else null end
  ));
  key := entity_name || ':' || record_id || ':' || md5(snapshot::text);

  insert into public.commerce_media_enrichment_jobs (
    source_entity, source_record_id, source_sku, source_handle, source_title,
    source_snapshot, generation_spec, asset_plan, storage_route, status, idempotency_key
  ) values (
    entity_name, record_id, sku, handle, title, snapshot,
    jsonb_build_object(
      'schema_version', 1,
      'strategy', 'reuse_first_generate_gaps',
      'fact_policy', 'verified_source_facts_only',
      'customer_charge', 0,
      'funding_policy', 'supplier_markup_30pct_shared_vas_pool',
      'asset_types', jsonb_build_array('digital_guide','manual','setup_guide','short_video','product_images','social_support'),
      'qa_required', true,
      'reuse_key_fields', jsonb_build_array('source_sku','source_handle','product_type','feature_fingerprint')
    ),
    jsonb_build_array(
      jsonb_build_object('role','quick_start_guide','type','digital_guide','required',true),
      jsonb_build_object('role','product_manual','type','manual','required',false),
      jsonb_build_object('role','setup_video','type','video','required',false),
      jsonb_build_object('role','feature_explainer','type','video','required',false),
      jsonb_build_object('role','product_visuals','type','image_set','required',false)
    ),
    'resofit_r2_primary',
    case when eligible then 'queued' else 'held' end,
    key
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_products_media_enrichment on public.products;
create trigger trg_products_media_enrichment
after insert or update of title, body_html, vendor, product_type, tags, sku, image_src, fulfillment_mode
on public.products for each row execute function public.enqueue_commerce_media_enrichment();

drop trigger if exists trg_supplier_products_media_enrichment on public.supplier_products;
create trigger trg_supplier_products_media_enrichment
after insert or update of title, description, product_url, sku, image_url, raw_payload, resale_status
on public.supplier_products for each row execute function public.enqueue_commerce_media_enrichment();

drop trigger if exists trg_store_products_media_enrichment on public.store_products;
create trigger trg_store_products_media_enrichment
after insert or update of title, description, slug, source_product_sku, metadata, asset_url
on public.store_products for each row execute function public.enqueue_commerce_media_enrichment();

drop trigger if exists trg_product_sources_media_enrichment on public.product_sources;
create trigger trg_product_sources_media_enrichment
after insert or update of product_id, source_url, resale_authorized, media_authorized, status
on public.product_sources for each row execute function public.enqueue_commerce_media_enrichment();

drop trigger if exists trg_commerce_offers_media_enrichment on public.commerce_offers;
create trigger trg_commerce_offers_media_enrichment
after insert or update of title, external_url, price, availability, metadata
on public.commerce_offers for each row execute function public.enqueue_commerce_media_enrichment();

drop trigger if exists trg_collection_registry_media_enrichment on public.resofit_collection_registry;
create trigger trg_collection_registry_media_enrichment
after insert or update of title, metadata, hero_asset, details_asset, gallery_assets, seo_title, seo_description, tags, status
on public.resofit_collection_registry for each row execute function public.enqueue_commerce_media_enrichment();

-- Route preference is explicit and auditable. R2 is the primary ResoFit CDN route;
-- Supabase Storage remains an available fallback. Other providers are not marked active
-- until their credentials, upload path, public/private policy and retrieval are verified.
create table if not exists public.chatb2k_media_storage_routes (
  route_key text primary key,
  provider text not null check (provider in ('cloudflare_r2','supabase_storage','dropbox','google_drive','vercel_blob')),
  bucket_or_namespace text not null,
  public_base_url text null,
  route_role text not null check (route_role in ('primary','fallback','archive')),
  enabled boolean not null default false,
  verified_at timestamptz null,
  verification_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.chatb2k_media_storage_routes
(route_key,provider,bucket_or_namespace,public_base_url,route_role,enabled,verification_evidence)
values
('resofit_r2_primary','cloudflare_r2','resofit-cdn','https://media.resofit.fit','primary',true,
 jsonb_build_object('evidence','Existing resofit-media-control-plane v29 and R2 worker health implementation; runtime health still required per job')),
('supabase_digital_product_media_fallback','supabase_storage','digital-product-media',null,'fallback',true,
 jsonb_build_object('evidence','Existing digital-product-media bucket confirmed in Supabase Storage')),
('dropbox_archive','dropbox','ChatB2K media archive',null,'archive',false,
 jsonb_build_object('evidence','Connector or server credential and upload/read verification required')),
('google_drive_archive','google_drive','ChatB2K media archive',null,'archive',false,
 jsonb_build_object('evidence','OAuth/service identity and upload/read verification required')),
('vercel_blob_archive','vercel_blob','ChatB2K media archive',null,'archive',false,
 jsonb_build_object('evidence','Token and upload/read verification required'))
on conflict (route_key) do update set
  provider=excluded.provider,
  bucket_or_namespace=excluded.bucket_or_namespace,
  public_base_url=excluded.public_base_url,
  route_role=excluded.route_role,
  verification_evidence=excluded.verification_evidence,
  updated_at=now();

alter table public.chatb2k_media_storage_routes enable row level security;
