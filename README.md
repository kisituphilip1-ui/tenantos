# Haven — Uganda tenant management

Haven is a mobile-friendly tenant and property management starter for Uganda. It is a **Vite + React + TypeScript** single-page web application. Supabase provides PostgreSQL, Auth, private Storage, and an Edge Function for invitations. The browser uses only the Supabase publishable key; PostgreSQL RLS is the authorization boundary.

The security/data model and permission plan are in [docs/architecture.md](./docs/architecture.md). Operational safeguards and known launch gaps are in [docs/security-operations.md](./docs/security-operations.md).

## What is included

- Email/password sign-in, invitation acceptance, generic password-reset responses, password update, global sign-out, and TOTP MFA enrollment/challenge for owners and administrators.
- Organization-scoped dashboard and record views for properties, tenancies, payments, maintenance, private documents, notices, approvals, team, and audit history.
- Maintenance request submission, employee invitation requests, second-approver review, and a trusted invitation Edge Function.
- Read-only demo mode with fictional sample records and role previews; available from the setup screen without Supabase credentials. Demo actions never authenticate, upload, or write data.
- Versioned schema with constraints, indexes, update/audit triggers, RLS on every application table, role/property/tenancy policies, a private document bucket, and pgTAP isolation tests.
- UGX money columns use exact PostgreSQL `numeric(14,2)`. Payment status is not confirmable from the browser.

This is a starter, not a fully configured production service. Provider payment callbacks, organization bootstrap UI, property/unit/tenancy CRUD, role-change and ownership-transfer executors, file malware scanning, rate limiting, and self-service session inventory still require trusted server work and/or provider configuration. Do not treat unavailable screens as permission to execute those actions manually in production.

## Prerequisites

- Node.js 20.19+ or 22.12+ (current Vite requirement), npm, and VS Code.
- A Supabase project for hosted use. For local database tests: Docker Desktop and the Supabase CLI.
- VS Code with the **Antigravity** extension enabled. Open this project folder in VS Code; use the integrated terminal for the commands below. Antigravity does not need a privileged credential or a separate project configuration.

## Run locally

1. Open the project folder in VS Code / Antigravity.
2. Install dependencies and copy the environment template:

   ```powershell
   npm install
   Copy-Item .env.example .env
   ```

3. Configure the two values in the root `.env`:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-key
   ```

   In the Supabase dashboard, copy the **Project URL** from **Project Settings → API** (or the project’s Connect panel). Copy the **publishable key** from **Project Settings → API Keys**. For older projects, Supabase may label this the `anon` key. The publishable/anon key is intended for client use only when RLS is correctly enabled. `.env` is ignored by Git; never prefix a service-role or secret key with `VITE_`.

   If you only want to explore the interface, select **Explore demo** on the setup screen. It uses fictional, read-only data and does not require credentials.

4. Start Vite after setting real values:

   ```powershell
   npm run dev
   ```

   Vite serves at `http://localhost:5173`. Restart it after changing environment variables. Unedited template placeholders are treated as missing configuration.

## Connect Supabase

1. Create separate Supabase projects for development, test, and production. Keep production credentials and data out of development.
2. In **Authentication → URL Configuration**, set the local Site URL to `http://localhost:5173` and add the exact local and production redirect URLs. Invitation and password-recovery links use the app origin.
3. In **Authentication → Providers**, enable email/password and email delivery. Require email confirmation, configure strong password rules and SMTP for production, and disable open sign-ups if only invitations are appropriate. If phone verification is needed, configure a trusted SMS provider and enable phone authentication. Supabase Auth rate limits and abuse/CAPTCHA controls should be configured before launch.
4. Install or run the Supabase CLI, authenticate, link the project, and apply the migration:

   ```powershell
   npx supabase login
   npx supabase link --project-ref your-project-id
   npx supabase db push
   ```

   The migration creates the schema, RLS policies, invitation and approval routines, and the private `tenant-documents` bucket. Review SQL before applying it to an existing project.
5. Create the initial owner in **Authentication → Users** and confirm the email. Then run this one-time bootstrap in the Supabase SQL Editor, replacing the organization name and owner email. The SQL Editor is privileged; do not make an owner-bootstrap function available to browser users.

   ```sql
   do $$
   declare
     owner_id uuid;
     organization_id uuid := gen_random_uuid();
   begin
     select id into owner_id
     from auth.users
     where lower(email) = lower('owner@example.ug')
       and email_confirmed_at is not null;
     if owner_id is null then
       raise exception 'Create and confirm the owner account first';
     end if;
     insert into public.organizations (id, name)
     values (organization_id, 'Your Organization');
     insert into public.organization_members (organization_id, user_id, role, status)
     values (organization_id, owner_id, 'owner', 'active');
   end $$;
   ```

   Audit the bootstrap result, sign in, and enroll a TOTP authenticator. Owner and administrator data access is denied by RLS until the session reaches MFA assurance level `aal2`.
