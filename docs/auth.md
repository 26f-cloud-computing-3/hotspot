# 인증 (Google 로그인 · Supabase Auth)

로그인/세션은 Supabase Auth가 담당하고, 백엔드(FastAPI)는 Supabase가 발급한 access token(JWT)을 **검증만** 한다. Google client secret은 Supabase 대시보드에만 있고 이 레포에는 들어가지 않는다.

## 흐름 (PKCE)

1. 프론트 `signInWithOAuth({provider: "google"})` → Google 로그인
2. Google → `https://<ref>.supabase.co/auth/v1/callback` → 프론트 `/auth/callback`
3. supabase-js가 code를 세션으로 교환하고 localStorage에 저장·자동 갱신
4. 프론트 `lib/api.ts`가 모든 요청에 `Authorization: Bearer <access_token>` 부착
5. 백엔드 `app/core/auth.py`의 `get_current_user`가 JWKS(`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`)로 서명, `aud=authenticated`, `iss`, `exp`를 검증하고 `sub`를 user id로 반환

보호가 필요한 엔드포인트는 `Depends(get_current_user)`만 추가하면 된다 (예: `GET /api/map/search`). DB에 유저 행이 필요한 엔드포인트는 아래 「사용자 테이블」의 `get_registered_user`를 쓴다.

장소 검색은 로그인한 사용자만 호출할 수 있다. 프론트엔드에서는 `lib/api.ts`의 `apiGet`을 사용하면 현재 세션의 Bearer 토큰이 자동으로 첨부된다. 예: `apiGet("/api/map/search?query=" + encodeURIComponent("카페"))`. `GET /api/map/config`는 인증 없이 공개한다.

## 사용자 테이블

`public."user"` (id = `auth.users.id`, name, handle, avatar_url, created_at). 별도 가입 절차는 없고, **백엔드가 로그인한 유저의 첫 요청 때 행을 만든다** (`backend/app/core/users.py`의 `get_registered_user`).

- 이름 · 프로필 사진은 access token의 `user_metadata`(Google 프로필)에서, handle은 이메일 local-part에서 만든다. handle이 이미 쓰이고 있으면 4자리 suffix가 붙는다.
- 행이 이미 있으면 이름 · 프로필 사진을 토큰의 Google 프로필에 맞춰 갱신한다 (토큰에 값이 없으면 저장된 값을 유지). handle은 유저를 가리키는 고정 식별자라 바꾸지 않는다.
- 프론트는 로그인 직후 `GET /api/me`를 호출해서, 로그인한 계정은 모두 행을 갖도록 한다 (`AuthProvider.tsx`).
- user 테이블을 참조하는 행을 쓰는 엔드포인트는 `get_current_user` 대신 `Depends(get_registered_user)`를 쓴다. 토큰 검증만 필요하면 `get_current_user`로 충분하다.

테이블 SQL은 `backend/supabase/migrations/0001_user_table.sql`. 여기에 들어 있던 가입 트리거는 `0004_drop_user_trigger.sql`에서 제거한다.

> `user`는 Postgres 예약어라 SQL에서는 항상 `public."user"`처럼 따옴표로 감싼다.

## 설정 절차

1. Supabase 프로젝트 생성 → Authentication → Providers → Google 활성화
2. Google Cloud Console에서 OAuth 클라이언트(웹) 생성, 승인된 리디렉션 URI에 `https://<ref>.supabase.co/auth/v1/callback` 추가 후 Client ID/Secret을 Supabase에 입력
3. Supabase → Authentication → URL Configuration: Redirect URLs에 `http://localhost:5173/auth/callback` (배포 도메인도 추가)
4. SQL Editor에서 `backend/supabase/migrations/`의 SQL 파일을 번호 순서대로 실행
5. 환경 변수 (`.env`는 커밋 금지)
   - `backend/.env`: `SUPABASE_URL`
   - `frontend/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

## 확인

- 로그인 없이 `/` 접근 → `/login`으로 이동
- Google 로그인 후 `/`로 복귀, 로그아웃 버튼으로 세션 종료
- `curl -H "Authorization: Bearer <token>" localhost:8000/api/me` → 200 (id, email, name, handle, avatar_url), 토큰이 없거나 잘못되면 401
