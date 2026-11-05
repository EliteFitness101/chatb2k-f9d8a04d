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


-- Seed five review-only hybrid collection manifests. Public catalog API exposes
-- only status='published'; these draft rows do not create customer-visible pages.
WITH collections(page_type,source_type,source_key,slug,canonical_path,template_key,manifest,seo,commerce,access) AS (
  VALUES
  ('commerce_collection','commerce','hybrid:home-gym-starter','home-gym-starter','/shop/collection/home-gym-starter','commerce_collection_v1',
   '{"title":"ResoFlex Home Gym Starter","description":"Home-training equipment discovery paired with ResoFit digital plans.","collection_type":"hybrid","currency":"NGN","reference_domains":["elite.resofit.fit","shop.resofit.fit","store.resofit.fit","resofit.fit"],"filters":["category","brand","price","vendor","resale_price","fulfillment_mode","delivery_method","jumia_express","pickup_location"],"items":[{"kind":"external_candidate","source_code":"JUMIA_NG","external_product_id":"JUMIA-DISC-f2ae2eb90e956385f45994bce2395def","title":"Adjustable Jump Skipping Rope Cable For Adults/Kids","status":"blocked_unverified","purchase_enabled":false,"price_visibility":"hidden","fulfillment_mode":"physical","direct_product_url_verified":false,"source_category_url":"https://www.jumia.com.ng/exercise-fitness-accessories/"},{"kind":"external_candidate","source_code":"JUMIA_NG","external_product_id":"JUMIA-DISC-61d767d065a091bd31dc743eb8c6a99a","title":"5 In 1 Resistance Exercise Band Yoga Pilates Fitness","status":"blocked_unverified","purchase_enabled":false,"price_visibility":"hidden","fulfillment_mode":"physical","direct_product_url_verified":false,"source_category_url":"https://www.jumia.com.ng/mlp-yoga-equipment/"},{"kind":"external_candidate","source_code":"JUMIA_NG","external_product_id":"JUMIA-DISC-f314d05b432ab7662ce6eaa654f2363a","title":"4 Wheel Abdominal Exercise Roller + Knee Support","status":"blocked_unverified","purchase_enabled":false,"price_visibility":"hidden","fulfillment_mode":"physical","direct_product_url_verified":false,"source_category_url":"https://www.jumia.com.ng/mlp-sports-equipment/"},{"kind":"first_party_product","sku":"PAYSTACK-9_1FT_ADJUSTABLE_JUMP_ROPE_FITNESS_SKIPPING_ROPE_SOFT_FOAM","status":"requires_inventory_refresh","purchase_enabled":false,"fulfillment_mode":"physical","price_source":"catalog-public","inventory_freshness_required":true},{"kind":"first_party_product","sku":"PAYSTACK-RESISTANCE_BANDS_SET_100_LBS_TUBE_BANDS_11_PIECE_SET","status":"requires_inventory_refresh","purchase_enabled":false,"fulfillment_mode":"physical","price_source":"catalog-public","inventory_freshness_required":true},{"kind":"first_party_product","sku":"res-dig-reset","status":"published","purchase_enabled":true,"fulfillment_mode":"digital","price_source":"catalog-public"}],"checkout":{"first_party_authority":"paystack-init","external_candidate_purchase_enabled":false,"mixed_external_cart_supported":false}}'::jsonb,
   '{"title":"ResoFlex Home Gym Starter | ResoFit","description":"Home fitness equipment and guided ResoFit digital plans.","canonical_path":"/shop/collection/home-gym-starter"}'::jsonb,
   '{"currency":"NGN","checkout_authority":"paystack-init","external_items_allowed":false}'::jsonb,
   '{"visibility":"draft_until_ceo_publish","public_access_when_published":true}'::jsonb),
  ('commerce_collection','commerce','hybrid:mobility-yoga','mobility-yoga','/shop/collection/mobility-yoga','commerce_collection_v1',
   '{"title":"ResoFlex Mobility & Yoga","description":"Mobility and flexibility equipment paired with ResoFit nutrition and training guidance.","collection_type":"hybrid","currency":"NGN","reference_domains":["elite.resofit.fit","shop.resofit.fit","store.resofit.fit","resofit.fit"],"filters":["category","brand","price","vendor","resale_price","fulfillment_mode","delivery_method","jumia_express","pickup_location"],"items":[{"kind":"external_candidate","source_code":"JUMIA_NG","external_product_id":"JUMIA-DISC-6380788ed9dd0f70d9be5c7141b5edd4","title":"Premium Big Extra Thick Yoga Mat Non-Slip Exercise Mat With Carrying Bag","status":"blocked_unverified","purchase_enabled":false,"price_visibility":"hidden","fulfillment_mode":"physical","direct_product_url_verified":false,"source_category_url":"https://www.jumia.com.ng/yoga/"},{"kind":"external_candidate","source_code":"JUMIA_NG","external_product_id":"JUMIA-DISC-9bcb49006b89bf75ec9c98c4ed27a419","title":"Yoga Gym Ball Anti Burst With Pump","status":"blocked_unverified","purchase_enabled":false,"price_visibility":"hidden","fulfillment_mode":"physical","direct_product_url_verified":false,"source_category_url":"https://www.jumia.com.ng/mlp-yoga-equipment/"},{"kind":"external_candidate","source_code":"JUMIA_NG","external_product_id":"JUMIA-DISC-41a858823d35ecf07a72d3928de373cb","title":"Portable Yoga Pilates Bar Stick With Resistance","status":"blocked_unverified","purchase_enabled":false,"price_visibility":"hidden","fulfillment_mode":"physical","direct_product_url_verified":false,"source_category_url":"https://www.jumia.com.ng/mlp-yoga-equipment/"},{"kind":"first_party_product","sku":"SHOPIFY-PRODUCT-10403922870552","status":"published","purchase_enabled":true,"fulfillment_mode":"digital","price_source":"catalog-public"},{"kind":"first_party_product","sku":"SHOPIFY-PRODUCT-10403922903320","status":"published","purchase_enabled":true,"fulfillment_mode":"digital","price_source":"catalog-public"}],"checkout":{"first_party_authority":"paystack-init","external_candidate_purchase_enabled":false,"mixed_external_cart_supported":false}}'::jsonb,
   '{"title":"ResoFlex Mobility & Yoga | ResoFit","description":"Mobility equipment with ResoFit meal and workout guidance.","canonical_path":"/shop/collection/mobility-yoga"}'::jsonb,
   '{"currency":"NGN","checkout_authority":"paystack-init","external_items_allowed":false}'::jsonb,
   '{"visibility":"draft_until_ceo_publish","public_access_when_published":true}'::jsonb),
  ('commerce_collection','commerce','hybrid:strength-evolution','strength-evolution','/shop/collection/strength-evolution','commerce_collection_v1',
   '{"title":"ResoFlex Strength Evolution","description":"Strength equipment candidates paired with ResoFit 90-day digital fitness evolution plans.","collection_type":"hybrid","currency":"NGN","reference_domains":["elite.resofit.fit","shop.resofit.fit","store.resofit.fit","resofit.fit"],"filters":["category","brand","price","vendor","resale_price","fulfillment_mode","delivery_method","jumia_express","pickup_location"],"items":[{"kind":"external_candidate","source_code":"JUMIA_NG","external_product_id":"JUMIA-DISC-43af091d28bc07b4ae606f5d2bbeefbd","title":"10KG Dumbbell Set With Barbell Extension","status":"blocked_unverified","purchase_enabled":false,"price_visibility":"hidden","fulfillment_mode":"physical","direct_product_url_verified":false,"source_category_url":"https://www.jumia.com.ng/mlp-gym-dumbbells/"},{"kind":"external_candidate","source_code":"JUMIA_NG","external_product_id":"JUMIA-DISC-1f232c61aa182a1caca867089bca7bbb","title":"Well Built 15KG Dumbbell Set With Barbell Extension","status":"blocked_unverified","purchase_enabled":false,"price_visibility":"hidden","fulfillment_mode":"physical","direct_product_url_verified":false,"source_category_url":"https://www.jumia.com.ng/mlp-dumbbells/"},{"kind":"external_candidate","source_code":"JUMIA_NG","external_product_id":"JUMIA-DISC-0109b887f00e6853527bd6ff86383ec4","title":"Cool 30KG Dumbbell Set With Barbell Extension","status":"blocked_unverified","purchase_enabled":false,"price_visibility":"hidden","fulfillment_mode":"physical","direct_product_url_verified":false,"source_category_url":"https://www.jumia.com.ng/mlp-dumbbells/"},{"kind":"external_candidate","source_code":"JUMIA_NG","external_product_id":"JUMIA-DISC-2ce099ace49d8b4b379e3afe449a2538","title":"7ft Olympic Bar","status":"blocked_unverified","purchase_enabled":false,"price_visibility":"hidden","fulfillment_mode":"physical","direct_product_url_verified":false,"source_category_url":"https://www.jumia.com.ng/mlp-sports-equipment/"},{"kind":"first_party_product","sku":"SHOPIFY-PRODUCT-10410533650712","status":"published","purchase_enabled":true,"fulfillment_mode":"digital","price_source":"catalog-public"},{"kind":"first_party_product","sku":"SHOPIFY-PRODUCT-10403922903320","status":"published","purchase_enabled":true,"fulfillment_mode":"digital","price_source":"catalog-public"}],"checkout":{"first_party_authority":"paystack-init","external_candidate_purchase_enabled":false,"mixed_external_cart_supported":false}}'::jsonb,
   '{"title":"ResoFlex Strength Evolution | ResoFit","description":"Strength equipment discovery paired with 90-day ResoFit digital fitness guidance.","canonical_path":"/shop/collection/strength-evolution"}'::jsonb,
   '{"currency":"NGN","checkout_authority":"paystack-init","external_items_allowed":false}'::jsonb,
   '{"visibility":"draft_until_ceo_publish","public_access_when_published":true}'::jsonb),
  ('commerce_collection','commerce','hybrid:performance-gym','performance-gym','/shop/collection/performance-gym','commerce_collection_v1',
   '{"title":"ResoFlex Performance Gym","description":"Performance equipment discovery paired with ResoFlex coaching and digital training support.","collection_type":"hybrid","currency":"NGN","reference_domains":["elite.resofit.fit","shop.resofit.fit","store.resofit.fit","resofit.fit"],"filters":["category","brand","price","vendor","resale_price","fulfillment_mode","delivery_method","jumia_express","pickup_location"],"items":[{"kind":"external_candidate","source_code":"JUMIA_NG","external_product_id":"JUMIA-DISC-636a441efa3a9e20317b1a16c44ba02a","title":"50kg Chrome Box Dumbbell","status":"blocked_unverified","purchase_enabled":false,"price_visibility":"hidden","fulfillment_mode":"physical","direct_product_url_verified":false,"source_category_url":"https://www.jumia.com.ng/mlp-sports-equipment/"},{"kind":"external_candidate","source_code":"JUMIA_NG","external_product_id":"JUMIA-DISC-e2ba46e4a74d4b4224872a8cf6af7c83","title":"Power Tower With Bench","status":"blocked_unverified","purchase_enabled":false,"price_visibility":"hidden","fulfillment_mode":"physical","direct_product_url_verified":false,"source_category_url":"https://www.jumia.com.ng/mlp-sports-equipment/"},{"kind":"external_candidate","source_code":"JUMIA_NG","external_product_id":"JUMIA-DISC-81e2ad570d38f015b84f770332df3e6e","title":"Sports World Magnetic Bike Fitness Exercise","status":"blocked_unverified","purchase_enabled":false,"price_visibility":"hidden","fulfillment_mode":"physical","direct_product_url_verified":false,"source_category_url":"https://www.jumia.com.ng/mlp-sports-equipment/"},{"kind":"first_party_product","sku":"SHOPIFY-PRODUCT-10403924869400","status":"published","purchase_enabled":true,"fulfillment_mode":"digital","price_source":"catalog-public"}],"checkout":{"first_party_authority":"paystack-init","external_candidate_purchase_enabled":false,"mixed_external_cart_supported":false}}'::jsonb,
   '{"title":"ResoFlex Performance Gym | ResoFit","description":"Performance equipment discovery paired with ResoFlex coaching.","canonical_path":"/shop/collection/performance-gym"}'::jsonb,
   '{"currency":"NGN","checkout_authority":"paystack-init","external_items_allowed":false}'::jsonb,
   '{"visibility":"draft_until_ceo_publish","public_access_when_published":true}'::jsonb),
  ('commerce_collection','commerce','hybrid:elite-creator-fitness','elite-creator-fitness','/shop/collection/elite-creator-fitness','commerce_collection_v1',
   '{"title":"Elite Creator Fitness Launch","description":"Fitness equipment discovery paired with Elite101 creator production and monetization services.","collection_type":"hybrid","currency":"NGN","reference_domains":["elite.resofit.fit","shop.resofit.fit","store.resofit.fit","resofit.fit"],"filters":["category","brand","price","vendor","resale_price","fulfillment_mode","delivery_method","jumia_express","pickup_location"],"items":[{"kind":"external_candidate","source_code":"JUMIA_NG","external_product_id":"JUMIA-DISC-5527228fafcfb77bb46af71d87998302","title":"Fitness Exercise Abdominal Wheel","status":"blocked_unverified","purchase_enabled":false,"price_visibility":"hidden","fulfillment_mode":"physical","direct_product_url_verified":false,"source_category_url":"https://www.jumia.com.ng/mlp-sports-equipment/"},{"kind":"external_candidate","source_code":"JUMIA_NG","external_product_id":"JUMIA-DISC-7b6e26f1154b485d78dd58d48743c172","title":"11 Pcs Set Resistance Exercising Band Yoga Rope Pull","status":"blocked_unverified","purchase_enabled":false,"price_visibility":"hidden","fulfillment_mode":"physical","direct_product_url_verified":false,"source_category_url":"https://www.jumia.com.ng/mlp-resistance-band/"},{"kind":"elite_service","service_slug":"highlight-launch-pack","title":"Elite101 Highlight Launch Pack","status":"active_offer","purchase_enabled":true,"checkout_mode":"separate","currency":"USD","payment_authority":"elite-media-checkout","href":"/offers/highlight-launch-pack"},{"kind":"elite_service","service_slug":"creator-starter","title":"Elite101 Creator Starter","status":"active_offer","purchase_enabled":true,"checkout_mode":"separate","currency":"USD","payment_authority":"elite-media-checkout","href":"/offers/creator-starter"},{"kind":"elite_service","service_slug":"creator-pro","title":"Elite101 Creator Pro","status":"active_offer","purchase_enabled":true,"checkout_mode":"separate","currency":"USD","payment_authority":"elite-media-checkout","href":"/offers/creator-pro"}],"checkout":{"first_party_authority":"paystack-init","elite101_service_authority":"elite-media-checkout","external_candidate_purchase_enabled":false,"mixed_external_cart_supported":false,"cross_checkout_mode":"separate_payment_authorities"}}'::jsonb,
   '{"title":"Elite Creator Fitness Launch | Elite NG","description":"A cross-sell collection pairing fitness equipment discovery with Elite101 creator services.","canonical_path":"/shop/collection/elite-creator-fitness"}'::jsonb,
   '{"currency":"NGN","checkout_authority":"paystack-init","elite_service_checkout_authority":"elite-media-checkout","external_items_allowed":false}'::jsonb,
   '{"visibility":"draft_until_ceo_publish","public_access_when_published":true}'::jsonb)
)
INSERT INTO public.experience_page_registry
  (page_type,source_type,source_key,slug,canonical_path,template_key,status,version,manifest,seo,commerce,booking,access,media)
