# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sesame Gateway — Enterprise OpenAI API Gateway that proxies AI requests through configurable backend channels. Supports OpenAI Chat Completions, Anthropic Messages, and OpenAI Responses API formats. Built with FastAPI backend + Next.js frontend.

## Commands

### Backend (Python)

```bash
cd backend

# Run development server (uses uv)
uv run uvicorn app.main:app --reload --port 8000

# Run all tests
uv run pytest

# Run a single test
uv run pytest tests/test_api.py::test_function_name -v

# Install dependencies
uv sync
```

### Frontend (Next.js)

```bash
cd frontend

# Run development server (uses Turbopack)
npm run dev

# Build for production
npm run build

# Lint
npm run lint

# Clean build cache
npm run clean
```

### Docker (local dev with SQLite)

```bash
cd backend
docker compose up -d
```

Backend is served at `http://localhost:8000`. The docker-compose at root uses SQLite + single container for quick local dev.

## Architecture

```
Client (OpenAI/Anthropic SDK)
  → Backend FastAPI  :8000
    → Auth (API Key / JWT)
    → Rate limiter  (Redis counter, per-key QPM)
    → Channel selector  (weighted random, model mapping, fallback)
    → Proxy to backend AI service  (HTTPX, stream/non-stream)
  → Logging (request logs + daily usage stats to MySQL)
  → WebSocket broadcasts (real-time monitor)

Admin UI (Next.js :3000)
  → JWT auth (login → localStorage token → Authorization header)
  → Management: users, API keys, channels, model mappings, logs, usage, monitor
  → User self-service: API keys, channel cookies, usage stats, preferences
```

### Backend (`backend/app/`)

| Layer | Files | Role |
|-------|-------|------|
| Entry | `main.py` | FastAPI app, lifespan (DB init, cache warm, cookie check loop), CORS |
| Auth | `auth.py` | Dual auth: API key (`Bearer sk-sesame-*`) for API + JWT for UI. Admin keys receive a random system key for usage distribution |
| Config | `config.py` | Pydantic Settings from `.env` — MySQL, Redis, encryption key, AI backend URL |
| DB | `database.py` | SQLAlchemy async engine + `SafeAsyncSession` (cancellation-shielded close) |
| Cache | `cache.py` | Redis wrapper supporting single/cluster mode, with key tag `{}` for cluster slot colocation |
| Models | `models/db_models.py` | 8 tables: users, api_keys, channels, model_mapping, user_channel_cookies, request_logs, usage_stats, user_sessions |
| Routers | `routers/` | 6 routers: `chat.py` (OpenAI), `anthropic.py` (Anthropic→OpenAI conversion), `responses.py` (Responses API), `admin.py`, `user.py`, `health.py` |
| Services | `services/` | Business logic — see key services below |
| Crypto | `crypto.py` | AES-256-GCM encrypt/decrypt for API keys and cookies |

**Key backend patterns:**

- **Channel routing**: `channel_service.select_channel(model)` picks a channel by weighted random within the highest priority tier. Supports exact model match, single-model fallback, and fallback models.
- **Model mapping**: `model_mapping` DB table maps external model names (user-facing) to internal model names (sent to backend). Loaded into Redis cache on startup.
- **User preferences**: `user_pref_cache.py` holds all user `(preferred_channel_id, load_balance)` in memory, avoiding DB hits per request. Updated on preference changes via admin API.
- **Cookie-based channels**: Channels with `auth_type=cookie` require per-user cookies (stored encrypted in `user_channel_cookies`). An auto-refresh loop runs every 30 minutes, attempting credential re-login for expired cookies.
- **Streaming logs**: Stream requests write a placeholder `RequestLog` at start (via `log_request_start`), then update token counts + latency when the stream completes (via `log_request_complete`). Usage stats are upserted atomically with `INSERT ... ON DUPLICATE KEY UPDATE`.
- **Format conversion**: `anthropic_format.py` and `responses_format.py` convert between Anthropic/Responses API formats and OpenAI Chat Completions format (the internal canonical format).
- **Retry/failover**: `proxy_service.proxy_request_with_retry` loops through channels and fallback models on failure.

**Services directory (`services/`):**

| Service | Role |
|---------|------|
| `proxy_service.py` | HTTPX client, request proxying with retry/failover, streaming/non-streaming |
| `channel_service.py` | Channel CRUD, weighted random selection, cache management |
| `apikey_service.py` | API key CRUD, validation, cache |
| `auth_service.py` | User CRUD, JWT token creation/verification |
| `mapping_service.py` | Model mapping CRUD, cache |
| `log_service.py` | Request logging (start + complete), usage stats aggregation |
| `rate_limit_service.py` | Redis-based per-key QPM rate limiting |
| `cache_service.py` | Concurrency control, request dedup, response caching |
| `session_service.py` | User session management |
| `user_pref_cache.py` | In-memory user preference cache |
| `websocket_service.py` | WebSocket broadcast for real-time monitor |
| `auto_login_service.py` | Cookie auto-refresh via credential re-login |
| `anthropic_format.py` | Anthropic Messages ↔ OpenAI Chat format conversion |
| `responses_format.py` | Responses API ↔ OpenAI Chat format conversion |

### Frontend (`frontend/`)

- **Framework**: Next.js 15 (App Router) with React 19, TypeScript
- **Styling**: Tailwind CSS 4 + shadcn/ui components + `motion` for animations
- **Auth**: JWT stored in `localStorage("sesame_token")`, managed by `AuthContext` (`lib/auth-context.tsx`). Protected routes redirect to `/login`.
- **API calls**: `lib/api.ts` provides `apiFetch(url, options)` — prepends `NEXT_PUBLIC_API_URL`, attaches Bearer token
- **Page structure**:
  - `/login` — public login
  - `/main/dashboard` — user dashboard
  - `/main/channels`, `/main/api-keys`, `/main/guide` — user self-service
  - `/main/cookie` — per-channel cookie management
  - `/main/logs` — request log viewer
  - `/main/models` — available models
  - `/main/admin/*` — admin: users, api-keys, channels, model-mapping, logs, usage, sessions, monitor

### Infrastructure

- **External services**: MySQL 8.0 + Redis 7.0 (not containerized, configured via `.env`)
- **Production deploy**: See `deploy/DEPLOY.md` — Nginx reverse proxy (:10006) → Backend (:10005) + Next.js (:3000 internal)
- **Schema migrations**: Handled in `init_db()` via `CREATE TABLE IF NOT EXISTS` + ALTER TABLE for new columns (checked with try/except)

## Configuration

Backend `.env` key variables:
- `MYSQL_*`, `REDIS_*` — database connections
- `ENCRYPTION_KEY` — base64-encoded 32-byte key for AES-GCM (required)
- `ENTERPRISE_AI_URL` — default backend AI service URL
- `ADMIN_PASSWORD` — auto-creates admin user on first start

Frontend `.env.local`:
- `NEXT_PUBLIC_API_URL` — backend base URL
