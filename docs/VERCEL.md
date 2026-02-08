# Vercel + Neon deployment

This app uses **PostgreSQL on Neon** and is deployed on **Vercel**. No extra Neon features (e.g. Neon Auth) are required.

## 1. Create a Neon project and get connection strings

1. Go to [console.neon.tech](https://console.neon.tech) and sign in.
2. Create a new project (or use an existing one).
3. Open the project → **Connection details** (or **Dashboard** → connection info).
4. You need **two** connection strings:
   - **Pooled connection** — host usually contains `-pooler` (e.g. `ep-xxx-pooler.region.aws.neon.tech`). Use this for **`DATABASE_URL`** (runtime/app).
   - **Direct connection** — same URL but **without** `-pooler` in the host. Use this for **`DIRECT_URL`** (Prisma migrations only).

Copy both; you’ll set them in Vercel and in your local `.env` / `.env.local`.

## 2. Environment variables on Vercel

In **Vercel → Your Project → Settings → Environment Variables**, set:

| Variable           | Description |
|--------------------|-------------|
| `DATABASE_URL`     | Neon **pooled** connection string (host with `-pooler`). |
| `DIRECT_URL`       | Neon **direct** connection string (no `-pooler`), for migrations. |
| `NEXTAUTH_SECRET`  | Long random string (e.g. `openssl rand -base64 32`). |
| `AUTH_SECRET`      | Same or another long random string. |
| `NEXTAUTH_URL`     | Your app’s **production** URL (e.g. `https://your-app.vercel.app`). |
| `AUTH_URL`         | Same as `NEXTAUTH_URL` for production. |

For production, **`NEXTAUTH_URL` and `AUTH_URL` must use your real Vercel domain**, not `localhost`.

Add any optional vars you use: `GEMINI_API_KEY`, Stripe keys, `NEXT_PUBLIC_*`, etc.

## 3. One-time local setup (before first deploy)

1. Copy `.env.example` to `.env` and `.env.local`.
2. Fill in your **real** Neon URLs and secrets in both:
   - `DATABASE_URL` = Neon pooled connection string
   - `DIRECT_URL` = Neon direct connection string
   - `NEXTAUTH_SECRET`, `AUTH_SECRET`, and optionally `NEXTAUTH_URL` / `AUTH_URL` for local (e.g. `http://localhost:3000`)
3. Apply the schema and seed the database once:
   ```bash
   npx prisma db push
   npm run db:seed
   ```

Do **not** commit `.env` or `.env.local`; only the example file is committed.

## 4. Deploy on Vercel

After setting the env vars in Vercel (step 2), deploy (or redeploy). The build will use `DATABASE_URL` at runtime. Run `npx prisma db push` and `npm run db:seed` from your machine (with `DATABASE_URL` and `DIRECT_URL` in `.env`) once so your Neon database has the schema and seed data; no extra Neon features are required.
