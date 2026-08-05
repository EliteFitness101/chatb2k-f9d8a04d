
-- 1. Operational tasks
CREATE TABLE public.ops_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type text NOT NULL,
  title text NOT NULL,
  source_event text,
  source_event_id uuid,
  priority text NOT NULL DEFAULT 'normal',
  assignee uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  entity text,
  entity_id text,
  alert_id uuid,
  dedupe_key text UNIQUE,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, UPDATE ON public.ops_tasks TO authenticated;
GRANT ALL ON public.ops_tasks TO service_role;
ALTER TABLE public.ops_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops read tasks" ON public.ops_tasks FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'orders.read'::public.admin_permission));
CREATE POLICY "ops update tasks" ON public.ops_tasks FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'orders.write'::public.admin_permission))
  WITH CHECK (public.has_permission(auth.uid(), 'orders.write'::public.admin_permission));
CREATE TRIGGER ops_tasks_touch BEFORE UPDATE ON public.ops_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX ops_tasks_status_idx ON public.ops_tasks (status, priority, due_at);
CREATE INDEX ops_tasks_entity_idx ON public.ops_tasks (entity, entity_id);

-- 2. Task audit history
CREATE TABLE public.ops_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.ops_tasks(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ops_task_events TO authenticated;
GRANT ALL ON public.ops_task_events TO service_role;
ALTER TABLE public.ops_task_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops read task events" ON public.ops_task_events FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'orders.read'::public.admin_permission));
CREATE INDEX ops_task_events_task_idx ON public.ops_task_events (task_id, created_at DESC);

-- 3. SLA timers
CREATE TABLE public.sla_timers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_type text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  warn_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sla_type, entity, entity_id)
);
GRANT SELECT ON public.sla_timers TO authenticated;
GRANT ALL ON public.sla_timers TO service_role;
ALTER TABLE public.sla_timers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops read slas" ON public.sla_timers FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'orders.read'::public.admin_permission));
CREATE TRIGGER sla_timers_touch BEFORE UPDATE ON public.sla_timers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX sla_timers_status_idx ON public.sla_timers (status, due_at);

-- 4. Hub capacity snapshots
CREATE TABLE public.hub_capacity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  available_units integer NOT NULL DEFAULT 0,
  pending_orders integer NOT NULL DEFAULT 0,
  active_workload integer NOT NULL DEFAULT 0,
  dispatch_backlog integer NOT NULL DEFAULT 0,
  utilization numeric NOT NULL DEFAULT 0,
  avg_fulfillment_minutes numeric,
  recommendation text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hub_capacity_snapshots TO authenticated;
GRANT ALL ON public.hub_capacity_snapshots TO service_role;
ALTER TABLE public.hub_capacity_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops read hub capacity" ON public.hub_capacity_snapshots FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.read'::public.admin_permission));
CREATE INDEX hub_capacity_hub_idx ON public.hub_capacity_snapshots (hub_id, created_at DESC);

-- 5. Recovery workflows
CREATE TABLE public.recovery_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  reference text,
  email text,
  rsid text,
  amount_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  recovered_at timestamptz,
  task_id uuid REFERENCES public.ops_tasks(id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.recovery_workflows TO authenticated;
GRANT ALL ON public.recovery_workflows TO service_role;
ALTER TABLE public.recovery_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops read recovery" ON public.recovery_workflows FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'payments.read'::public.admin_permission));
CREATE POLICY "ops update recovery" ON public.recovery_workflows FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'payments.manage'::public.admin_permission))
  WITH CHECK (public.has_permission(auth.uid(), 'payments.manage'::public.admin_permission));
CREATE TRIGGER recovery_workflows_touch BEFORE UPDATE ON public.recovery_workflows
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX recovery_status_idx ON public.recovery_workflows (kind, status, created_at DESC);

-- 6. Alert escalation policies
CREATE TABLE public.alert_escalation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  level text NOT NULL,
  auto_acknowledge boolean NOT NULL DEFAULT false,
  escalate_after_minutes integer NOT NULL DEFAULT 60,
  escalate_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notify_channel text,
  create_task boolean NOT NULL DEFAULT true,
  task_type text,
  task_priority text NOT NULL DEFAULT 'high',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, level)
);
GRANT SELECT ON public.alert_escalation_policies TO authenticated;
GRANT ALL ON public.alert_escalation_policies TO service_role;
ALTER TABLE public.alert_escalation_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops read escalation policies" ON public.alert_escalation_policies FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'audit.read'::public.admin_permission));
CREATE TRIGGER alert_escalation_policies_touch BEFORE UPDATE ON public.alert_escalation_policies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. Alerts gain escalation tracking
ALTER TABLE public.ops_alerts
  ADD COLUMN IF NOT EXISTS escalation_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.ops_tasks(id) ON DELETE SET NULL;

-- 8. Default escalation policies
INSERT INTO public.alert_escalation_policies (category, level, auto_acknowledge, escalate_after_minutes, create_task, task_type, task_priority)
VALUES
  ('payment', 'critical', false, 15, true, 'failed_payment_followup', 'critical'),
  ('payment', 'warning', false, 60, true, 'manual_refund_review', 'high'),
  ('webhook', 'critical', false, 15, true, 'compliance_review', 'critical'),
  ('inventory', 'warning', true, 240, true, 'inventory_restock', 'high'),
  ('fulfillment', 'critical', false, 30, true, 'fulfillment_exception', 'critical'),
  ('fulfillment', 'warning', false, 120, true, 'hub_reassignment', 'normal'),
  ('support', 'warning', false, 60, true, 'support_escalation', 'high'),
  ('chatb2k', 'info', true, 720, false, NULL, 'normal')
ON CONFLICT (category, level) DO NOTHING;
