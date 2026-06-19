# ReactCMS Backend

Production-ready Express + TypeScript API for ReactCMS — a multi-tenant headless CMS.

## Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js 20, TypeScript 5 |
| Framework | Express 4 + Fastify-style middleware |
| Database | PostgreSQL 16 with Row-Level Security |
| Cache / Sessions | Redis 7 |
| Auth | JWT (RS256 access + refresh token rotation) |
| Validation | Zod |
| Logging | Winston (dev: pretty, prod: JSON) |
| Testing | Vitest |

## Quick start

```bash
# 1. Clone and install
npm install

# 2. Start Postgres + Redis
docker-compose up postgres redis -d

# 3. Configure
cp .env.example .env          # set JWT secrets (min 32 chars)

# 4. Run migrations + seed
npm run db:migrate
npm run db:seed

# 5. Start dev server (hot reload)
npm run dev
```

The API is now live at `http://localhost:3001`.

## Environment variables

See `.env.example` for the full list. Required:

```
DATABASE_URL            postgresql://...
REDIS_URL               redis://...
JWT_ACCESS_SECRET       min 32 chars
JWT_REFRESH_SECRET      min 32 chars (different from access)
API_BASE_URL            https://api.yourdomain.com
```

## Project structure

```
src/
├── config/          Zod-validated env — fails at startup if misconfigured
├── lib/
│   ├── db/          pg Pool, withTransaction, RLS helpers, migrate, seed
│   ├── jwt.ts       sign/verify access + refresh tokens
│   ├── logger.ts    Winston
│   └── redis.ts     refresh token store and rotation
├── middleware/
│   ├── auth.middleware.ts       requireAuth, requireWebsiteMember, requireApiKey
│   ├── error.middleware.ts      global error handler
│   ├── rateLimit.middleware.ts  per-route sliding-window limits
│   ├── requestLogger.ts         per-request timing
│   └── validate.middleware.ts   Zod body/query/params guard
├── modules/
│   ├── auth/        register, login, refresh, logout, /me
│   ├── websites/    CRUD + member management
│   ├── content/     upsert, publish, version history, restore
│   ├── apikeys/     create, list, revoke
│   └── sdk/         public content + batch + media endpoints
├── types/           shared types, Express augmentation
└── utils/           errors, hash, response helpers
```

## Auth flow

```
POST /v1/auth/login
→ { access_token, user }  +  HttpOnly cookie: reactcms_refresh

# access_token expires in 15 min
# use refresh cookie to rotate

POST /v1/auth/refresh
→ { access_token, expires_in: 900 }
```

All management routes: `Authorization: Bearer <access_token>`
SDK routes: `X-CMS-Key: cms_pk_...`

## Rate limits

| Route | Window | Max |
|---|---|---|
| Auth (login/register) | 1 min | 5 req/IP |
| Management API | 1 min | 120 req/user |
| SDK content fetch | 1 min | 500 req/key |
| SDK batch fetch | 1 min | 60 req/key |

## Running tests

```bash
npm test              # run all unit tests
npm run test:watch    # watch mode
```

All tests use mocked DB and Redis — no running services needed.

## Production deployment

```bash
# Build TypeScript
npm run build

# Or use Docker
docker build -t reactcms-api .
docker-compose up -d
```

The `Dockerfile` does a two-stage build. Final image ~180 MB.

## SDK usage (client websites)

```html
<script src="https://cdn.reactcms.io/sdk.js"
        data-key="cms_pk_yourkey"
        data-website="velomu">
</script>

<h1 data-cms="hero-title">Loading...</h1>
<p  data-cms="hero-subtitle">Loading...</p>
```

Or fetch directly:

```js
// Single key
GET /sdk/v1/content/hero-title
X-CMS-Key: cms_pk_yourkey

// Batch (up to 50 keys in one round-trip)
POST /sdk/v1/content/batch
X-CMS-Key: cms_pk_yourkey
{ "keys": ["hero-title", "hero-subtitle", "cta-label"] }
```

Responses are CDN-cacheable: `Cache-Control: s-maxage=60, stale-while-revalidate=300`.
