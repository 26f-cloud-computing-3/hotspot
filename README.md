# 프로젝트 구조

- 서비스 URL: [Hotspot](https://hotspot-cloud-computing.vercel.app/)

- `backend/` — FastAPI (Python, uv). REST API 제공.
- `frontend/` — React + TypeScript (Vite, pnpm). 지도 SDK 연동 UI.

## 지도(Map) 연동

지도 제공자는 백엔드가 단일 소스로 결정한다 (`backend/.env`의 `MAP_PROVIDER`).
프론트엔드는 `GET /api/map/config`로 현재 provider와 클라이언트용 키를 받아
해당 provider 구현체(`frontend/src/features/map/providers/`)를 렌더링한다.
provider를 바꾸려면 `MAP_PROVIDER` 값만 바꾸면 되고, 각 provider 구현은
`MapViewProps`(`frontend/src/features/map/types.ts`) 인터페이스를 따른다.

- 1차 연동: **Kakao Map** (무료, 카드 등록 불필요 — https://developers.kakao.com)
- Naver / Google은 인터페이스만 잡아두고 구현은 스텁(`NotImplementedError` / 플레이스홀더) 상태.

지도 검색(geocoding 등) 서버 프록시 로직은 `backend/app/core/map_provider.py`에
provider 추상화로 두었고, REST API 시크릿(Kakao REST 키, Naver client secret 등)은
프론트엔드로 절대 내려가지 않는다. 프론트가 받는 건 브라우저 SDK용 키(`client_key`)뿐이다.

## 로컬 실행

### Backend

```bash
cd backend
cp .env.example .env   # 필요한 API 키 채우기
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

- Health check: http://localhost:8000/api/health

### Frontend

```bash
cd frontend
cp .env.example .env   # 기본값으로 충분하면 생략 가능
pnpm install
pnpm dev
```

http://localhost:5173 에서 확인 (포트 충돌 시 Vite가 자동으로 다음 포트 사용).
