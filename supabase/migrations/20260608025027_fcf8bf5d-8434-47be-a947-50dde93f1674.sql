-- Extend revenue_events
ALTER TABLE public.revenue_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS predicted_revenue_lift double precision,
  ADD COLUMN IF NOT EXISTS confidence_score double precision,
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'paid';

-- Dedupe Paystack references
CREATE UNIQUE INDEX IF NOT EXISTS revenue_events_reference_uniq
  ON public.revenue_events (reference);

-- New predictions table
CREATE TABLE IF NOT EXISTS public.revenue_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rsid text,
  sku text,
  predicted_revenue bigint NOT NULL DEFAULT 0,
  predicted_conversion_rate double precision NOT NULL DEFAULT 0,
  confidence_score double precision NOT NULL DEFAULT 0,
  model_version text NOT NULL DEFAULT 'v2.0',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.revenue_predictions TO authenticated;
GRANT ALL ON public.revenue_predictions TO service_role;

ALTER TABLE public.revenue_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY revenue_predictions_admin_read
  ON public.revenue_predictions
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS revenue_predictions_sku_idx ON public.revenue_predictions (sku);
CREATE INDEX IF NOT EXISTS revenue_predictions_rsid_idx ON public.revenue_predictions (rsid);