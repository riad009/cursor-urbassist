# Vercel deployment

**Sign-in works on localhost but not on Vercel?** The app needs a PostgreSQL database and env vars on Vercel. Until `DATABASE_URL` (and optionally `JWT_SECRET`) are set in the project’s Environment Variables, login and registration will fail on the live site.

## Required environment variables

Set these in **Vercel → Your Project → Settings → Environment Variables**:

| Variable        | Description |
|----------------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (e.g. Neon, Vercel Postgres, Supabase). **Required** for login/register and all app features. |
| `JWT_SECRET`   | Secret for auth tokens. Use a long random string in production (e.g. `openssl rand -base64 32`). |

## Neon + Vercel checklist

1. **Get the Neon connection string**
   - In [Neon](https://console.neon.tech): open your project → Dashboard.
   - Under “Get connected to your new database”, copy the **connection string** (starts with `postgresql://...`).
   - Prefer the **pooled** connection string if shown (e.g. `-pooler` in the host); it works better with serverless.

2. **Add env vars in Vercel**
   - Vercel → your project → **Settings** → **Environment Variables**.
   - Add `DATABASE_URL` = your Neon connection string (Production, Preview, Development as needed).
   - Add `JWT_SECRET` = a long random string (recommended for production).

3. **Create tables in Neon (one-time)**
   - From your project folder, run (replace with your real Neon URL):
   ```bash
   set DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
   npx prisma db push
   ```
   - Or in PowerShell: `$env:DATABASE_URL="postgresql://..."; npx prisma db push`
   - This creates the `User` table and the rest of the schema in Neon.

4. **Redeploy**
   - Vercel → **Deployments** → … on latest → **Redeploy**, or push a new commit so a new build uses the new env vars.

After this, login and registration on the Vercel URL should work. You do **not** need to enable “Neon Auth” in the Neon dashboard; this app uses its own auth with your Neon database.
