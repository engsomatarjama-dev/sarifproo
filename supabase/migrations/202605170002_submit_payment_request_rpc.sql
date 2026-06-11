create or replace function public.submit_payment_verification_request(
  p_device_id text,
  p_payment_reference text,
  p_plan_type text,
  p_expected_amount numeric default null
)
returns table (
  payment_reference text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_existing_auth_user_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if nullif(trim(p_device_id), '') is null then
    raise exception 'Device ID is required.';
  end if;

  if nullif(trim(p_payment_reference), '') is null then
    raise exception 'Payment reference is required.';
  end if;

  if p_plan_type not in ('monthly', 'quarterly', 'yearly') then
    raise exception 'Unsupported plan type: %', p_plan_type;
  end if;

  select pvr.auth_user_id
  into v_existing_auth_user_id
  from public.payment_verification_requests pvr
  where pvr.payment_reference = trim(p_payment_reference)
  limit 1;

  if v_existing_auth_user_id is not null and v_existing_auth_user_id <> v_auth_user_id then
    raise exception 'This payment reference has already been submitted.';
  end if;

  insert into public.payment_verification_requests (
    auth_user_id,
    device_id,
    payment_reference,
    plan_type,
    expected_amount,
    status
  )
  values (
    v_auth_user_id,
    trim(p_device_id),
    trim(p_payment_reference),
    p_plan_type,
    p_expected_amount,
    'pending'
  )
  on conflict (payment_reference)
  do update set
    device_id = excluded.device_id,
    plan_type = excluded.plan_type,
    expected_amount = excluded.expected_amount,
    status = 'pending',
    updated_at = now()
  where public.payment_verification_requests.auth_user_id = v_auth_user_id;

  return query
  select
    trim(p_payment_reference)::text,
    'pending'::text;
end;
$$;

revoke all on function public.submit_payment_verification_request(text, text, text, numeric) from public;
grant execute on function public.submit_payment_verification_request(text, text, text, numeric) to anon;
grant execute on function public.submit_payment_verification_request(text, text, text, numeric) to authenticated;

notify pgrst, 'reload schema';