SELECT
  c.page_type,c.source_type,c.source_key,c.slug,c.canonical_path,c.template_key,'draft',1,c.manifest,c.seo,c.commerce,'{}'::jsonb,c.access,'{}'::jsonb
FROM collections c
WHERE NOT EXISTS (
  SELECT 1 FROM public.experience_page_registry e
  WHERE e.source_type=c.source_type AND e.source_key=c.source_key
);


-- Keep a single hidden admin/reconciliation manifest for all 58 Jumia candidates.
-- Prices are intentionally omitted: all offer rows are discovery-only and unverified.
WITH candidate_items AS (
  SELECT
    count(*) AS total,
    jsonb_agg(
      jsonb_build_object(
        'kind','external_candidate',
        'source_code','JUMIA_NG',
        'source_offer_id',co.id,
        'external_product_id',co.external_id,
        'title',co.title,
        'status','blocked_unverified',
        'purchase_enabled',false,
        'price_visibility','hidden',
        'fulfillment_mode','physical',
        'direct_product_url_verified',false,
        'stock_verified',false,
        'source_category_url',co.external_url
      ) ORDER BY co.title
    ) AS items
  FROM public.commerce_offers co
  JOIN public.commerce_sources cs ON cs.id=co.source_id
  WHERE cs.name='Jumia Nigeria'
    AND co.metadata->>'discovery_only'='true'
)
INSERT INTO public.experience_page_registry
  (page_type,source_type,source_key,slug,canonical_path,template_key,status,version,manifest,seo,commerce,booking,access,media)
