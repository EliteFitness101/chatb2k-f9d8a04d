create table if not exists public.google_business_locations (
  place_id text primary key,
  location_key text not null unique,
  display_name text not null,
  address text not null,
  google_account_email text not null,
  maps_url text not null,
  api_resource_name text,
  verification_status text not null default 'unverified',
  profile_status text not null default 'not_audited',
  last_audited_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_business_locations enable row level security;
revoke all on public.google_business_locations from anon, authenticated;
grant all on public.google_business_locations to service_role;

insert into public.google_business_locations
  (place_id, location_key, display_name, address, google_account_email, maps_url, metadata)
values
  (
    '0x1069d35a80b7c161:0x9bc49c393bb44d5',
    'resonance-fitness-location-a',
    'Resonance Fitness',
    'Address pending authenticated account verification',
    'resonancefitnessng@gmail.com',
    'https://www.google.com/maps/place//data=!4m2!3m1!1s0x1069d35a80b7c161:0x9bc49c393bb44d5',
    '{"source":"user-provided Maps URL","identity_verified_by":"place_id","google_profile_api_verified":false}'::jsonb
  ),
  (
    '0x1042ddead8b20d37:0xfb82f5470e0b1696',
    'resonance-fitness-ubakala-umuahia',
    'Resonance Fitness',
    '2 Amibo, Ubakala, Umuahia 440001, Abia State, Nigeria',
    'resonancefitnessng@gmail.com',
    'https://www.google.com/maps/place/Resonance+Fitness,+2+Amibo,+Ubakala,+Umuahia+440001,+Abia/@5.5163515,7.4864176,15z/data=!4m6!3m5!1s0x1042ddead8b20d37:0xfb82f5470e0b1696!8m2!3d5.5163515!4d7.4864176!16s%2Fg%2F11ylskvh5t',
    '{"source":"user-provided Maps URL","identity_verified_by":"place_id","google_profile_api_verified":false}'::jsonb
  )
on conflict (place_id) do update set
  location_key = excluded.location_key,
  display_name = excluded.display_name,
  address = excluded.address,
  google_account_email = excluded.google_account_email,
  maps_url = excluded.maps_url,
  metadata = public.google_business_locations.metadata || excluded.metadata,
  updated_at = now();
