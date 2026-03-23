# Cloudflare + D1 Deployment Guide

This folder is a ready-to-deploy Cloudflare Worker backend using D1.

## What you will do later (step-by-step)

1. Install dependencies

```bash
cd cf-worker
npm install
```

2. Login to Cloudflare

```bash
npx wrangler login
```

3. Create D1 database (first time only)

```bash
npx wrangler d1 create phone_backend_core
```

After running this command, Wrangler will print a `database_id`.
Copy that value into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "phone_backend_core"
database_id = "PASTE_YOUR_DATABASE_ID_HERE"
```

4. Run schema migration

```bash
npx wrangler d1 execute phone_backend_core --file ./d1/schema.sql --remote
```

5. Set CORS origins in `wrangler.toml`

```toml
[vars]
CORS_ORIGINS = "https://your-frontend-domain.com,https://your-h5-domain.com"
DAILY_READ_LIMIT = "5000000"
DAILY_WRITE_LIMIT = "100000"
QUOTA_TIMEZONE = "Asia/Shanghai"
```

6. Deploy Worker

```bash
npx wrangler deploy
```

After deploy, you will get a Worker URL like:

`https://phone-backend-core.<your-subdomain>.workers.dev`

Set your frontend API base URL to:

`https://phone-backend-core.<your-subdomain>.workers.dev/api`

## API summary

- `POST /api/auth/guest`
- `POST /api/auth/refresh`
- `POST /api/bottles`
- `POST /api/bottles/pick`
- `POST /api/bottles/:id/pass`
- `GET /api/bottles/mine?offset=0&limit=10`
- `GET /api/bottles/pool?offset=0&limit=10`
- `GET /api/bottles/quota/usage`

When daily quota is exceeded, APIs return:

- `Today this action is unavailable, please come back tomorrow.`

## Notes

- This Worker implementation uses opaque access tokens stored in D1 sessions.
- If you later need forum support, add `posts` and `comments` tables in the same D1 database.
