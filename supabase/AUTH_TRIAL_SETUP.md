# SarifPro Auth + Trial Setup

Run this SQL in the Supabase SQL Editor before testing registration:

```sql
-- Paste and run:
-- supabase/migrations/202605190001_auth_trial_backend.sql
```

The migration creates:

- `clients`
- `devices`
- `subscriptions`
- `create_trial_subscription(...)`
- `get_device_subscription_status(...)`
- `get_client_account_status(...)`

## App Test Flow

1. Install SarifPro `1.0.5`.
2. Open the app. It should show Login, not Dashboard.
3. Register with email, password, full name, and phone.
4. The app creates one 3-day `trial` subscription for that Supabase user and Android device.
5. Dashboard should show the logged-in email, `TRIAL`, expiry date, and trial days remaining.
6. Send an automation SMS while the trial is active; automation should run.
7. Change the subscription row to `expired` or `blocked`; automation should stop, while Dashboard, Settings, Transactions, Renew Subscription, and payment submission remain available.
8. Try registering another user on the same Android device. Supabase should return `Trial already used on this device.`

## Renewal Approval

After a payment reference is submitted from the app, run:

```sql
-- Edit v_payment_reference and v_plan_type first:
-- supabase/admin/approve_subscription_request.sql
```

No transaction amount, SMS body, customer phone number, USSD data, balance history, or automation log is sent to Supabase.
