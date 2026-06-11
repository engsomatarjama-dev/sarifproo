-- Shows SarifPro renewal requests.
-- Safe fields only: no transaction, SMS, customer, balance, USSD, or PIN data.

select
  payment_reference,
  plan_type,
  expected_amount,
  device_id,
  auth_user_id,
  status,
  created_at
from public.payment_verification_requests
order by created_at desc;
