-- ResoFit v3.0.1 P1 hardening: atomic physical fulfillment allocation.
-- Keeps legacy orders/fulfillment_orders out of the production path.

create or replace function public.create_resofit_fulfillment_atomic(
  p_payment_id uuid,
  p_payment_reference text,
  p_customer_id uuid,
  p_customer_email text,
  p_currency text,
  p_total_amount numeric,
  p_hub_code text,
  p_country text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fulfillment_id uuid;
  v_item jsonb;
  v_sku text;
  v_quantity integer;
  v_available boolean;
begin
  if p_payment_id is null or p_payment_reference is null or p_hub_code is null then
    raise exception 'payment, reference and hub are required';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'physical fulfillment requires at least one item';
  end if;

  -- Lock/check every inventory row first. PostgreSQL rolls the entire function
  -- back if any reservation or insert fails, preventing partial reservations.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_sku := v_item->>'sku';
    v_quantity := (v_item->>'quantity')::integer;

    if v_sku is null or v_quantity is null or v_quantity <= 0 then
      raise exception 'invalid fulfillment item';
    end if;

    select (on_hand - reserved >= v_quantity)
      into v_available
      from public.resofit_hub_inventory
     where hub_code = p_hub_code
       and sku = v_sku
     for update;

    if coalesce(v_available, false) = false then
      raise exception 'inventory reservation failed for %', v_sku;
    end if;
  end loop;

  insert into public.resofit_fulfillment_orders (
    payment_id, payment_reference, customer_id, customer_email,
    status, hub_code, currency, total_amount,
    metadata
  ) values (
    p_payment_id, p_payment_reference, p_customer_id, p_customer_email,
    'allocated', p_hub_code, coalesce(p_currency, 'NGN'), p_total_amount,
    jsonb_build_object('country', p_country, 'source', 'chatb2k')
  )
  returning id into v_fulfillment_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_sku := v_item->>'sku';
    v_quantity := (v_item->>'quantity')::integer;

    insert into public.resofit_fulfillment_items (
      fulfillment_order_id, product_id, sku, quantity
    ) values (
      v_fulfillment_id,
      nullif(v_item->>'productId', '')::uuid,
      v_sku,
      v_quantity
    );

    update public.resofit_hub_inventory
       set reserved = reserved + v_quantity,
           updated_at = now()
     where hub_code = p_hub_code
       and sku = v_sku
       and on_hand - reserved >= v_quantity;

    if not found then
      raise exception 'inventory reservation failed for %', v_sku;
    end if;
  end loop;

  insert into public.resofit_fulfillment_events (
    fulfillment_order_id, from_status, to_status, detail
  ) values (
    v_fulfillment_id, 'pending', 'allocated',
    jsonb_build_object('hub_code', p_hub_code, 'country', p_country, 'items', p_items)
  );

  return v_fulfillment_id;
end;
$$;

revoke execute on function public.create_resofit_fulfillment_atomic(uuid,text,uuid,text,text,numeric,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_resofit_fulfillment_atomic(uuid,text,uuid,text,text,numeric,text,text,jsonb) to service_role;
