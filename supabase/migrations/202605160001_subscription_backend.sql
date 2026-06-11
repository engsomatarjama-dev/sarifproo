create extension if not exists pgcrypto;

create table if not exists public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'blocked', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.device_bindings (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  client_account_id uuid not null references public.client_accounts(id) on delete cascade,
  device_id text not null unique,
  device_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.client_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.client_accounts(id) on delete cascade,
  plan_type text not null check (plan_type in ('monthly', 'quarterly', 'yearly')),
  start_date timestamptz not null,
  expiry_date timestamptz not null,
  status text not null check (status in ('active', 'expired', 'blocked', 'trial')),
  payment_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_verification_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  payment_reference text not null unique,
  plan_type text check (plan_type in ('monthly', 'quarterly', 'yearly')),
  expected_amount numeric(12,2),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_metadata_events (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  app_version text not null,
  automation_enabled boolean not null,
  monitoring_898_enabled boolean not null,
  last_active_at timestamptz not null,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_accounts_set_updated_at on public.client_accounts;
create trigger client_accounts_set_updated_at
before update on public.client_accounts
for each row execute function public.set_updated_at();

drop trigger if exists client_subscriptions_set_updated_at on public.client_subscriptions;
create trigger client_subscriptions_set_updated_at
before update on public.client_subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists payment_verification_requests_set_updated_at on public.payment_verification_requests;
create trigger payment_verification_requests_set_updated_at
before update on public.payment_verification_requests
for each row execute function public.set_updated_at();

alter table public.client_accounts enable row level security;
alter table public.device_bindings enable row level security;
alter table public.client_subscriptions enable row level security;
alter table public.payment_verification_requests enable row level security;
alter table public.app_metadata_events enable row level security;

drop policy if exists client_accounts_select_own on public.client_accounts;
create policy client_accounts_select_own
on public.client_accounts
for select
to authenticated
using (auth.uid() = auth_user_id);

drop policy if exists device_bindings_select_own on public.device_bindings;
create policy device_bindings_select_own
on public.device_bindings
for select
to authenticated
using (auth.uid() = auth_user_id);

drop policy if exists device_bindings_update_own on public.device_bindings;
create policy device_bindings_update_own
on public.device_bindings
for update
to authenticated
using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id);

drop policy if exists client_subscriptions_select_bound on public.client_subscriptions;
create policy client_subscriptions_select_bound
on public.client_subscriptions
for select
to authenticated
using (
  exists (
    select 1
    from public.device_bindings db
    where db.client_account_id = client_subscriptions.client_account_id
      and db.auth_user_id = auth.uid()
  )
);

drop policy if exists payment_verification_requests_insert_own on public.payment_verification_requests;
create policy payment_verification_requests_insert_own
on public.payment_verification_requests
for insert
to authenticated
with check (auth.uid() = auth_user_id);

drop policy if exists payment_verification_requests_update_own on public.payment_verification_requests;
create policy payment_verification_requests_update_own
on public.payment_verification_requests
for update
to authenticated
using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id);

drop policy if exists payment_verification_requests_select_own on public.payment_verification_requests;
create policy payment_verification_requests_select_own
on public.payment_verification_requests
for select
to authenticated
using (auth.uid() = auth_user_id);

drop policy if exists app_metadata_events_insert_own on public.app_metadata_events;
create policy app_metadata_events_insert_own
on public.app_metadata_events
for insert
to authenticated
with check (auth.uid() = auth_user_id);

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
    cs.plan_type,
    cs.start_date,
    cs.expiry_date,
    cs.status,
    cs.payment_reference,
    cs.created_at,
    ca.status as account_status,
    coalesce(db.is_active, false) as device_bound
  from public.device_bindings db
  join public.client_accounts ca on ca.id = db.client_account_id
  join public.client_subscriptions cs on cs.client_account_id = ca.id
  where db.auth_user_id = auth.uid()
    and db.device_id = p_device_id
  order by cs.created_at desc
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
  select
    ca.status as account_status
  from public.device_bindings db
  join public.client_accounts ca on ca.id = db.client_account_id
  where db.auth_user_id = auth.uid()
    and db.device_id = p_device_id
  limit 1;
$$;

revoke all on function public.get_client_account_status(text) from public;
grant execute on function public.get_client_account_status(text) to authenticated;

comment on table public.client_subscriptions is 'Remote subscription state only. Transaction history and financial activity remain local to the device.';
comment on table public.payment_verification_requests is 'Manual payment verification queue. Do not store customer transaction payloads here.';
comment on table public.app_metadata_events is 'Anonymous app metadata only. No SMS, transaction, balance, customer, or USSD data should be inserted here.';