6. Configure invitation delivery. Set these **server-side Supabase Edge Function secrets**; never place the service-role value in `.env`, source, or frontend hosting settings:

   ```powershell
   npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
   npx supabase secrets set APP_BASE_URL=https://your-app.example
   npx supabase secrets set 'APP_ALLOWED_ORIGINS=https://your-app.example,http://localhost:5173'
   npx supabase functions deploy invite-member
   ```

   Supabase supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Edge Functions. Add the app origin and function redirect URLs to Auth’s redirect allow-list. Keep function secrets separate per environment and rotate them if exposed.
7. Storage is private by migration. Uploads are limited to 10 MiB and PDF/JPEG/PNG/WebP. Metadata remains pending until a trusted malware scanner validates the file and marks the row `clean`; until then, Storage download policies deny access. **The starter does not include that scanner.** Do not mark unscanned uploads clean in production.
8. Enable the Supabase `pg_cron` extension and schedule expiry processing so stale approvals transition from pending to expired:

   ```sql
   select cron.schedule(
     'haven-expire-approvals',
     '*/15 * * * *',
     'select public.expire_approval_requests();'
   );
   ```

   Verify the job is active and alert on failures. The approvals screen also displays past-deadline requests as expired, but the scheduled job persists the database status.

## Development data and tests

For local development, start the local Supabase stack, then create these fictional Auth users in the Supabase Studio at `http://127.0.0.1:54323`: `owner@haven-demo.test`, `manager@haven-demo.test`, and `tenant@haven-demo.test`. Open the local SQL Editor and run `supabase/seed.sql` after creating the users:

```powershell
npx supabase start
```

`supabase/seed.sql` seeds a fictional Kampala property, tenancy, pending charge/payment, maintenance request, and notice. It requires those three local Auth accounts and is not production data. Local database resets remove Auth users; recreate the three accounts and run the seed script again after each reset.

Run the TypeScript production build:

```powershell
npm run build
```

Check production dependency advisories:

```powershell
npm run check:security
```

Run the database policy tests against the local Supabase stack:

```powershell
npx supabase test db
```

The pgTAP suite checks employee property scope, cross-organization denial, hidden employee payment amounts, tenant tenancy scope, tenant-owned payment amount access, write denial, and prevention of self-approval. Add equivalent tests for every new policy or privileged function.

## VS Code and Antigravity

Open the folder containing `package.json` in VS Code and trust the workspace only after reviewing the project files. Use the integrated PowerShell terminal. The Vite dev server is `npm run dev`; `npm run build` checks TypeScript and creates `dist/`. Antigravity can assist with code changes, but never paste production credentials into prompts, source files, commits, screenshots, or client environment values.

## Deployment

1. Build with `npm ci` and `npm run build` in CI. Deploy `dist/` to a static host that serves the SPA fallback over HTTPS.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend host’s **public build variables**. Those values are not secrets. Never configure a service-role key in the frontend host.
3. Deploy migrations and Edge Functions to the matching Supabase project; configure that project’s Auth URLs, SMTP, MFA, rate limits, private Storage policies, function secrets, and allowed origins.
4. Add deployment security headers at the host: a restrictive Content Security Policy (including your own Supabase endpoint and no unnecessary third-party origins), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `frame-ancestors` policy. Validate the final policy with the production bundle and Auth redirect flow.
5. Keep development, test, and production credentials separate. Review RLS and function diffs before deployment. Have an independent security review and restore drill before real tenant data is entered.

## Uganda configuration

Amounts are stored as UGX numeric values; the interface formats UGX without floating-point storage. Dates are presented consistently in `Africa/Kampala`. The app accepts phone numbers in international format as profile text; normalize and validate them server-side before connecting messaging or mobile-money providers. Payment providers are intentionally not hard-coded: verify provider signatures, replay protection, amount/currency/reference matching, and idempotency in trusted server code before a payment can be marked confirmed.

Lease wording is not supplied as legal advice. Configure lease templates with qualified Ugandan professionals and define personal-data retention, access, export, and deletion rules for your organization before launch.
