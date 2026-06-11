-- Add one Supabase Auth user as a SarifPro admin.
-- 1. Create/sign up the admin user in Supabase Auth first.
-- 2. Set v_admin_email below to that login email.
-- 3. Run this once in Supabase SQL Editor.

do $$
declare
  v_admin_email text := 'ADMIN_EMAIL_HERE';
  v_admin_user_id uuid;
begin
  if v_admin_email = 'ADMIN_EMAIL_HERE' then
    raise exception 'Set v_admin_email before running this script.';
  end if;

  select u.id
  into v_admin_user_id
  from auth.users u
  where lower(u.email) = lower(v_admin_email)
  limit 1;

  if v_admin_user_id is null then
    raise exception 'No Supabase Auth user found for email %', v_admin_email;
  end if;

  insert into public.admin_users (user_id, email, is_active)
  values (v_admin_user_id, lower(v_admin_email), true)
  on conflict (user_id)
  do update set
    email = excluded.email,
    is_active = true;

  raise notice 'Admin access enabled for %', v_admin_email;
end $$;
