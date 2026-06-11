# SarifPro Download Page

This folder is a static download site for SarifPro. It can be hosted for free on GitHub Pages, Netlify, Vercel, or Cloudflare Pages.

## Current APK

The page currently downloads `./SarifPro-1.0.37.apk` from the same hosted folder.

## Recommended Free Setup

1. Create a GitHub repository, for example `sarifpro-download`.
2. Upload this `download-site` folder to the repository.
3. Keep the versioned APK in this folder, or upload the APK to a GitHub Release and update the download link in `index.html`.
4. Enable GitHub Pages from repository settings.
5. Share the GitHub Pages URL with customers.

## Admin Panel

`admin.html` provides a Supabase Auth-protected admin console. Before using it, create a Supabase Auth account for the admin and run `supabase/admin/add_admin_user.sql` once with that email.

The admin console supports:

- approving or rejecting renewal requests
- searching customer accounts by email, name, phone, or device id
- activating, blocking, or renewing device-bound subscriptions
- sending password reset emails
- setting a temporary customer password

The Users tab uses Supabase admin RPCs, and password reset emails use Supabase Auth's recovery email flow. Apply this SQL migration before using the Users tab:

```text
supabase/migrations/202606060001_admin_user_management.sql
```

The optional "Set Temporary Password" button uses a Netlify Function so the service role key never appears in browser code. In Netlify, set these environment variables:

```text
SUPABASE_URL=https://fhrnfnboenkhkzmieokr.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_UD7qKmNg4FHjC2UVCRY6MQ_y0VMcpJ3
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SARIFPRO_AUTH_REDIRECT_URL=https://YOUR_DOMAIN/auth/reset-password/
```

Deploy through Netlify Git/CLI when using the temporary-password function. A simple drag-and-drop static deploy may not include serverless functions. User search, subscription management, and reset-email sending work from the static admin page after the SQL migration is applied.

## Supabase Auth Redirect Pages

This site also hosts the production Supabase Auth redirect pages:

- `/auth/confirmed/`
- `/auth/reset-password/`

After deploying this folder, set `SARIFPRO_AUTH_REDIRECT_BASE_URL` in `android/gradle.properties` to your hosted domain, for example `https://sarifpro.netlify.app`.

In Supabase Dashboard, open Authentication -> URL Configuration and add these redirect URLs:

- `https://YOUR_DOMAIN/auth/confirmed`
- `https://YOUR_DOMAIN/auth/confirmed/`
- `https://YOUR_DOMAIN/auth/reset-password`
- `https://YOUR_DOMAIN/auth/reset-password/`

Use the same deployed domain for `YOUR_DOMAIN`. Do not use localhost for production confirmation or password reset links.

## Netlify Setup

1. Open Netlify.
2. Drag this `download-site` folder into Netlify's deploy area.
3. Update `index.html` to point to your APK download URL.
4. Share the Netlify URL.

## APK Note

GitHub repositories block files over 100 MB. The current release APK is under that limit, but GitHub Releases is still cleaner for long-term APK storage.
