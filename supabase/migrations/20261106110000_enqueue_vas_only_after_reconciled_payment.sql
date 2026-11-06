-- Payment-gated VAS queueing.
-- Enqueue only after the existing Paystack webhook has reconciled a successful payment.
create or replace function public.enqueue_dynamic_vas_after_payment_reconciliation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_item jsonb;
  offer_uuid uuid;
  snapshot jsonb;
begin
  if not (new.status = 'success' and new.reconciled = true) then
    return new;
  end if;

  if not (new.metadata ? 'vas_checkout_snapshot')
     or jsonb_typeof(new.metadata->'vas_checkout_snapshot') <> 'array' then
    return new;
  end if;

  for selected_item in
    select value from jsonb_array_elements(new.metadata->'vas_checkout_snapshot')
  loop
    begin
      offer_uuid := (selected_item->>'offer_id')::uuid;
    exception when others then
      raise warning 'Skipping malformed VAS offer id for payment %', new.paystack_ref;
      continue;
    end;

    if not exists (
      select 1 from public.commerce_vas_offers o
      where o.id = offer_uuid
        and o.status = 'selected'
        and o.expires_at > coalesce(new.paid_at, now())
    ) then
      raise warning 'VAS offer % not selected/valid for payment %', offer_uuid, new.paystack_ref;
      continue;
    end if;

    snapshot := jsonb_build_object(
      'schema_version', 1,
      'payment_id', new.id,
      'payment_reference', new.paystack_ref,
      'paid_at', coalesce(new.paid_at, now()),
      'currency', new.currency,
      'payment_amount', new.amount,
      'product_context', coalesce(new.metadata->'line_items', '[]'::jsonb),
      'vas', selected_item
    );

    insert into public.commerce_vas_generation_jobs (
      payment_id, vas_offer_id, payment_reference, idempotency_key,
      order_snapshot, payment_verified_at, status
    ) values (
      new.id, offer_uuid, new.paystack_ref,
      'vas:' || new.paystack_ref || ':' || offer_uuid::text,
      snapshot, coalesce(new.paid_at, now()), 'queued'
    )
    on conflict (payment_id, vas_offer_id) do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_dynamic_vas_after_payment on public.payments;
create trigger trg_enqueue_dynamic_vas_after_payment
after insert or update of status, reconciled, metadata on public.payments
for each row
when (new.status = 'success' and new.reconciled = true)
execute function public.enqueue_dynamic_vas_after_payment_reconciliation();

create or replace function public.prevent_dynamic_vas_order_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.order_snapshot is distinct from new.order_snapshot
     or old.payment_id is distinct from new.payment_id
     or old.vas_offer_id is distinct from new.vas_offer_id
     or old.payment_reference is distinct from new.payment_reference
     or old.idempotency_key is distinct from new.idempotency_key then
    raise exception 'VAS generation order snapshot and identity are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vas_generation_snapshot_immutable on public.commerce_vas_generation_jobs;
create trigger trg_vas_generation_snapshot_immutable
before update on public.commerce_vas_generation_jobs
for each row execute function public.prevent_dynamic_vas_order_snapshot_mutation();

comment on function public.enqueue_dynamic_vas_after_payment_reconciliation() is
  'Enqueues selected dynamic VAS jobs only after Paystack webhook reconciliation marks payment successful and reconciled.';
