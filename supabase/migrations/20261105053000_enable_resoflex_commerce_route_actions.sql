-- Additive allow-list expansion for the existing ResoFlex Edge Node route.
-- No credentials, source permissions, product visibility, pricing, inventory or checkout state are changed.
UPDATE public.chatb2k_provider_routes
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{allowed_actions}',
  (
    SELECT jsonb_agg(action_name ORDER BY action_name)
    FROM (
      SELECT DISTINCT value AS action_name
      FROM jsonb_array_elements_text(COALESCE(config->'allowed_actions', '[]'::jsonb))
      UNION
      SELECT unnest(ARRAY[
        'health',
        'export_registry',
        'crawl',
        'ingest_discovery',
        'ingest_feed',
        'record_comparison'
      ]) AS action_name
    ) allowed
  ),
  true
),
updated_at = now()
WHERE route_id = 'orchestration-resoflex-commerce-intelligence';
