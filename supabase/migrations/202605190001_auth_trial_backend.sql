create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  device_id text not null,
  status text not null default 'active' check (status in ('active', 'blocked', 'pending')),
  created_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null unique,
  device_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_type text not null check (plan_type in ('trial', 'monthly', 'quarterly', 'yearly')),
  start_date timestamptz not null,
  expiry_date timestamptz not null,
  status text not null check (status in ('active', 'expired', 'blocked', 'trial', 'pending')),
  payment_reference text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists subscriptions_one_trial_per_user
on public.subscriptions (user_id)
where plan_type = 'trial';

alter table public.clients enable row level security;
alter table public.devices enable row level security;
alter table public.subscriptions enable row level security;

grant select, insert, update on public.clients to authenticated;
grant select, insert, update on public.devices to authenticated;
grant select on public.subscriptions to authenticated;

drop policy if exists clients_select_own on public.clients;
create policy clients_select_own
on public.clients
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists clients_insert_own on public.clients;
create policy clients_insert_own
on public.clients
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists clients_update_own on public.clients;
create policy clients_update_own
on public.clients
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists devices_select_own on public.devices;
create policy devices_select_own
on public.devices
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists devices_insert_own on public.devices;
create policy devices_insert_own
on public.devices
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists devices_update_own on public.devices;
create policy devices_update_own
on public.devices
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id);

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

  if nullif(v_device_id, '') is null then
    raise exception 'Device id is required.';
  end if;

  if exists (
    select 1
    from public.devices d
    join public.subscriptions s on s.user_id = d.user_id
    where d.device_id = v_device_id
      and s.plan_type = 'trial'
  ) then
    raise exception 'Trial already used on this device.';
  end if;

  if exists (
    select 1
    from public.subscriptions s
    where s.user_id = v_user_id
      and s.plan_type = 'trial'
  ) then
    raise exception 'Trial already used for this user.';
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
    plan_type,
    start_date,
    expiry_date,
    status,
    payment_reference
  )
  values (
    v_user_id,
    'trial',
    v_start,
    v_start + interval '7 days',
    'trial',
    'TRIAL-' || replace(v_user_id::text, '-', '') || '-' || extract(epoch from v_start)::bigint::text
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
    and d.device_id = p_device_id
  order by s.created_at desc
  limit 1;
$$;

revoke all on function public.get_device_subscription_status(text) from public;
grant execute on function public.get_device_subscription_status(text) to authenticated;

create or replace function public.get_client_account_status(p_device_id text)
returns table (
  account_status text
)
language sql
security definer
set search_path = public
as $$
  select c.status as account_status
  from public.devices d
  join public.clients c on c.user_id = d.user_id
  where d.user_id = auth.uid()
    and d.device_id = p_device_id
  limit 1;
$$;

revoke all on function public.get_client_account_status(text) from public;
grant execute on function public.get_client_account_status(text) to authenticated;

comment on table public.subscriptions is 'Subscription state only. Transaction history, SMS contents, balances, references, USSD data, and customer financial data remain local on the Android device.';

notify pgrst, 'reload schema';