SELECT
  'commerce_collection','commerce','jumia:discovery:58','jumia-discovery-58',
  '/shop/collection/jumia-discovery-58','commerce_collection_v1','draft',1,
  jsonb_build_object(
    'title','Jumia Nigeria — 58 Discovery Candidates',
    'description','Admin reconciliation manifest for 58 Jumia physical-product candidates. No direct product pages, live stock, resale rights or checkout eligibility are asserted.',
    'collection_type','supplier_discovery',
    'source_code','JUMIA_NG',
    'candidate_count',ci.total,
    'items',coalesce(ci.items,'[]'::jsonb),
    'checkout',jsonb_build_object('external_candidate_purchase_enabled',false,'checkout_authority','none')
  ),
  jsonb_build_object('title','Jumia Discovery Reconciliation — ResoFit','description','Internal supplier discovery evidence; not a public product catalogue.'),
  jsonb_build_object('external_items_allowed',false,'checkout_authority','none'),
  '{}'::jsonb,
  jsonb_build_object('visibility','draft_admin_reconciliation_only'),
  '{}'::jsonb
FROM candidate_items ci
WHERE ci.total=58
  AND NOT EXISTS (
    SELECT 1 FROM public.experience_page_registry e
    WHERE e.source_type='commerce' AND e.source_key='jumia:discovery:58'
  );


