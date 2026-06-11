alter table public.subscriptions
add column if not exists device_id text;

update public.subscriptions s
set device_id = coalesce(s.device_id, d.device_id, c.device_id)
from public.clients c
left join lateral (
  select d2.device_id
  from public.devices d2
  where d2.user_id = c.user_id
  order by d2.created_at desc
  limit 1
) d on true
where s.user_id = c.user_id
  and s.device_id is null;

drop index if exists public.subscriptions_one_trial_per_user;

with ranked_trials as (
  select
    id,
    row_number() over (
      partition by device_id
      order by created_at desc, expiry_date desc
    ) as trial_rank
  from public.subscriptions
  where plan_type = 'trial'
    and device_id is not null
)
update public.subscriptions s
set device_id = null
from ranked_trials rt
where s.id = rt.id
  and rt.trial_rank > 1;

create unique index if not exists subscriptions_one_trial_per_device
on public.subscriptions (device_id)
where plan_type = 'trial' and device_id is not null;

create index if not exists subscriptions_user_device_created_idx
on public.subscriptions (user_id, device_id, created_at desc);

create or replace function public.create_trial_subscription(
  p_device_id text,
  p_device_name text default 'SarifPro Android device',
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
  v_device_id text := trim(p_device_id);
  v_start timestamptz := now();
  v_subscription public.subscriptions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if nullif(v_device_id, '') is null or length(v_device_id) < 8 then
    raise exception 'Device id is required.';
  end if;

  if exists (
    select 1
    from public.subscriptions s
    where s.device_id = v_device_id
      and s.plan_type = 'trial'
  ) then
    raise exception 'Trial already used on this device.';
  end if;

  if exists (
    select 1
    from public.devices d
    where d.device_id = v_device_id
      and d.user_id <> v_user_id
  ) then
    raise exception 'This device is already bound to another user.';
  end if;

  insert into public.clients (user_id, full_name, phone, device_id, status)
  values (
    v_user_id,
    coalesce(nullif(trim(p_full_name), ''), 'SarifPro Client'),
    coalesce(nullif(trim(p_phone), ''), '-'),
    v_device_id,
    'active'
  )
  on conflict (user_id)
  do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    device_id = excluded.device_id,
    status = case when public.clients.status = 'blocked' then 'blocked' else excluded.status end;

  insert into public.devices (user_id, device_id, device_name, is_active)
  values (v_user_id, v_device_id, coalesce(nullif(trim(p_device_name), ''), 'SarifPro Android device'), true)
  on conflict (device_id)
  do update set
    device_name = excluded.device_name,
    is_active = true
  where public.devices.user_id = v_user_id;

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
    v_user_id,
    v_device_id,
    'trial',
    v_start,
    v_start + interval '7 days',
    'trial',
    'TRIAL-' || replace(v_user_id::text, '-', '') || '-' || replace(v_device_id, '-', '') || '-' || extract(epoch from v_start)::bigint::text
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

create or replace function public.get_device_subscription_status(p_device_id text)
returns table (
  plan_type text,
  start_date timestamptz,
  expiry_date timestamptz,
  status text,
  payment_reference text,
  created_at timestamptz,
  account_status text,
  device_bound boolean
)
language sql
security definer
set search_path = public
as $$
  select
    s.plan_type,
    s.start_date,
    s.expiry_date,
    case
      when s.expiry_date < now() and s.status in ('active', 'trial') then 'expired'
      else s.status
    end as status,
    s.payment_reference,
    s.created_at,
    c.status as account_status,
    coalesce(d.is_active, false) as device_bound
  from public.devices d
  join public.clients c on c.user_id = d.user_id
  join public.subscriptions s on s.user_id = d.user_id
  where d.user_id = auth.uid()
    and d.device_id = trim(p_device_id)
    and (
      s.device_id = d.device_id
      or s.device_id is null
    )
  order by
    case when s.device_id = d.device_id then 0 else 1 end,
    s.created_at desc
  limit 1;
$$;

revoke all on function public.get_device_subscription_status(text) from public;
grant execute on function public.get_device_subscription_status(text) to authenticated;

comment on column public.subscriptions.device_id is 'Device-bound subscription key. Financial transactions, SMS contents, balances, customer numbers, USSD data, and PIN data are never stored in Supabase.';

notify pgrst, 'reload schema';
