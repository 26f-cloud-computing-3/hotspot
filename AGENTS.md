# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product context

Hotspot — 좋아하는 장소를 컬렉션으로 모으고, 공개한 컬렉션을 팔로워 피드로 공유하는 웹 서비스 (데스크톱/모바일 반응형). 화면 6종: 로그인(Google) · 피드 · 장소 찾기 · 내 컬렉션 · 컬렉션 상세 · 팔로워. 요약은 `docs/product.md`, 원본은 Notion 기획안. 기능을 구현하기 전에 `docs/product.md`를 먼저 확인할 것. UI를 만들 때는 루트 `DESIGN.md`(디자인 시스템: 컬러/타이포/컴포넌트 토큰)를 따른다. 색·간격·라디우스는 하드코딩하지 말고 토큰(CSS 변수)으로 참조한다.

## Git workflow (MUST follow)

- **`main`에 직접 push/commit 금지.** 항상 `<type>/<short-name>` 브랜치(`feat/`, `fix/`, `chore/`, `docs/`)에서 작업하고 Pull Request로만 머지한다. `.claude/settings.json`의 deny 규칙이 `git push origin main`을 막는다.
- PR은 사용자가 요청할 때만 만든다. 만들 때는 `.github/pull_request_template.md` 구조를 따른다.
- PR 전에 확인: backend `uv run ruff check . && uv run pytest`, frontend `pnpm check && pnpm build`.
- 커밋은 작고 목적이 하나인 단위로. `.env` 등 시크릿은 절대 커밋하지 않는다.
- **PR 브랜치의 커밋은 논리적 단위 구분을 유지한다.** 이 저장소는 rebase merge만 허용하므로 PR의 커밋이 그대로 `main` 히스토리에 남는다. "fix typo", "address review" 같은 수정 커밋을 쌓지 말고, 해당 논리적 커밋에 합쳐(fixup/amend 후 force-with-lease push) 각 커밋이 독립적으로 의미를 갖도록 정리한다.
- 사용자와의 대화와 문서(`docs/`)는 한국어, 코드·식별자·커밋 메시지는 영어.

## Project structure

- `backend/` — FastAPI (Python 3.14, managed with `uv`). Serves the REST API.
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

- Backend side: `MapProvider` ABC in `backend/app/core/map_provider.py`. Each provider (`KakaoMapProvider`, `NaverMapProvider`, `GoogleMapProvider`) implements `search_places()`. Only Kakao is actually implemented; Naver and Google are stubs that raise `NotImplementedError`. `get_map_provider(settings)` is the factory used by the REST API.
- Frontend side: `frontend/src/features/map/MapView.tsx` fetches `/api/map/config`, then renders the matching component from `frontend/src/features/map/providers/` via the `PROVIDERS` lookup map. Every provider component implements `MapViewProps` (`frontend/src/features/map/types.ts`).
- To add/change a provider: implement `MapProvider` on the backend, add/complete the matching component under `frontend/src/features/map/providers/` satisfying `MapViewProps`, and wire it into `PROVIDERS` in `MapView.tsx`. No other call site needs to change.

### Secret handling (Kakao has two distinct keys)

Kakao issues separate keys for server-side REST calls (`kakao_map_rest_api_key`) and the browser-loaded JS SDK (`kakao_map_js_key`). `map.py`'s `/api/map/config` endpoint returns *only* the client-safe SDK key for the active provider (`client_key`) — server-side secrets (Kakao REST key, Naver client secret, etc.) are read from `Settings` (`backend/app/core/config.py`, pydantic-settings, loaded from `.env`) and never leave the backend.
