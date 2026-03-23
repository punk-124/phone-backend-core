# phone-backend-core

`phone-backend-core` is a NestJS backend skeleton for small phone apps.
Current MVP includes:

- Anonymous guest auth (`/api/auth/guest`, `/api/auth/refresh`)
- Drift bottle pool (`throw`, `pick`, `pass`, `mine`)
- CORS whitelist setup for multi-frontend deployment
- Daily quota guard with friendly message when limit is reached
- Swagger API docs (`/docs`)

## 1) Setup

```bash
cp .env.example .env
npm install
npm run start:dev
```

Default base URL: `http://localhost:8787/api`

## 2) Env

- `PORT`: server port
- `JWT_SECRET`: JWT signing secret
- `CORS_ORIGINS`: comma-separated frontend origins
- `DAILY_READ_LIMIT`: max read rows per day
- `DAILY_WRITE_LIMIT`: max written rows per day
- `QUOTA_TIMEZONE`: when a day resets (for quota counters)

Example:

```env
PORT=8787
JWT_SECRET=super-secret
CORS_ORIGINS=https://app.example.com,https://h5.example.com,http://localhost:5173
DAILY_READ_LIMIT=5000000
DAILY_WRITE_LIMIT=100000
QUOTA_TIMEZONE=Asia/Shanghai
```

## 3) Anonymous auth flow

1. Call `POST /api/auth/guest` to get `accessToken` and `refreshToken`
2. Pass `Authorization: Bearer <accessToken>` for protected APIs
3. Call `POST /api/auth/refresh` when access token expires

## 4) Bottle APIs

- `POST /api/bottles` throw bottle
- `POST /api/bottles/pick` pick random bottle
- `POST /api/bottles/:id/pass` pass picked bottle to pool
- `GET /api/bottles/mine?offset=0&limit=10` get paged thrown/picked bottles
- `GET /api/bottles/pool?offset=0&limit=10` get paged pool rows (debug)
- `GET /api/bottles/quota/usage` get current daily read/write usage

When a daily limit is reached, APIs return a Chinese message:

- `今天已经不能xx了，明天再来吧`

## 5) Notes before production

- Replace in-memory storage with D1/PostgreSQL
- Add rate limit and abuse protection
- Add content moderation
- Add database transaction lock for `pick` operation

## 6) Cloudflare D1 version

If you want direct Cloudflare deployment, use:

- `cf-worker/` (Worker + D1 implementation)
- `cf-worker/d1/schema.sql` (database schema)
- `cf-worker/README.md` (deployment checklist)
