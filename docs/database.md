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
| GET | `/api/collections` | 내 컬렉션 목록 (최신순). `?provider=kakao&place_id=1001`을 함께 주면 각 항목의 `contains_place`에 그 장소가 담겨 있는지가 들어간다 (둘 중 하나만 주면 422) |
| POST | `/api/collections` | 컬렉션 생성. `{ "name": "서울 카페", "is_public": false }` — 이름은 앞뒤 공백 제거 후 1~50자, 기본값 비공개 |
| GET | `/api/collections/{id}` | 내 컬렉션 하나 조회 (컬렉션 상세 화면용) |
| PATCH | `/api/collections/{id}` | 내 컬렉션의 이름 · 공개 여부 수정. `{ "name": "성수 카페", "is_public": true }` — 보낸 필드만 바뀐다(생략하거나 null이면 유지). 이름 규칙은 생성과 같다 |
| DELETE | `/api/collections/{id}` | 내 컬렉션 삭제. 성공 시 204(본문 없음). 담긴 장소도 함께 지워진다 |
| GET | `/api/collections/{id}/places` | 내 컬렉션에 담긴 장소 목록 (최근에 담은 순) |
| POST | `/api/collections/{id}/places` | 장소 담기. 본문은 장소 검색 결과(`GET /api/map/search`의 `places` 항목) 그대로. 새로 담으면 201, 이미 담긴 장소면 200이고 아무것도 바뀌지 않는다 |
| DELETE | `/api/collections/{id}/places/{provider}/{place_id}` | 장소 제외. 204. 담겨 있지 않은 장소여도 204 |

`{id}`가 다른 유저의 컬렉션이거나 없는 id면 모두 404다.

컬렉션 응답 항목: `id`, `name`, `is_public`, `place_count`, `contains_place`(장소를 지정하지 않은 조회에서는 null), `created_at`.

장소 응답 항목: `id`(provider의 장소 id), `provider`, `name`, `address`, `road_address`, `category`, `phone`, `url`, `lat`, `lng`, `added_at`. 검색 결과와 같은 모양이라 프론트엔드에서 같은 타입으로 다룬다.

## 컬렉션에 담긴 장소

`public.collection_place`가 컬렉션과 장소를 잇는다. 공용 장소 테이블은 없고, 행마다 담는 시점의 장소 정보(이름 · 주소 · 좌표 등)를 스냅샷으로 가진다.

- 지도 provider에는 id로 장소를 다시 조회하는 API가 없어서, 백엔드는 클라이언트가 보낸 장소 정보를 검증할 수 없다. 장소 행을 유저끼리 공유하면 한 유저가 보낸 값이 다른 유저의 컬렉션에 보이게 되므로 컬렉션마다 따로 저장한다. 입력은 길이 · 좌표 범위만 제한하고, `url`은 링크로 렌더링되므로 `http(s)://`로 시작하는 값만 받는다.
- 같은 장소인지는 `(provider, provider_place_id)`로 판단한다. `(collection_id, provider, provider_place_id)`가 유일하므로 한 컬렉션에 같은 장소가 두 번 담기지 않고, 한 장소를 여러 컬렉션에 담을 수는 있다.
- 스냅샷은 담을 때 한 번 저장하고 갱신하지 않는다.
- 컬렉션당 장소 수 상한은 없다.

## 컬렉션 히스토리 (피드용)

`public.collection_history`는 유저가 컬렉션에 한 일을 쌓아 두는 추가 전용(append-only) 로그이고, 피드는 이 테이블을 읽어서 만든다. 컬렉션을 바꾸는 API는 **같은 트랜잭션 안에서** 히스토리 행을 함께 넣는다.

- `action`: 지금 기록하는 값은 아래와 같다.
  - `collection_created` — 컬렉션 생성
  - `collection_renamed` — 이름 변경. `collection_name`에는 바뀐 이름이 남는다 (이전 이름은 앞선 행의 스냅샷에 있다).
  - `collection_published` / `collection_unpublished` — 공개 여부 변경.
  - `collection_deleted` — 컬렉션 삭제. 삭제 직전에 기록하므로 마지막 이름 · 공개 여부가 스냅샷으로 남고, 이후 FK(`on delete set null`)가 이 행과 이전 행들의 `collection_id`를 null로 바꾼다.
  - `place_added` / `place_removed` — 장소 담기 / 제외. `place_name`에 장소 이름이 남는다. 이미 담긴 장소를 다시 담거나 없는 장소를 제외하는 요청은 기록하지 않는다.
  - 수정 요청에서는 값이 실제로 바뀐 항목만 기록하고, 현재 값을 다시 보내면 기록하지 않는다. 이름과 공개 여부를 한 번에 바꾸면 `collection_renamed` → 공개 여부 순으로 두 행이 남는다.
