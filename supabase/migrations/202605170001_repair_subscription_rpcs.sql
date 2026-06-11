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

notify pgrst, 'reload schema';
