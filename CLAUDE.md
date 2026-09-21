# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project structure

- `backend/` — FastAPI (Python 3.14, managed with `uv`). Serves the REST API and an MCP endpoint from the same process.
- `frontend/` — React 19 + TypeScript (Vite, pnpm). Map SDK integration UI.

## Commands

### Backend (`cd backend`)

```bash
uv sync                                            # install deps
uv run uvicorn app.main:app --reload --port 8000   # run dev server
uv run ruff check .                                # lint
uv run ruff format .                                # format
uv run pytest                                      # run tests (no tests written yet)
uv run pytest path/to/test_file.py::test_name      # run a single test
```

- Health check: `http://localhost:8000/api/health`
- MCP endpoint: `http://localhost:8000/mcp/`
- Copy `backend/.env.example` to `backend/.env` and fill in provider keys before running.

### Frontend (`cd frontend`)

```bash
pnpm install
pnpm dev       # dev server, http://localhost:5173
pnpm build     # tsc -b && vite build
pnpm lint      # biome lint .
pnpm format    # biome format --write .
pnpm check     # biome check --write . (lint + format + organize imports)
pnpm preview
```

- Copy `frontend/.env.example` to `frontend/.env` if you need to override `VITE_API_BASE_URL` (defaults to `http://localhost:8000`).

## Architecture

### Map provider abstraction (backend-owned, single source of truth)

The active map provider is a **backend** decision, not a frontend one: `MAP_PROVIDER` in `backend/.env` (`"kakao" | "naver" | "google"`) selects it. The frontend never picks a provider itself — it calls `GET /api/map/config` (`backend/app/api/map.py`) to learn which provider is active and receives only the client-safe key for it.

- Backend side: `MapProvider` ABC in `backend/app/core/map_provider.py`. Each provider (`KakaoMapProvider`, `NaverMapProvider`, `GoogleMapProvider`) implements `search_places()`. Only Kakao is actually implemented; Naver and Google are stubs that raise `NotImplementedError`. `get_map_provider(settings)` is the factory used by both the REST API and the MCP tool.
- Frontend side: `frontend/src/features/map/MapView.tsx` fetches `/api/map/config`, then renders the matching component from `frontend/src/features/map/providers/` via the `PROVIDERS` lookup map. Every provider component implements `MapViewProps` (`frontend/src/features/map/types.ts`).
- To add/change a provider: implement `MapProvider` on the backend, add/complete the matching component under `frontend/src/features/map/providers/` satisfying `MapViewProps`, and wire it into `PROVIDERS` in `MapView.tsx`. No other call site needs to change.

### Secret handling (Kakao has two distinct keys)

Kakao issues separate keys for server-side REST calls (`kakao_map_rest_api_key`) and the browser-loaded JS SDK (`kakao_map_js_key`). `map.py`'s `/api/map/config` endpoint returns *only* the client-safe SDK key for the active provider (`client_key`) — server-side secrets (Kakao REST key, Naver client secret, etc.) are read from `Settings` (`backend/app/core/config.py`, pydantic-settings, loaded from `.env`) and never leave the backend.

### MCP endpoint shares the same app and provider abstraction

`backend/app/mcp/server.py` defines an `MCPServer` instance (`mcp` package, `mcp.server.mcpserver.MCPServer`) and registers backend capabilities as MCP tools (e.g. `search_places`, which reuses `get_map_provider`). `backend/app/main.py` mounts it at `/mcp` via `mcp.streamable_http_app(...)` and manages its session manager lifecycle through the FastAPI `lifespan`. Add new MCP tools by decorating functions with `@mcp.tool()` in this file — keep them thin wrappers over the same core logic the REST API uses, don't duplicate provider logic.
