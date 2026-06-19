# ReactCMS — Full Stack

A multi-tenant headless CMS with an Express/TypeScript backend, React/Vite dashboard, and a lightweight JavaScript SDK.

## Project structure

```
reactcms-backend/    ← Express + TypeScript API
reactcms-dashboard/  ← React + Vite dashboard
reactcms-sdk/        ← Vanilla JS SDK for client websites
start.sh             ← One-command startup
```

## Quick start

### Prerequisites
- Node.js 20+
- Docker + Docker Compose
- `curl` (for health checks in start.sh)

### 1. Clone / download and run

```bash
chmod +x start.sh
./start.sh
```

That single command:
1. Creates `.env` files with auto-generated JWT secrets
2. Installs npm dependencies for both backend and frontend
3. Starts PostgreSQL 16 and Redis 7 via Docker
4. Runs all database migrations (creates tables + RLS policies)
5. Seeds demo users, a website, content, and an API key
6. Starts the backend API on port 3001 (with hot reload)
7. Starts the React dashboard on port 5173 (with HMR)

### 2. Open the dashboard

Navigate to **http://localhost:5173**

| Account | Email | Password |
|---|---|---|
| Admin | admin@reactcms.io | Admin1234! |
| Demo user | demo@example.mu | Demo1234! |

The seed script also prints a read-only SDK API key. Use it in any HTML page:

```html
<script src="reactcms-sdk/dist/sdk.js"
        data-key="cms_pk_<from seed output>"
        data-website="<website UUID from dashboard>"></script>

<h1 data-cms="hero-title">Loading…</h1>
```

---

## Manual setup (without start.sh)

### Backend

```bash
cd reactcms-backend

# 1. Configure
cp .env.example .env
# Edit .env — set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (32+ chars each)

# 2. Start infrastructure
docker compose up postgres redis -d

# 3. Install and migrate
npm install
npm run db:migrate
npm run db:seed

# 4. Start dev server
npm run dev
```

### Frontend

```bash
cd reactcms-dashboard
cp .env.example .env
npm install
npm run dev
```

---

## Available commands

### Backend
| Command | Description |
|---|---|
| `npm run dev` | Start with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to dist/ |
| `npm start` | Run compiled output |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:seed` | Seed demo data |
| `npm test` | Run unit tests (Vitest, no services needed) |
| `npm run typecheck` | TypeScript type check without emitting |

### Frontend
| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build to dist/ |
| `npm run preview` | Preview production build |

### Docker
| Command | Description |
|---|---|
| `docker compose up -d` | Start all services detached |
| `docker compose down` | Stop services |
| `docker compose down -v` | Stop and wipe volumes |
| `docker compose logs -f api` | Follow API logs |

---

## Architecture

```
Browser
  └── Dashboard (React + Vite :5173)
        └── API calls → API (Express + TypeScript :3001)
                          ├── PostgreSQL :5432 (data + RLS)
                          └── Redis :6379 (sessions + cache)

Client websites
  └── SDK (sdk.js) → Public API (:3001/public/*)
                       └── Redis cache → PostgreSQL fallback
```

## Security notes

The codebase incorporates these security controls:

- JWT access tokens (15 min TTL) + rotating refresh tokens stored in Redis
- Bcrypt password hashing (12 rounds)
- PostgreSQL Row-Level Security on `content_items`
- Per-type content value size limits (10KB text, 100KB richtext, 2KB image URLs)
- Server-side HTML sanitisation before storage (richtext)
- Client-side DOMPurify sanitisation before `innerHTML` (defence-in-depth)
- Redis-backed rate limiters shared across all instances
- API key stored as SHA-256 hash — original key shown once, never stored
- Refresh token rotation with replay detection
- CORS locked to configured origins (management API) / wildcard (public SDK API)
- Helmet security headers including strict CSP

See the security audit notes in this conversation for full details and remaining items.
