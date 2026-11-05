-- Enable safe outbound supplier listing links for independently checked product-page identities.
-- This does NOT enable resale, supplier checkout inside ResoFit, stock, price display, media reuse,
-- inventory, or publication of any supplier offer. It only allows a customer to open the supplier's
-- own listing from a hybrid collection card when the direct URL and product identity were checked.
WITH verified(registry_product_id, evidence_ref, freshness) AS (
  VALUES
    ('e91e26f0-6707-42bd-8f84-0b9ea4e77ea8'::text, 'turn257063view0', 'cached_page_identity_only'),
    ('a6b1da54-bbce-44e7-94ce-899a62385aeb'::text, 'turn257063view1', 'cached_page_identity_only'),
    ('a8767c11-81d6-40d8-addd-bda971ccbfc0'::text, 'turn257063view2', 'cached_page_identity_only'),
    ('10f3f4f9-a869-49c1-b7ae-b68b8bca6fbe'::text, 'turn257063view3', 'cached_page_identity_only'),
    ('e7114107-c9e9-48c9-b1ce-3610c702b742'::text, 'turn257063view4', 'cached_page_identity_only'),
    ('b6d3acbd-f3c4-4080-9323-f2b13c918c7a'::text, 'turn257063view5', 'cached_page_identity_only'),
    ('e51aa0d4-ca40-4f9d-8855-00f94b62a8fa'::text, 'turn257063view6', 'recent_page_identity_only'),
    ('f6b89f06-79c2-4657-b0d5-89a32e58dc8a'::text, 'turn257063view7', 'cached_page_identity_only'),
    ('6c0328cc-169a-4365-9763-64f99759c2bb'::text, 'turn360230view0', 'same_day_page_fetch')
),
updated AS (
  SELECT e.id,
         jsonb_agg(
           CASE
             WHEN item->>'registry_product_id' = v.registry_product_id
              AND item->>'source_product_url' IS NOT NULL
             THEN item || jsonb_build_object(
               'source_page_verified', true,
               'source_listing_mode', 'supplier_direct_listing_only',
               'purchase_enabled', false,
               'price_visibility', 'hidden',
               'source_page_evidence', jsonb_build_object(
                 'method', 'web_page_identity_review',
                 'evidence_reference', v.evidence_ref,
                 'product_url', item->>'source_product_url',
                 'checked_on', '2026-11-05',
                 'page_content_freshness', v.freshness,
                 'scope', 'direct_url_and_product_identity_only',
                 'current_price_verified', false,
                 'current_stock_verified', false,
                 'supplier_checkout_flow_verified', false,
                 'resale_authorization_verified', false,
                 'media_rights_verified', false
               )
             )
             ELSE item
           END
           ORDER BY ord
         ) AS items
  FROM public.experience_page_registry e
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.manifest->'items', '[]'::jsonb))
    WITH ORDINALITY AS x(item, ord)
  LEFT JOIN verified v ON v.registry_product_id = item->>'registry_product_id'
  WHERE e.page_type = 'commerce_collection'
    AND e.template_key = 'commerce_collection_v1'
    AND e.slug IN ('home-gym-starter','mobility-yoga','strength-evolution','performance-gym','elite-creator-fitness')
    AND e.status = 'draft'
  GROUP BY e.id
)
UPDATE public.experience_page_registry e
SET manifest = jsonb_set(COALESCE(e.manifest, '{}'::jsonb), '{items}', u.items, true),
    version = COALESCE(e.version, 1) + 1,
    updated_at = now()
FROM updated u
WHERE e.id = u.id;

-- Explicitly retain the first-party and Elite101 checkout boundaries in every draft collection.
UPDATE public.experience_page_registry
SET manifest = jsonb_set(
      COALESCE(manifest, '{}'::jsonb),
      '{checkout}',
      COALESCE(manifest->'checkout', '{}'::jsonb) || jsonb_build_object(
        'first_party_authority', 'paystack-init',
        'elite_service_authority', 'elite-media-checkout',
        'external_candidate_purchase_enabled', false,
        'mixed_external_cart_supported', false,
        'external_listing_links_only', true
      ),
      true
    ),
    updated_at = now()
WHERE page_type = 'commerce_collection'
  AND template_key = 'commerce_collection_v1'
  AND slug IN ('home-gym-starter','mobility-yoga','strength-evolution','performance-gym','elite-creator-fitness')
  AND status = 'draft';
