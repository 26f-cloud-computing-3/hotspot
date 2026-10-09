# 데이터베이스 (Supabase Postgres 직접 연결)

백엔드(FastAPI)는 Supabase Postgres에 **직접 연결**해서 읽고 쓴다 (SQLAlchemy 2 + psycopg 3). 프론트엔드는 DB에 직접 접근하지 않고 백엔드 REST API만 호출한다.

## 구조

- `backend/app/core/db.py` — 엔진 생성, `get_db` 의존성 (`Depends(get_db)`로 `Session` 주입). `DATABASE_URL`이 비어 있으면 503.
- `backend/app/models/` — ORM 모델. 스키마의 기준은 SQL 마이그레이션이고, 모델은 그것을 그대로 옮겨 적은 것이다.
- `backend/supabase/migrations/*.sql` — 스키마. 번호 순서대로 Supabase SQL Editor에서 실행한다.

## 권한

직접 연결은 RLS(row level security)를 우회한다. 따라서 **모든 쿼리는 백엔드 코드에서 로그인한 유저 기준으로 범위를 제한**해야 한다 (예: `where owner_id = <current user>`). 테이블의 RLS 정책은 Supabase API로 접근하는 경우를 대비한 안전장치일 뿐이다.

## 설정

1. Supabase SQL Editor에서 `0001_user_table.sql`, `0002_collection_table.sql`을 순서대로 실행
2. Supabase 대시보드 → Connect → Connection string에서 URI 복사 (Render처럼 IPv4만 되는 환경은 Session/Transaction pooler 주소 사용)
3. `backend/.env`와 배포 환경(Render)에 `DATABASE_URL` 설정. DB 비밀번호가 포함된 시크릿이므로 커밋 금지.

## 컬렉션 API

모두 `Authorization: Bearer <access_token>` 필요.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/collections` | 내 컬렉션 목록 (최신순) |
| POST | `/api/collections` | 컬렉션 생성. `{ "name": "서울 카페", "is_public": false }` — 이름은 앞뒤 공백 제거 후 1~50자, 기본값 비공개 |

응답 항목: `id`, `name`, `is_public`, `place_count`, `created_at`. 장소 저장이 아직 없어서 `place_count`는 항상 0이다.

## 테스트

`backend/tests/test_collections.py`는 인메모리 SQLite에 ORM 모델로 테이블을 만들어 돌린다. Postgres 전용 기능(제약 조건, RLS)은 테스트되지 않는다.
