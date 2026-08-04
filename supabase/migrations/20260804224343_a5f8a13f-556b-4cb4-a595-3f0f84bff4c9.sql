-- 1. Enterprise roles + permissions -------------------------------------------------
CREATE TYPE public.admin_role AS ENUM (
  'super_admin','operations_admin','finance_admin','catalog_admin','warehouse_admin',
  'coach_admin','support_admin','content_admin','analytics_admin','compliance_admin'
);

CREATE TYPE public.admin_permission AS ENUM (
  'orders.read','orders.write','payments.read','payments.manage',
  'inventory.read','inventory.manage','customers.read','customers.manage',
  'analytics.read','audit.read','hub.manage','catalog.manage','content.manage'
);

CREATE TABLE public.admin_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.admin_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.admin_role_assignments TO authenticated;
GRANT ALL ON public.admin_role_assignments TO service_role;
ALTER TABLE public.admin_role_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read own admin roles" ON public.admin_role_assignments
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.admin_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.admin_role NOT NULL,
  permission public.admin_permission NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, permission)
);
GRANT SELECT ON public.admin_role_permissions TO authenticated;
GRANT ALL ON public.admin_role_permissions TO service_role;
ALTER TABLE public.admin_role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read permission map" ON public.admin_role_permissions
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.admin_role_permissions (role, permission)
SELECT 'super_admin'::public.admin_role, p FROM unnest(enum_range(NULL::public.admin_permission)) AS p;

INSERT INTO public.admin_role_permissions (role, permission) VALUES
  ('operations_admin','orders.read'),('operations_admin','orders.write'),
  ('operations_admin','inventory.read'),('operations_admin','inventory.manage'),
  ('operations_admin','hub.manage'),('operations_admin','customers.read'),
  ('operations_admin','analytics.read'),('operations_admin','payments.read'),
  ('finance_admin','payments.read'),('finance_admin','payments.manage'),
  ('finance_admin','orders.read'),('finance_admin','analytics.read'),('finance_admin','audit.read'),
  ('catalog_admin','catalog.manage'),('catalog_admin','inventory.read'),('catalog_admin','analytics.read'),
  ('warehouse_admin','inventory.read'),('warehouse_admin','inventory.manage'),
  ('warehouse_admin','hub.manage'),('warehouse_admin','orders.read'),
  ('coach_admin','customers.read'),('coach_admin','analytics.read'),
  ('support_admin','customers.read'),('support_admin','customers.manage'),
  ('support_admin','orders.read'),('support_admin','payments.read'),
  ('content_admin','content.manage'),('content_admin','analytics.read'),
  ('analytics_admin','analytics.read'),('analytics_admin','orders.read'),('analytics_admin','customers.read'),
  ('compliance_admin','audit.read'),('compliance_admin','orders.read'),
  ('compliance_admin','payments.read'),('compliance_admin','analytics.read');

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission public.admin_permission)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_role_assignments a
    JOIN public.admin_role_permissions p ON p.role = a.role
    WHERE a.user_id = _user_id AND p.permission = _permission
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = 'admin'::public.app_role
  )
$$;

-- 2. Operational alerts --------------------------------------------------------------
CREATE TABLE public.ops_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'info',
  category text NOT NULL,
  title text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  entity text,
  entity_id text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ops_alerts_level_chk CHECK (level IN ('info','warning','critical')),
  CONSTRAINT ops_alerts_status_chk CHECK (status IN ('open','acknowledged','resolved'))
);
CREATE INDEX ops_alerts_status_created_idx ON public.ops_alerts (status, created_at DESC);
GRANT SELECT, UPDATE ON public.ops_alerts TO authenticated;
GRANT ALL ON public.ops_alerts TO service_role;
ALTER TABLE public.ops_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read alerts" ON public.ops_alerts
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'audit.read') OR public.has_permission(auth.uid(), 'analytics.read'));
CREATE POLICY "ops staff update alerts" ON public.ops_alerts
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'hub.manage') OR public.has_permission(auth.uid(), 'audit.read'))
  WITH CHECK (public.has_permission(auth.uid(), 'hub.manage') OR public.has_permission(auth.uid(), 'audit.read'));

CREATE TRIGGER ops_alerts_touch BEFORE UPDATE ON public.ops_alerts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Security hardening: assessment_answers owner-only writes ------------------------
CREATE POLICY "owners insert their assessment answers" ON public.assessment_answers
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.assessments a
    WHERE a.id = assessment_answers.assessment_id AND a.user_id = auth.uid()
  ));
CREATE POLICY "owners update their assessment answers" ON public.assessment_answers
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.assessments a
    WHERE a.id = assessment_answers.assessment_id AND a.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.assessments a
    WHERE a.id = assessment_answers.assessment_id AND a.user_id = auth.uid()
  ));
GRANT INSERT, UPDATE ON public.assessment_answers TO authenticated;