- `place_name`: 장소에 대한 행위일 때만 채워지는 장소 이름 스냅샷. 그 밖의 행위에서는 null.
- `collection_name`, `is_public`: 행위 시점의 스냅샷. 컬렉션 이름이 바뀌거나 삭제돼도 히스토리를 읽을 수 있고(`collection_id`는 삭제 시 null), `is_public`은 그 시점에 팔로워가 볼 수 있었는지를 뜻한다.
- 비공개 컬렉션에 대한 행위도 기록한다. 피드에 노출할지는 읽는 쪽(피드 API)에서 `is_public`으로 거른다.

## 팔로우

`public.follow`(`follower_id`, `followee_id`, `created_at`)는 유저 간 단방향 팔로우다. 승인 절차 없이 즉시 팔로우되고, 복합 PK로 중복을, 체크 제약으로 자기 자신 팔로우를 막는다. SQL: `backend/supabase/migrations/0006_follow_table.sql`.

모두 `Authorization: Bearer <access_token>` 필요.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/users?q=` | 유저 검색. 핸들은 접두 일치, 이름은 부분 일치 (대소문자 무시, 앞의 `@`는 무시). 본인 제외, 핸들순 최대 20명 |
| PUT | `/api/follows/{user_id}` | 팔로우. 이미 팔로우 중이어도 204. 본인이면 400, 없는 유저면 404 |
| DELETE | `/api/follows/{user_id}` | 언팔로우. 팔로우 중이 아니어도 204 |
| GET | `/api/follows/following` | 내가 팔로우한 유저 (최근 팔로우순) |
| GET | `/api/follows/followers` | 나를 팔로우한 유저 (최근 팔로우순) |

응답 항목: `id`, `name`, `handle`, `avatar_url`, `is_following`(내가 그 유저를 팔로우 중인지 — 팔로워 목록에서 맞팔 여부를 알 수 있다).

- 목록 API는 로그인한 유저 본인 것만 돌려준다. 다른 유저의 팔로워/팔로잉 목록을 조회하는 API는 의도적으로 두지 않았다 (`docs/features.md` 4번).
- 팔로우 자체는 `collection_history`에 기록하지 않는다. 피드는 `collection_history`를 `follow`와 조인(`actor_id = followee_id`, `follower_id = 나`, `is_public`)해서 만든다.
- 목록은 아직 페이지네이션이 없다.

## 최근 검색어

`public.search_history`(`id`, `user_id`, `query`, `searched_at`)는 유저가 장소 찾기에서 검색한 검색어다. `(user_id, query)`가 유일해서 같은 검색어는 한 행만 있고, 다시 검색하면 `searched_at`만 갱신된다. SQL: `backend/supabase/migrations/0009_search_history_table.sql`.

모두 `Authorization: Bearer <access_token>` 필요.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/search-histories` | 내 최근 검색어 (최근 검색순, 최대 10개) |
| POST | `/api/search-histories` | 검색어 기록. `{ "query": "성수 카페" }` — 앞뒤 공백 제거 후 1~100자(`GET /api/map/search`의 `query`와 같은 범위). 갱신된 목록을 그대로 돌려준다 |
| DELETE | `/api/search-histories/{id}` | 검색어 하나 삭제. 204. 다른 유저의 것이거나 없는 id면 404 |
| DELETE | `/api/search-histories` | 내 검색어 전체 삭제. 204 |

응답 항목: `id`, `query`, `searched_at`.

- 유저당 최대 10개만 보관한다. 기록할 때 10개를 넘으면 같은 트랜잭션에서 가장 오래전에 검색한 것부터 지운다.
- 기록은 장소 검색 API가 아니라 프론트엔드가 한다: 검색이 성공하고 결과가 1곳 이상일 때만 `POST`를 호출한다. 결과가 없는 검색어(대개 오타)와 실패한 검색은 남기지 않는다.
- 최근 검색어 API가 실패해도 장소 검색은 그대로 동작한다 (프론트엔드가 오류를 무시한다).

## 테스트

DB를 쓰는 테스트(`backend/tests/conftest.py`의 `engine` 픽스처)는 인메모리 SQLite에 ORM 모델로 테이블을 만들어 돌린다. Postgres 전용 기능(제약 조건, RLS)은 테스트되지 않는다.
