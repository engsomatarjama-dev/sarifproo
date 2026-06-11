# SarifPro

SarifPro is an Android-only React Native application for mobile money exchange automation. It listens for exchange SMS messages, monitors sender `898` for balance messages, dials USSD transfers automatically, and uses an Android Accessibility Service to enter PIN2 and press send.

## Privacy model

- Transaction history, balance transfer history, automation history, and logs are stored locally in SQLite on the Android device only.
- Customer phone numbers, SMS contents, USSD payloads, PIN activity, transaction references, and financial amounts are never uploaded.
- Backend integrations are reserved for authentication, subscriptions, payment verification, client account status, device binding, and basic anonymous app metadata only.

## Core capabilities

- SMS exchange parsing with Somali and English regex support
- Sender `898` balance monitoring with dynamic USSD transfer generation
- Accessibility-driven PIN2 entry automation
- Subscription guard with 7-day device-bound trial, expiry locking, and integrity checks
- SQLite-backed transactions, payments, subscriptions, and logs
- Background monitoring while the app is minimized
- Test Mode for pasting fake SMS messages and previewing automation output
- Local-only privacy for transactions and customer data

## Tech stack

- React Native `0.81.1`
- TypeScript
- React Navigation
- Zustand
- `react-native-sqlite-storage`
- `react-native-mmkv`
- `react-native-keychain`
- `react-native-background-actions`
- `react-native-permissions`
- Kotlin native modules for SMS, USSD, accessibility, notifications, and security hashing
- Supabase (`@supabase/supabase-js`) for auth, subscriptions, payment verification, device binding, and anonymous app metadata

## Project structure

```text
src/
├── automation/
├── components/
├── core/
├── database/
├── hooks/
├── models/
├── modules/
├── native/
├── navigation/
├── repositories/
├── screens/
├── services/
├── store/
├── types/
└── utils/
```

## Setup

1. Install Node.js 20+ and JDK 17.
2. Install Android Studio with SDK 35 and an emulator or connect a real Android phone.
3. From the project root, install dependencies:

```bash
npm install
```

4. Open Android accessibility settings on the device later and enable **SarifPro Accessibility Service** after the app is installed.

## Supabase production setup

1. Apply the migrations in [C:\code\supabase\migrations](</C:/code/supabase/migrations>) to your Supabase project.
2. Set the Android Gradle properties in [C:\code\android\gradle.properties](</C:/code/android/gradle.properties>) or inject them through your CI/CD secrets:

```properties
SARIFPRO_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SARIFPRO_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
SARIFPRO_SUPABASE_USE_ANONYMOUS_AUTH=false
```

3. Enable email/password sign-ins in Supabase Authentication providers. Do not enable anonymous sign-ins for production access.
4. Let the customer submit a renewal request from the app's **Renew Subscription** screen.
5. Review pending renewal requests with [C:\code\supabase\admin\list_pending_payment_requests.sql](</C:/code/supabase/admin/list_pending_payment_requests.sql>).
6. Approve a paid reference with [C:\code\supabase\admin\approve_subscription_request.sql](</C:/code/supabase/admin/approve_subscription_request.sql>).
7. Keep all transaction, SMS, balance, customer, and automation data local-only. Do not create or use remote transaction tables.

### Remote scope

Supabase is now reserved for:

- authentication
- device-bound subscription validation
- manual payment verification queue
- client account status
- anonymous app metadata heartbeat

Supabase must not be used for:

- transactions
- transaction history
- balance transfer records
- SMS bodies
- customer phone numbers
- references
- local logs
- PIN or USSD payloads

## Running in development

Start Metro:

```bash
npm start
```

In a second terminal:

```bash
npm run android
```

If you prefer Gradle directly:

```bash
cd android
gradle assembleDebug
```

## Production build

1. Replace the debug signing config in `android/app/build.gradle` with your release keystore.
2. Build the release APK or AAB:

```bash
cd android
gradle assembleRelease
```

or

```bash
cd android
gradle bundleRelease
```

## Device permissions and manual steps

Grant:

- SMS receive/read
- Phone call
- Notifications

Then enable:

- Accessibility Service for PIN2 automation

## How automation works

### Exchange SMS automation

Supported message families:

- `Tixraac: 14493527188, Waxaad $10 u sariftay SLSH100,000 NAME(252638757926)`
- `Ref: 13503084724, You have exchanged $6 to SLSH60000 for NAME(252633610948), your new balance is ...`
- `Tix: 14778652780, Waxaad $120 ka heshay ISMAACIIL YUUSUF CISMAAN AADAN (634701953) Tar: 13/05/26 13:44:27, Hadhaagaaga:$429.9868`

The app extracts:

- `reference`
- `amount`
- `phone`

Duplicates are blocked by reference and SMS hash.

### 898 balance monitoring

Supported message family:

- `Xisaabtaada(2072429-25263872480) Hadhaageedu waa $5`

If balance is above the configured threshold, the app builds:

```text
*shortcode*account*amount*pin1#
```

Example:

```text
*806*4636240*5*1122#
```

It then dials the USSD string. The accessibility service fills PIN2 and presses Send/OK when the prompt appears.

## Subscription behavior

- One 7-day trial per device
- Plans: monthly, quarterly, yearly
- Statuses: active, expired, blocked, trial
- Expired subscriptions can still access dashboard, settings, logs, history, and renewal flow
- Automation features are blocked when the subscription is expired or integrity checks fail

## Testing checklist

1. Launch the app and confirm trial creation on first run.
2. Save account number, PIN1, PIN2, shortcode, and thresholds in Settings.
3. Enable the accessibility service in Android settings.
4. Use **Test Mode** to paste exchange SMS and balance SMS samples.
5. Confirm:
   - exchange parsing succeeds
   - balance parsing succeeds
   - USSD preview is generated
6. Send real test SMS messages on a physical Android device:
   - exchange message from operator source
   - balance message from sender `898`
7. Verify transaction history, logs, notifications, and duplicate prevention.

## Important production notes

- Subscription activation is currently manual-admin verified through Supabase SQL scripts:
  - `supabase/admin/list_pending_payment_requests.sql`
  - `supabase/admin/approve_subscription_request.sql`
- A future admin portal or backend endpoint can wrap the same flow. The mobile service layer is scaffolded in:
  - `src/services/SubscriptionApiService.ts`
  - `src/services/PaymentVerificationService.ts`
  - `src/services/LoggingApiService.ts`
- The mobile app now contains a real Supabase client boundary for:
  - remote subscription validation
  - device binding checks
  - payment verification request submission
  - anonymous app metadata heartbeat
- Transaction sync to Supabase or any other backend is intentionally not implemented. Transaction history, balance transfers, SMS data, and automation logs stay on-device only.
- If you add analytics later, keep them anonymous and limited to app metadata such as app version, automation toggles, and last active timestamp.
- The generated Gradle wrapper properties are included, but the wrapper JAR is not stored in this text-only output. Running `gradle wrapper` once in a connected environment restores it if you want to use `./gradlew`.
- SMS receive behavior must be tested on a real Android device because modern emulators often do not mirror operator flows accurately.
