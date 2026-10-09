-- Targeted hardening: server-only CEO and supplier workflow tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ceo_growth_actions',
    'ceo_growth_strategy',
    'resofit_market_network_regions',
    'resofit_supplier_distribution_channels',
    'resofit_supplier_fulfillment_orders',
    'resofit_supplier_inventory_feeds',
    'resofit_supplier_inventory_updates',
    'resofit_supplier_notifications',
    'resofit_supplier_partner_leads',
    'resofit_supplier_partner_profiles'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'service_role_internal_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY service_role_internal_access ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t
      );
    END IF;
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.elite_host_claim_me() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.elite_host_claim_me() TO authenticated;
REVOKE ALL ON FUNCTION public.elite_host_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.elite_host_dashboard() TO authenticated;

REVOKE ALL ON FUNCTION public.elite_host_funnel_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.elite_host_growth_score_sweep() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.elite_host_lifecycle_sweep() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.elite_host_outreach_sweep() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_supplier_fulfillment_from_payment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_bigo_seasonal_content() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_elite_host_application_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_successful_payment_attribution() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resofit_bridge_catalog_assets_to_content_registry() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resofit_refresh_revenue_engine_daily(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resofit_security_hardening_v1() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.elite_host_funnel_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION public.elite_host_growth_score_sweep() TO service_role;
GRANT EXECUTE ON FUNCTION public.elite_host_lifecycle_sweep() TO service_role;
GRANT EXECUTE ON FUNCTION public.elite_host_outreach_sweep() TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_supplier_fulfillment_from_payment() TO service_role;
GRANT EXECUTE ON FUNCTION public.plan_bigo_seasonal_content() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_elite_host_application_event() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_successful_payment_attribution() TO service_role;
GRANT EXECUTE ON FUNCTION public.resofit_bridge_catalog_assets_to_content_registry() TO service_role;
GRANT EXECUTE ON FUNCTION public.resofit_refresh_revenue_engine_daily(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.resofit_security_hardening_v1() TO service_role;

ALTER VIEW public.resofit_growth_milestone_status SET (security_invoker = true);
ALTER VIEW public.resofit_unified_commerce_inventory SET (security_invoker = true);
ALTER VIEW public.resofit_tiktok_series_performance SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON TABLE public.resofit_growth_milestone_status FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.resofit_unified_commerce_inventory FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.resofit_tiktok_series_performance FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.resofit_growth_milestone_status TO service_role;
GRANT SELECT ON TABLE public.resofit_unified_commerce_inventory TO service_role;
GRANT SELECT ON TABLE public.resofit_tiktok_series_performance TO service_role;
