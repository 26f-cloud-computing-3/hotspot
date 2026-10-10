# 데이터베이스 (Supabase Postgres 직접 연결)

백엔드(FastAPI)는 Supabase Postgres에 **직접 연결**해서 읽고 쓴다 (SQLAlchemy 2 + psycopg 3). 프론트엔드는 DB에 직접 접근하지 않고 백엔드 REST API만 호출한다.

## 구조

- `backend/app/core/db.py` — 엔진 생성, `get_db` 의존성 (`Depends(get_db)`로 `Session` 주입). `DATABASE_URL`이 비어 있으면 503.
- `backend/app/models/` — ORM 모델. 스키마의 기준은 SQL 마이그레이션이고, 모델은 그것을 그대로 옮겨 적은 것이다.
- `backend/supabase/migrations/*.sql` — 스키마. 번호 순서대로 Supabase SQL Editor에서 실행한다.

## 권한

직접 연결은 RLS(row level security)를 우회한다. 따라서 **모든 쿼리는 백엔드 코드에서 로그인한 유저 기준으로 범위를 제한**해야 한다 (예: `where owner_id = <current user>`). 테이블의 RLS 정책은 Supabase API로 접근하는 경우를 대비한 안전장치일 뿐이다.

## 설정

1. Supabase SQL Editor에서 `backend/supabase/migrations/`의 SQL 파일을 번호 순서대로 실행
2. Supabase 대시보드 → Connect → Connection string에서 URI 복사 (Render처럼 IPv4만 되는 환경은 Session/Transaction pooler 주소 사용)
3. `backend/.env`와 배포 환경(Render)에 `DATABASE_URL` 설정. DB 비밀번호가 포함된 시크릿이므로 커밋 금지.

## 컬렉션 API

모두 `Authorization: Bearer <access_token>` 필요.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/collections` | 내 컬렉션 목록 (최신순) |
| POST | `/api/collections` | 컬렉션 생성. `{ "name": "서울 카페", "is_public": false }` — 이름은 앞뒤 공백 제거 후 1~50자, 기본값 비공개 |

응답 항목: `id`, `name`, `is_public`, `place_count`, `created_at`. 장소 저장이 아직 없어서 `place_count`는 항상 0이다.

## 컬렉션 히스토리 (피드용)

`public.collection_history`는 유저가 컬렉션에 한 일을 쌓아 두는 추가 전용(append-only) 로그이고, 피드는 이 테이블을 읽어서 만든다. 컬렉션을 바꾸는 API는 **같은 트랜잭션 안에서** 히스토리 행을 함께 넣는다.

- `action`: 지금은 `collection_created`(컬렉션 생성)만 기록한다. 수정 · 삭제 · 장소 추가/제외는 해당 기능을 만들 때 `action` 체크 제약과 `CollectionAction`에 값을 추가한다.
- `collection_name`, `is_public`: 행위 시점의 스냅샷. 컬렉션 이름이 바뀌거나 삭제돼도 히스토리를 읽을 수 있고(`collection_id`는 삭제 시 null), `is_public`은 그 시점에 팔로워가 볼 수 있었는지를 뜻한다.
- 비공개 컬렉션에 대한 행위도 기록한다. 피드에 노출할지는 읽는 쪽(피드 API)에서 `is_public`으로 거른다.

## 테스트

`backend/tests/test_collections.py`는 인메모리 SQLite에 ORM 모델로 테이블을 만들어 돌린다. Postgres 전용 기능(제약 조건, RLS)은 테스트되지 않는다.
