-- Repairs mobile renewal submission permissions.
-- This keeps financial/customer transaction data out of Supabase.
-- The mobile app may only insert its own payment verification request.

alter table public.payment_verification_requests enable row level security;

grant select, insert on public.payment_verification_requests to authenticated;

drop policy if exists payment_verification_requests_insert_own on public.payment_verification_requests;
create policy payment_verification_requests_insert_own
on public.payment_verification_requests
for insert
to authenticated
with check (
  auth.uid() is not null
  and auth.uid() = auth_user_id
  and status = 'pending'
  and payment_reference is not null
  and length(trim(payment_reference)) > 0
  and device_id is not null
  and length(trim(device_id)) > 0
);

drop policy if exists payment_verification_requests_select_own on public.payment_verification_requests;
create policy payment_verification_requests_select_own
on public.payment_verification_requests
for select
to authenticated
using (auth.uid() = auth_user_id);

select pg_notify('pgrst', 'reload schema');

select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'payment_verification_requests'
order by policyname;
