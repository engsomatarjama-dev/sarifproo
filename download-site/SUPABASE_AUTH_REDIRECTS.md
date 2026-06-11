# SarifPro Supabase Auth Redirect Setup

Deploy this `download-site` folder to GitHub Pages, Netlify, Vercel, or Cloudflare Pages.

Use the deployed domain as the app auth redirect base URL:

```properties
SARIFPRO_AUTH_REDIRECT_BASE_URL=https://YOUR_DOMAIN
```

Add these URLs in Supabase Dashboard -> Authentication -> URL Configuration -> Redirect URLs:

```text
https://YOUR_DOMAIN/auth/confirmed
https://YOUR_DOMAIN/auth/confirmed/
https://YOUR_DOMAIN/auth/reset-password
https://YOUR_DOMAIN/auth/reset-password/
```

Set the email confirmation redirect to:

```text
https://YOUR_DOMAIN/auth/confirmed
```

Set the password reset redirect to:

```text
https://YOUR_DOMAIN/auth/reset-password
```

The public auth pages use only the Supabase publishable key. Never add a Supabase service role key to this folder or to the mobile app.
