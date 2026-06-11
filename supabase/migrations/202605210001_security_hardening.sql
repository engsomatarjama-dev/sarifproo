-- SarifPro security hardening.
-- Remote Supabase must never store SMS bodies, customer transaction data,
-- USSD payloads, PIN activity, balance transfer history, or local logs.

drop table if exists public.transactions cascade;
drop table if exists public.transaction_history cascade;
drop table if exists public.balance_transfer_logs cascade;
drop table if exists public.automation_logs cascade;
drop table if exists public.logs cascade;

alter table if exists public.clients enable row level security;
alter table if exists public.devices enable row level security;
alter table if exists public.subscriptions enable row level security;
alter table if exists public.payment_verification_requests enable row level security;
alter table if exists public.app_metadata_events enable row level security;

revoke all on table public.clients from anon, authenticated;
revoke all on table public.devices from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.payment_verification_requests from anon, authenticated;
revoke all on table public.app_metadata_events from anon, authenticated;

grant select on table public.clients to authenticated;
grant select on table public.devices to authenticated;
grant select on table public.subscriptions to authenticated;
grant select, insert on table public.payment_verification_requests to authenticated;
grant insert on table public.app_metadata_events to authenticated;

drop policy if exists clients_select_own on public.clients;
create policy clients_select_own
on public.clients
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists clients_insert_own on public.clients;
drop policy if exists clients_update_own on public.clients;

drop policy if exists devices_select_own on public.devices;
create policy devices_select_own
on public.devices
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists devices_insert_own on public.devices;
drop policy if exists devices_update_own on public.devices;

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists subscriptions_insert_own on public.subscriptions;
drop policy if exists subscriptions_update_own on public.subscriptions;
drop policy if exists subscriptions_delete_own on public.subscriptions;

drop policy if exists payment_verification_requests_select_own on public.payment_verification_requests;
create policy payment_verification_requests_select_own
on public.payment_verification_requests
for select
to authenticated
using (auth.uid() = auth_user_id);

drop policy if exists payment_verification_requests_insert_own on public.payment_verification_requests;
create policy payment_verification_requests_insert_own
on public.payment_verification_requests
for insert
to authenticated
with check (
  auth.uid() = auth_user_id
  and status = 'pending'
  and payment_reference is not null
  and length(trim(payment_reference)) > 0
  and device_id is not null
  and length(trim(device_id)) > 0
);

drop policy if exists payment_verification_requests_update_own on public.payment_verification_requests;
drop policy if exists payment_verification_requests_delete_own on public.payment_verification_requests;

drop policy if exists app_metadata_events_insert_own on public.app_metadata_events;
create policy app_metadata_events_insert_own
on public.app_metadata_events
for insert
to authenticated
with check (
  auth.uid() = auth_user_id
  and app_version is not null
  and device_id is not null
);

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

revoke all on function public.get_device_subscription_status(text) from public;
grant execute on function public.get_device_subscription_status(text) to authenticated;

revoke all on function public.get_client_account_status(text) from public;
grant execute on function public.get_client_account_status(text) to authenticated;

notify pgrst, 'reload schema';
