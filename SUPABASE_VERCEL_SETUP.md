# Bytewave Supabase + Vercel Production Setup

## 1. Create Supabase Tables

Open Supabase SQL Editor and run:

```sql
-- paste and run the full contents of SUPABASE_PRODUCTION.sql
```

This creates an empty production database. It does not seed demo users, demo organizations, or test portal records.

## 2. Vercel Environment Variables

Set these in Vercel Project Settings > Environment Variables:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SESSION_SECRET=use-a-long-random-secret
SUPER_ADMIN_EMAIL=your-platform-admin-email
SUPER_ADMIN_PASSWORD=your-strong-platform-password
SUPER_ADMIN_SECRET=use-another-long-random-secret
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code. It is only used by Vercel serverless APIs.

## 3. Production Data Behavior

On Vercel, the app now requires Supabase or another configured production KV provider.

If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are missing, production APIs fail instead of silently writing user data to a temporary local file.

Local fallback data is only for `localhost` development.

## 4. Clean Empty Database

If you need to wipe application data and start clean, run:

```sql
-- paste and run the full contents of SUPABASE_CLEAN_RESET.sql
```

Use this carefully. It deletes organizations, users, workflows, reports, KV records, and uploaded document objects.

## 5. Required Deployment Order

1. Run `SUPABASE_PRODUCTION.sql` in Supabase.
2. Add the Vercel environment variables.
3. Deploy to Vercel.
4. Register the first organization from the public app.
5. Login after registration before accessing portals.
