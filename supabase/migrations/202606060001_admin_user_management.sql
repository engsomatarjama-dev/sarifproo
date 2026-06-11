create or replace function public.admin_list_clients(
  p_search text default '',
  p_status text default 'all'
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  phone text,
  client_status text,
  device_id text,
  device_name text,
  device_active boolean,
  subscription_id uuid,
  plan_type text,
  subscription_status text,
  expiry_date timestamptz,
  subscription_created_at timestamptz,
  client_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text := lower(trim(coalesce(p_search, '')));
  v_status text := lower(coalesce(nullif(trim(p_status), ''), 'all'));
begin
  if not public.is_sarifpro_admin() then
    raise exception 'Admin access is required.';
  end if;

  if v_status not in ('all', 'active', 'blocked', 'pending', 'trial', 'expired') then
    raise exception 'Unsupported status: %', p_status;
  end if;

  return query
  select
    c.user_id,
    au.email::text,
    c.full_name,
    c.phone,
    c.status as client_status,
    d.device_id,
    d.device_name,
    coalesce(d.is_active, false) as device_active,
    s.id as subscription_id,
    s.plan_type,
    case
      when s.expiry_date < now() and s.status in ('active', 'trial') then 'expired'
      else s.status
    end as subscription_status,
    s.expiry_date,
    s.created_at as subscription_created_at,
    c.created_at as client_created_at
  from public.clients c
  join auth.users au on au.id = c.user_id
  left join lateral (
    select d2.device_id, d2.device_name, d2.is_active
    from public.devices d2
    where d2.user_id = c.user_id
    order by d2.created_at desc
    limit 1
  ) d on true
  left join lateral (
    select s2.id, s2.plan_type, s2.status, s2.expiry_date, s2.created_at
    from public.subscriptions s2
    where s2.user_id = c.user_id
      and (
        d.device_id is null
        or s2.device_id = d.device_id
        or s2.device_id is null
      )
    order by
      case when d.device_id is not null and s2.device_id = d.device_id then 0 else 1 end,
      s2.created_at desc
    limit 1
  ) s on true
  where (
      v_search = ''
      or lower(coalesce(au.email::text, '')) like '%' || v_search || '%'
      or lower(coalesce(c.full_name, '')) like '%' || v_search || '%'
      or lower(coalesce(c.phone, '')) like '%' || v_search || '%'
      or lower(coalesce(d.device_id, '')) like '%' || v_search || '%'
    )
    and (
      v_status = 'all'
      or c.status = v_status
      or (
        v_status in ('active', 'blocked', 'pending', 'trial', 'expired')
        and case
          when s.expiry_date < now() and s.status in ('active', 'trial') then 'expired'
          else s.status
        end = v_status
      )
    )
  order by c.created_at desc;
end;
$$;

revoke all on function public.admin_list_clients(text, text) from public;
grant execute on function public.admin_list_clients(text, text) to authenticated;

create or replace function public.admin_update_client_profile(
  p_user_id uuid,
  p_full_name text,
  p_phone text,
  p_client_status text
)
returns table (
  user_id uuid,
  full_name text,
  phone text,
  client_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(p_client_status));
begin
  if not public.is_sarifpro_admin() then
    raise exception 'Admin access is required.';
  end if;

  if v_status not in ('active', 'blocked', 'pending') then
    raise exception 'Unsupported client status: %', p_client_status;
  end if;

  update public.clients c
  set
    full_name = coalesce(nullif(trim(p_full_name), ''), c.full_name),
    phone = coalesce(nullif(trim(p_phone), ''), c.phone),
    status = v_status
  where c.user_id = p_user_id;

  if not found then
    raise exception 'Client was not found.';
  end if;

  if v_status = 'blocked' then
    update public.devices d
    set is_active = false
    where d.user_id = p_user_id;

    update public.subscriptions s
    set status = 'blocked'
    where s.user_id = p_user_id
      and s.status in ('active', 'trial', 'pending');
  end if;

  return query
  select c.user_id, c.full_name, c.phone, c.status
  from public.clients c
  where c.user_id = p_user_id;
end;
$$;

revoke all on function public.admin_update_client_profile(uuid, text, text, text) from public;
grant execute on function public.admin_update_client_profile(uuid, text, text, text) to authenticated;

create or replace function public.admin_update_device_status(
  p_device_id text,
  p_is_active boolean
)
returns table (
  device_id text,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id text := trim(p_device_id);
begin
  if not public.is_sarifpro_admin() then
    raise exception 'Admin access is required.';
  end if;

  if nullif(v_device_id, '') is null then
    raise exception 'Device id is required.';
  end if;

  update public.devices d
  set is_active = coalesce(p_is_active, false)
  where d.device_id = v_device_id;

  if not found then
    raise exception 'Device was not found.';
  end if;

  return query
  select d.device_id, d.is_active
  from public.devices d
  where d.device_id = v_device_id;
end;
$$;

revoke all on function public.admin_update_device_status(text, boolean) from public;
grant execute on function public.admin_update_device_status(text, boolean) to authenticated;

create or replace function public.admin_grant_subscription(
  p_user_id uuid,
  p_device_id text,
  p_plan_type text,
  p_status text default 'active'
)
returns table (
  subscription_id uuid,
  user_id uuid,
  device_id text,
  plan_type text,
  status text,
  expiry_date timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id text := trim(p_device_id);
  v_plan_type text := lower(trim(p_plan_type));
  v_status text := lower(coalesce(nullif(trim(p_status), ''), 'active'));
  v_start timestamptz := now();
  v_expiry timestamptz;
  v_subscription public.subscriptions%rowtype;
begin
  if not public.is_sarifpro_admin() then
    raise exception 'Admin access is required.';
  end if;

  if v_plan_type not in ('trial', 'monthly', 'quarterly', 'yearly') then
    raise exception 'Unsupported plan type: %', p_plan_type;
  end if;

  if v_status not in ('active', 'expired', 'blocked', 'trial', 'pending') then
    raise exception 'Unsupported subscription status: %', p_status;
  end if;

  if nullif(v_device_id, '') is null then
    raise exception 'Device id is required.';
  end if;

  if not exists (select 1 from public.clients c where c.user_id = p_user_id) then
    raise exception 'Client was not found.';
  end if;

  v_expiry := case v_plan_type
    when 'trial' then v_start + interval '3 days'
    when 'monthly' then v_start + interval '1 month'
    when 'quarterly' then v_start + interval '3 months'
    when 'yearly' then v_start + interval '1 year'
  end;

  update public.clients c
  set status = case when v_status = 'blocked' then 'blocked' else 'active' end,
      device_id = v_device_id
  where c.user_id = p_user_id;

  insert into public.devices (user_id, device_id, device_name, is_active)
  values (p_user_id, v_device_id, 'SarifPro Android device', v_status <> 'blocked')
  on conflict (device_id)
  do update set
    user_id = excluded.user_id,
    is_active = excluded.is_active;

  update public.subscriptions s
  set status = 'expired'
  where s.user_id = p_user_id
    and (s.device_id = v_device_id or s.device_id is null)
    and s.status in ('active', 'trial', 'pending');

  insert into public.subscriptions (
    user_id,
    device_id,
    plan_type,
    start_date,
    expiry_date,
    status,
    payment_reference
  )
  values (
    p_user_id,
    v_device_id,
    v_plan_type,
    v_start,
    v_expiry,
    case when v_plan_type = 'trial' and v_status = 'active' then 'trial' else v_status end,
    'ADMIN-' || replace(p_user_id::text, '-', '') || '-' || extract(epoch from v_start)::bigint::text
  )
  returning * into v_subscription;

  return query
  select
    v_subscription.id,
    v_subscription.user_id,
    v_subscription.device_id,
    v_subscription.plan_type,
    v_subscription.status,
    v_subscription.expiry_date;
end;
$$;

revoke all on function public.admin_grant_subscription(uuid, text, text, text) from public;
grant execute on function public.admin_grant_subscription(uuid, text, text, text) to authenticated;

create or replace function public.admin_set_subscription_status(
  p_subscription_id uuid,
  p_status text
)
returns table (
  subscription_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(p_status));
begin
  if not public.is_sarifpro_admin() then
    raise exception 'Admin access is required.';
  end if;

  if v_status not in ('active', 'expired', 'blocked', 'trial', 'pending') then
    raise exception 'Unsupported subscription status: %', p_status;
  end if;

  update public.subscriptions s
  set status = v_status
  where s.id = p_subscription_id;

  if not found then
    raise exception 'Subscription was not found.';
  end if;

  update public.clients c
  set status = case when v_status = 'blocked' then 'blocked' else c.status end
  from public.subscriptions s
  where s.id = p_subscription_id
    and c.user_id = s.user_id;

  update public.devices d
  set is_active = false
  from public.subscriptions s
  where s.id = p_subscription_id
    and d.user_id = s.user_id
    and (s.device_id is null or d.device_id = s.device_id)
    and v_status = 'blocked';

  return query
  select s.id, s.status
  from public.subscriptions s
  where s.id = p_subscription_id;
end;
$$;

revoke all on function public.admin_set_subscription_status(uuid, text) from public;
grant execute on function public.admin_set_subscription_status(uuid, text) to authenticated;

comment on function public.admin_list_clients(text, text) is 'Admin-only customer account list. Returns subscription/device metadata only; no transaction, SMS, balance, USSD, or PIN data is stored remotely.';

notify pgrst, 'reload schema';
