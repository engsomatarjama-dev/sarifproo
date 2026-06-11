create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

revoke all on table public.admin_users from anon, authenticated;
grant select on table public.admin_users to authenticated;

drop policy if exists admin_users_select_self on public.admin_users;
create policy admin_users_select_self
on public.admin_users
for select
to authenticated
using (auth.uid() = admin_users.user_id);

create or replace function public.is_sarifpro_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.is_active = true
  );
$$;

revoke all on function public.is_sarifpro_admin() from public;
grant execute on function public.is_sarifpro_admin() to authenticated;

create or replace function public.admin_list_payment_requests(p_status text default 'pending')
returns table (
  payment_reference text,
  plan_type text,
  expected_amount numeric,
  device_id text,
  auth_user_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(coalesce(nullif(trim(p_status), ''), 'pending'));
begin
  if not public.is_sarifpro_admin() then
    raise exception 'Admin access is required.';
  end if;

  if v_status not in ('pending', 'verified', 'rejected', 'all') then
    raise exception 'Unsupported request status: %', p_status;
  end if;

  return query
  select
    pvr.payment_reference,
    pvr.plan_type,
    pvr.expected_amount,
    pvr.device_id,
    pvr.auth_user_id,
    pvr.status,
    pvr.created_at,
    pvr.updated_at
  from public.payment_verification_requests pvr
  where v_status = 'all' or pvr.status = v_status
  order by pvr.created_at desc;
end;
$$;

revoke all on function public.admin_list_payment_requests(text) from public;
grant execute on function public.admin_list_payment_requests(text) to authenticated;

drop function if exists public.admin_approve_payment_request(text, text);

create or replace function public.admin_approve_payment_request(
  p_payment_reference text,
  p_plan_type text
)
returns table (
  approved_payment_reference text,
  approved_device_id text,
  approved_auth_user_id uuid,
  approved_plan_type text,
  approved_status text,
  approved_expiry_date timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reference text := trim(p_payment_reference);
  v_plan_type text := lower(trim(p_plan_type));
  v_auth_user_id uuid;
  v_device_id text;
  v_start_date timestamptz := now();
  v_expiry_date timestamptz;
begin
  if not public.is_sarifpro_admin() then
    raise exception 'Admin access is required.';
  end if;

  if nullif(v_reference, '') is null then
    raise exception 'Payment reference is required.';
  end if;

  if v_plan_type not in ('monthly', 'quarterly', 'yearly') then
    raise exception 'Unsupported plan type: %', p_plan_type;
  end if;

  select pvr.auth_user_id, pvr.device_id
  into v_auth_user_id, v_device_id
  from public.payment_verification_requests pvr
  where pvr.payment_reference = v_reference
  order by pvr.created_at desc
  limit 1
  for update;

  if v_auth_user_id is null or nullif(v_device_id, '') is null then
    raise exception 'No payment verification request found for reference %', v_reference;
  end if;

  v_expiry_date := case v_plan_type
    when 'monthly' then v_start_date + interval '1 month'
    when 'quarterly' then v_start_date + interval '3 months'
    when 'yearly' then v_start_date + interval '1 year'
  end;

  insert into public.clients (
    user_id,
    full_name,
    phone,
    device_id,
    status
  )
  values (
    v_auth_user_id,
    'SarifPro Client',
    '-',
    v_device_id,
    'active'
  )
  on conflict (user_id)
  do update set
    device_id = excluded.device_id,
    status = 'active';

  insert into public.devices (user_id, device_id, device_name, is_active)
  values (v_auth_user_id, v_device_id, 'SarifPro Android device', true)
  on conflict (device_id)
  do update set
    user_id = excluded.user_id,
    device_name = excluded.device_name,
    is_active = true;

  update public.subscriptions s
  set status = 'expired'
  where s.user_id = v_auth_user_id
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
    v_auth_user_id,
    v_device_id,
    v_plan_type,
    v_start_date,
    v_expiry_date,
    'active',
    v_reference
  );

  update public.payment_verification_requests pvr
  set status = 'verified',
      plan_type = v_plan_type,
      updated_at = now()
  where pvr.payment_reference = v_reference;

  return query
  select
    v_reference,
    v_device_id,
    v_auth_user_id,
    v_plan_type,
    'active'::text,
    v_expiry_date;
end;
$$;

revoke all on function public.admin_approve_payment_request(text, text) from public;
grant execute on function public.admin_approve_payment_request(text, text) to authenticated;

create or replace function public.admin_reject_payment_request(p_payment_reference text)
returns table (
  payment_reference text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reference text := trim(p_payment_reference);
begin
  if not public.is_sarifpro_admin() then
    raise exception 'Admin access is required.';
  end if;

  if nullif(v_reference, '') is null then
    raise exception 'Payment reference is required.';
  end if;

  update public.payment_verification_requests pvr
  set status = 'rejected',
      updated_at = now()
  where pvr.payment_reference = v_reference;

  if not found then
    raise exception 'No payment verification request found for reference %', v_reference;
  end if;

  return query
  select v_reference, 'rejected'::text;
end;
$$;

revoke all on function public.admin_reject_payment_request(text) from public;
grant execute on function public.admin_reject_payment_request(text) to authenticated;

comment on table public.admin_users is 'SarifPro admin portal allowlist. Does not contain customer financial transaction data.';

notify pgrst, 'reload schema';
