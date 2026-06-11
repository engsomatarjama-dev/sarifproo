create or replace function public.create_trial_subscription(
  p_device_id text,
  p_device_name text default null,
  p_full_name text default '',
  p_phone text default ''
)
returns table (
  plan_type text,
  start_date timestamptz,
  expiry_date timestamptz,
  status text,
  payment_reference text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_start timestamptz := now();
  v_subscription public.subscriptions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(p_device_id), '') is null then
    raise exception 'Device ID is required';
  end if;

  if exists (
    select 1
    from public.subscriptions s
    where s.device_id = p_device_id
      and s.plan_type = 'trial'
  ) then
    raise exception 'Trial already used on this device';
  end if;

  insert into public.clients (
    user_id,
    full_name,
    phone,
    device_id,
    status,
    created_at
  )
  values (
    v_user_id,
    coalesce(nullif(trim(p_full_name), ''), ''),
    coalesce(nullif(trim(p_phone), ''), ''),
    p_device_id,
    'active',
    v_start
  )
  on conflict (user_id) do update
  set
    full_name = excluded.full_name,
    phone = excluded.phone,
    device_id = excluded.device_id,
    status = case when public.clients.status = 'blocked' then 'blocked' else 'active' end;

  insert into public.devices (
    user_id,
    device_id,
    device_name,
    is_active,
    created_at
  )
  values (
    v_user_id,
    p_device_id,
    coalesce(nullif(trim(p_device_name), ''), 'SarifPro Android device'),
    true,
    v_start
  )
  on conflict (device_id) do update
  set
    user_id = excluded.user_id,
    device_name = excluded.device_name,
    is_active = true;

  insert into public.subscriptions (
    user_id,
    device_id,
    plan_type,
    start_date,
    expiry_date,
    status,
    payment_reference,
    created_at
  )
  values (
    v_user_id,
    p_device_id,
    'trial',
    v_start,
    v_start + interval '3 days',
    'trial',
    'trial',
    v_start
  )
  returning * into v_subscription;

  return query
  select
    v_subscription.plan_type,
    v_subscription.start_date,
    v_subscription.expiry_date,
    v_subscription.status,
    v_subscription.payment_reference,
    v_subscription.created_at;
end;
$$;

revoke all on function public.create_trial_subscription(text, text, text, text) from public;
grant execute on function public.create_trial_subscription(text, text, text, text) to authenticated;
