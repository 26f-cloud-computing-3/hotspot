# 인증 (Google 로그인 · Supabase Auth)

로그인/세션은 Supabase Auth가 담당하고, 백엔드(FastAPI)는 Supabase가 발급한 access token(JWT)을 **검증만** 한다. Google client secret은 Supabase 대시보드에만 있고 이 레포에는 들어가지 않는다.

## 흐름 (PKCE)

1. 프론트 `signInWithOAuth({provider: "google"})` → Google 로그인
2. Google → `https://<ref>.supabase.co/auth/v1/callback` → 프론트 `/auth/callback`
3. supabase-js가 code를 세션으로 교환하고 localStorage에 저장·자동 갱신
4. 프론트 `lib/api.ts`가 모든 요청에 `Authorization: Bearer <access_token>` 부착
5. 백엔드 `app/core/auth.py`의 `get_current_user`가 JWKS(`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`)로 서명, `aud=authenticated`, `iss`, `exp`를 검증하고 `sub`를 user id로 반환

보호가 필요한 엔드포인트는 `Depends(get_current_user)`만 추가하면 된다 (예: `GET /api/me`). MCP(`/mcp`) 인증은 아직 적용하지 않았다.

## 사용자 테이블

`public."user"` (id = `auth.users.id`, name, handle, avatar_url, created_at). `auth.users` insert 트리거가 Google 프로필에서 자동으로 행을 만들어 별도 가입 절차가 없다. handle은 이메일 local-part 기반이며 중복 시 4자리 suffix가 붙는다. SQL: `backend/supabase/migrations/0001_user_table.sql`.

> `user`는 Postgres 예약어라 SQL에서는 항상 `public."user"`처럼 따옴표로 감싼다.

## 설정 절차

1. Supabase 프로젝트 생성 → Authentication → Providers → Google 활성화
2. Google Cloud Console에서 OAuth 클라이언트(웹) 생성, 승인된 리디렉션 URI에 `https://<ref>.supabase.co/auth/v1/callback` 추가 후 Client ID/Secret을 Supabase에 입력
3. Supabase → Authentication → URL Configuration: Redirect URLs에 `http://localhost:5173/auth/callback` (배포 도메인도 추가)
4. SQL Editor에서 `0001_user_table.sql` 실행
5. 환경 변수 (`.env`는 커밋 금지)
   - `backend/.env`: `SUPABASE_URL`
   - `frontend/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

## 확인

- 로그인 없이 `/` 접근 → `/login`으로 이동
- Google 로그인 후 `/`로 복귀, 로그아웃 버튼으로 세션 종료
- `curl -H "Authorization: Bearer <token>" localhost:8000/api/me` → 200, 토큰이 없거나 잘못되면 401
