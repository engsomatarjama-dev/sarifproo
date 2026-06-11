do $$
begin
  if to_regclass('public.client_accounts') is not null
    and to_regclass('public.device_bindings') is not null
    and to_regclass('public.client_subscriptions') is not null
  then
    insert into public.clients (user_id, full_name, phone, device_id, status, created_at)
    select
      ca.auth_user_id,
      'SarifPro Client',
      '-',
      coalesce(db.device_id, 'legacy-' || ca.auth_user_id::text),
      ca.status,
      ca.created_at
    from public.client_accounts ca
    left join public.device_bindings db on db.client_account_id = ca.id
    on conflict (user_id)
    do update set
      device_id = excluded.device_id,
      status = case when public.clients.status = 'blocked' then 'blocked' else excluded.status end;

    insert into public.devices (user_id, device_id, device_name, is_active, created_at)
    select
      db.auth_user_id,
      db.device_id,
      coalesce(db.device_label, 'SarifPro Android device'),
      db.is_active,
      db.created_at
    from public.device_bindings db
    on conflict (device_id)
    do update set
      user_id = excluded.user_id,
      device_name = excluded.device_name,
      is_active = excluded.is_active;

    insert into public.subscriptions (user_id, plan_type, start_date, expiry_date, status, payment_reference, created_at)
    select
      ca.auth_user_id,
      cs.plan_type,
      cs.start_date,
      cs.expiry_date,
      cs.status,
      cs.payment_reference,
      cs.created_at
    from public.client_subscriptions cs
    join public.client_accounts ca on ca.id = cs.client_account_id
    where not exists (
      select 1
      from public.subscriptions s
      where s.user_id = ca.auth_user_id
        and s.payment_reference = cs.payment_reference
    );
  end if;
end $$;

drop table if exists public.client_subscriptions cascade;
drop table if exists public.device_bindings cascade;
drop table if exists public.client_accounts cascade;

notify pgrst, 'reload schema';