-- Attach the new Edge Node candidate IDs to the relevant draft hybrid collections.
-- These are references only: the public collection endpoint resolves eligibility from
-- the main commerce registry at request time; no price, stock or purchase flag is seeded.
WITH additions(slug,items) AS (
  SELECT 'home-gym-starter', jsonb_build_array(
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','10f3f4f9-a869-49c1-b7ae-b68b8bca6fbe','title','Generic 1PC Elastic Training Band Legs Booty Exercise Bands Fitness Resistance Band','source_product_url','https://www.jumia.com.ng/generic-1pc-elastic-training-band-legs-booty-exercise-bands-fitness-resistance-band-70567031.html','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','e7114107-c9e9-48c9-b1ce-3610c702b742','title','Generic 3PCS Elastic Training Band Straps Legs Booty Exercise Bands / Yoga Fitness Resistance Band','source_product_url','https://www.jumia.com.ng/generic-3pcs-elastic-training-band-straps-legs-booty-exercise-bands-yoga-fitness-resistance-band-229878674.html','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','b6d3acbd-f3c4-4080-9323-f2b13c918c7a','title','Generic 11x Set Resistance Bands Workout Bands Elastic Fitness Exercise Training Tubes','source_product_url','https://www.jumia.com.ng/generic-11xset-resistance-bands-workout-bands-elastic-fitness-exercise-training-tubes-65769742.html','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','f6b89f06-79c2-4657-b0d5-89a32e58dc8a','title','Generic Adjustable Jump Skipping Rope Cable For Adults/Kids','source_product_url','https://www.jumia.com.ng/generic-adjustable-jump-skipping-rope-cable-for-adultskids-126444025.html','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','3c023248-2e05-471e-9bc5-9561cf2677c0','title','Generic 5 In 1 Resistance Exercise Band Yoga Pilates Fitness Sports','source_product_url','https://www.jumia.com.ng/generic-5-in-1-resistance-exercise-bandyoga-pilates-fitness-sports-404448545.html','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','e51aa0d4-ca40-4f9d-8855-00f94b62a8fa','title','Generic Well Built 15KG Dumbbell Set With Barbell Extension','source_product_url','https://www.jumia.com.ng/15kg-dumbbell-set-with-barbell-extension-generic-mpg8923902.html','fulfillment_mode','physical')
  )
  UNION ALL
  SELECT 'mobility-yoga', jsonb_build_array(
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','e7114107-c9e9-48c9-b1ce-3610c702b742','title','Generic 3PCS Elastic Training Band Straps Legs Booty Exercise Bands / Yoga Fitness Resistance Band','source_product_url','https://www.jumia.com.ng/generic-3pcs-elastic-training-band-straps-legs-booty-exercise-bands-yoga-fitness-resistance-band-229878674.html','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','b6d3acbd-f3c4-4080-9323-f2b13c918c7a','title','Generic 11x Set Resistance Bands Workout Bands Elastic Fitness Exercise Training Tubes','source_product_url','https://www.jumia.com.ng/generic-11xset-resistance-bands-workout-bands-elastic-fitness-exercise-training-tubes-65769742.html','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','3c023248-2e05-471e-9bc5-9561cf2677c0','title','Generic 5 In 1 Resistance Exercise Band Yoga Pilates Fitness Sports','source_product_url','https://www.jumia.com.ng/generic-5-in-1-resistance-exercise-bandyoga-pilates-fitness-sports-404448545.html','fulfillment_mode','physical')
  )
  UNION ALL
  SELECT 'strength-evolution', jsonb_build_array(
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','e51aa0d4-ca40-4f9d-8855-00f94b62a8fa','title','Generic Well Built 15KG Dumbbell Set With Barbell Extension','source_product_url','https://www.jumia.com.ng/15kg-dumbbell-set-with-barbell-extension-generic-mpg8923902.html','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','b6d3acbd-f3c4-4080-9323-f2b13c918c7a','title','Generic 11x Set Resistance Bands Workout Bands Elastic Fitness Exercise Training Tubes','source_product_url','https://www.jumia.com.ng/generic-11xset-resistance-bands-workout-bands-elastic-fitness-exercise-training-tubes-65769742.html','fulfillment_mode','physical')
  )
  UNION ALL
  SELECT 'performance-gym', jsonb_build_array(
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','e51aa0d4-ca40-4f9d-8855-00f94b62a8fa','title','Generic Well Built 15KG Dumbbell Set With Barbell Extension','source_product_url','https://www.jumia.com.ng/15kg-dumbbell-set-with-barbell-extension-generic-mpg8923902.html','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','f6b89f06-79c2-4657-b0d5-89a32e58dc8a','title','Generic Adjustable Jump Skipping Rope Cable For Adults/Kids','source_product_url','https://www.jumia.com.ng/generic-adjustable-jump-skipping-rope-cable-for-adultskids-126444025.html','fulfillment_mode','physical')
  )
  UNION ALL
  SELECT 'elite-creator-fitness', jsonb_build_array(
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','e91e26f0-6707-42bd-8f84-0b9ea4e77ea8','title','Adjustable Phone Holder Stand For Content Creation, Netflix','source_product_url','https://www.jumia.com.ng/generic-adjustable-phone-holder-stand-for-content-creation-netflix-388762336.html','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','a8767c11-81d6-40d8-addd-bda971ccbfc0','title','Vlogging Kit/Video Maker Kit + Mic + Tripod + Holder / Ring Light','source_product_url','https://www.jumia.com.ng/vlogging-kitvideo-maker-kit-mictripodholder-ring-light-generic-mpg9591483.html','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','JUMIA_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','a6b1da54-bbce-44e7-94ce-899a62385aeb','title','Vlogging Kit/Video Maker Kit + Mic + Tripod + Holder / Ring Light','source_product_url','https://www.jumia.com.ng/generic-vlogging-kitvideo-maker-kit-mictripodholder-ring-light.-242260862.html','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','NONSMAN_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','6c0328cc-169a-4365-9763-64f99759c2bb','title','AY-49G Video Making Kit','source_product_url','https://nonsmanonline.com/product/ay-49g-video-making-kit/','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','OLUBEE_STORE_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','f82abb99-83b1-47af-90ce-e6d8e617883a','title','12 Inches Ringlight','source_product_url','https://olubeestores.com/product/12-inches-ringlight/','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','OLUBEE_STORE_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','c5ba6083-7cbe-4876-a6a6-80d5542250c1','title','Wireless Mic','source_product_url','https://olubeestores.com/product/wireless-mic/','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','OLUBEE_STORE_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','5d95e8aa-54ea-4892-ba06-af1da5c45706','title','3 in 1 Wireless Mic','source_product_url','https://olubeestores.com/product/3-in-1-wireless-mic/','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','OLUBEE_STORE_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','e95a3818-0a7c-4f0f-bfef-8d58b8216f32','title','Led 600 + C08 Tripod + SX31 Wireless Mic','source_product_url','https://olubeestores.com/product/led-600-c08-tripod-sx31-wireless-mic/','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','OLUBEE_STORE_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','74c9c455-d07e-42e9-ac21-1bbbdcd2d2a5','title','Led 600 RGB + C08 Tripod + K95 Wireless Mic','source_product_url','https://olubeestores.com/product/led-600-rgb-c08-tripod-k95-wireless-mic/','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','OLUBEE_STORE_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','58b789db-c313-4f47-bd93-02e644a89f65','title','Super Efficient Wireless Mic 4 Mics Series','source_product_url','https://olubeestores.com/product/wireless-mic-4-mics-series/','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','OLUBEE_STORE_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','056b1b1f-2fd1-46d1-b3f4-85d8beceb9e0','title','Super Efficient Wireless Mic SX8','source_product_url','https://olubeestores.com/product/super-efficient-wireless-mic-sx8/','fulfillment_mode','physical'),
    jsonb_build_object('kind','external_candidate','source_code','OLUBEE_STORE_NG','registry_project_ref','xtgteviwtoupbfvorrmk','registry_product_id','c9d2a215-78b6-430c-880d-fa2e71c797ff','title','Tripod Selfie Ringlight','source_product_url','https://olubeestores.com/product/tripod-selfie-ringlight/','fulfillment_mode','physical')
  )
)
UPDATE public.experience_page_registry e
SET manifest = jsonb_set(
      e.manifest,
      '{items}',
      COALESCE(e.manifest->'items','[]'::jsonb) || additions.items,
      true
    ),
    version = e.version + 1,
    updated_at = now()
FROM additions
WHERE e.page_type='commerce_collection'
  AND e.source_type='commerce'
  AND e.slug=additions.slug
  AND e.status='draft'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(e.manifest->'items','[]'::jsonb)) existing
    WHERE existing->>'registry_product_id' IN (
      SELECT jsonb_array_elements(additions.items)->>'registry_product_id'
    )
  );
