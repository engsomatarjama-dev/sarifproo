-- SarifPro admin approval script.
-- Run this from the Supabase SQL Editor after the customer submits a payment
-- reference from the app renewal screen.
--
-- Privacy note: this script only touches auth, payment verification,
-- device binding, and subscription rows. It does not store transaction,
-- SMS, customer phone, balance, USSD, or PIN data.

do $$
declare
  v_payment_reference text := 'PASTE_PAYMENT_REFERENCE_HERE';
  v_plan_type text := 'monthly'; -- monthly, quarterly, yearly
  v_auth_user_id uuid;
  v_device_id text;
  v_start_date timestamptz := now();
  v_expiry_date timestamptz;
begin
  if v_payment_reference = 'PASTE_PAYMENT_REFERENCE_HERE' then
    raise exception 'Set v_payment_reference before running this script.';
  end if;

  if v_plan_type not in ('monthly', 'quarterly', 'yearly') then
    raise exception 'Unsupported plan type: %', v_plan_type;
  end if;

  select pvr.auth_user_id, pvr.device_id
  into v_auth_user_id, v_device_id
  from public.payment_verification_requests pvr
  where pvr.payment_reference = v_payment_reference
  order by pvr.created_at desc
  limit 1;

  if v_auth_user_id is null or v_device_id is null then
    raise exception 'No payment verification request found for reference %', v_payment_reference;
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

  update public.subscriptions
  set status = 'expired'
  where user_id = v_auth_user_id
    and (device_id = v_device_id or device_id is null)
    and status in ('active', 'trial', 'pending');

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
    v_payment_reference
  );

  update public.payment_verification_requests
  set status = 'verified', updated_at = now()
  where payment_reference = v_payment_reference;

  raise notice 'Subscription approved. device_id=%, auth_user_id=%, expiry=%',
    v_device_id,
    v_auth_user_id,
    v_expiry_date;
end $$;
