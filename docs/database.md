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

## 내 프로필 API

모두 `Authorization: Bearer <access_token>` 필요. 코드: `backend/app/api/me.py`.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/me` | 내 프로필 (`id`, `email`, `name`, `handle`, `avatar_url`). 첫 요청에서 유저 행을 만든다 |
| PATCH | `/api/me` | 이름 · 핸들 수정. `{ "name": "김앨리스", "handle": "alice_k" }` — 보낸 필드만 바뀐다(생략하거나 null이면 유지). 다른 유저가 쓰는 핸들이면 409 |

- 이름: 앞뒤 공백 제거 후 1~50자.
- 핸들: 영문 · 숫자 · 밑줄(`_`) 3~30자. 대문자로 보내도 소문자로 저장한다. 가입 때 이메일에서 만든 핸들은 이 길이 규칙을 벗어날 수 있고, 새로 바꿀 때만 규칙을 적용한다(현재 핸들을 그대로 다시 보내는 것도 규칙을 벗어나면 422이므로, 프론트엔드는 바뀐 필드만 보낸다).
- 핸들 변경 이력은 남기지 않고, 예전 핸들은 바로 다른 유저가 쓸 수 있다. 유저는 id로 식별하므로 팔로우 · 컬렉션 · 프로필 URL은 영향을 받지 않는다.
- 프로필 사진은 수정할 수 없고 Google 프로필을 따라간다.

## 컬렉션 API

모두 `Authorization: Bearer <access_token>` 필요.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/collections` | 내 컬렉션 목록 (최신순). `?provider=kakao&place_id=1001`을 함께 주면 각 항목의 `contains_place`에 그 장소가 담겨 있는지가 들어간다 (둘 중 하나만 주면 422) |
| POST | `/api/collections` | 컬렉션 생성. `{ "name": "서울 카페", "is_public": false }` — 이름은 앞뒤 공백 제거 후 1~50자, 기본값 비공개 |
| GET | `/api/collections/{id}` | 컬렉션 하나 조회 (컬렉션 상세 화면용). 내 컬렉션이거나 다른 유저의 **공개** 컬렉션 |
| PATCH | `/api/collections/{id}` | 내 컬렉션의 이름 · 공개 여부 수정. `{ "name": "성수 카페", "is_public": true }` — 보낸 필드만 바뀐다(생략하거나 null이면 유지). 이름 규칙은 생성과 같다 |
| DELETE | `/api/collections/{id}` | 내 컬렉션 삭제. 성공 시 204(본문 없음). 담긴 장소도 함께 지워진다 |
| GET | `/api/collections/{id}/places` | 컬렉션에 담긴 장소 목록 (최근에 담은 순). 조회 범위는 위와 같다 |
| POST | `/api/collections/{id}/places` | 장소 담기. 본문은 장소 검색 결과(`GET /api/map/search`의 `places` 항목) 그대로. 새로 담으면 201, 이미 담긴 장소면 200이고 아무것도 바뀌지 않는다 |
| DELETE | `/api/collections/{id}/places/{provider}/{place_id}` | 장소 제외. 204. 담겨 있지 않은 장소여도 204 |

없는 id와 다른 유저의 비공개 컬렉션은 모두 404다. 다른 유저의 공개 컬렉션은 위 두 조회만 되고, 수정 · 삭제 · 장소 담기 · 제외는 404다(조회는 `_get_visible_collection`, 변경은 `_get_own_collection`으로 나뉜다). 팔로우 여부는 조회 권한과 무관하다.

컬렉션 응답 항목: `id`, `name`, `is_public`, `place_count`, `owner`(`id`, `name`, `handle`, `avatar_url`), `is_owner`(로그인한 유저가 소유자인지), `contains_place`(장소를 지정하지 않은 조회에서는 null), `created_at`.

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
| GET | `/api/users/{user_id}` | 유저 프로필. 아래 응답 항목에 `is_me`(본인 프로필인지), `public_collection_count`가 더해진다. 없는 유저면 404 |
| GET | `/api/users/{user_id}/collections` | 그 유저의 **공개** 컬렉션 목록 (최신순, 컬렉션 응답 항목과 같은 모양). 본인 id로 요청해도 공개 컬렉션만 나온다. 없는 유저면 404 |
| PUT | `/api/follows/{user_id}` | 팔로우. 이미 팔로우 중이어도 204. 본인이면 400, 없는 유저면 404 |
| DELETE | `/api/follows/{user_id}` | 언팔로우. 팔로우 중이 아니어도 204 |
| GET | `/api/follows/following` | 내가 팔로우한 유저 (최근 팔로우순) |
| GET | `/api/follows/followers` | 나를 팔로우한 유저 (최근 팔로우순) |

응답 항목: `id`, `name`, `handle`, `avatar_url`, `is_following`(내가 그 유저를 팔로우 중인지 — 팔로워 목록에서 맞팔 여부를 알 수 있다).

- 유저는 핸들이 아니라 id로 식별한다. 핸들은 화면 표시와 검색에만 쓴다.
- 프로필과 공개 컬렉션 목록은 팔로우하지 않은 유저 것도 볼 수 있다. 프로필에는 팔로워/팔로잉 수를 넣지 않는다.
- 팔로워/팔로잉 목록 API는 로그인한 유저 본인 것만 돌려준다. 다른 유저의 팔로워/팔로잉 목록을 조회하는 API는 의도적으로 두지 않았다 (`docs/features.md` 4번).
- 팔로우 자체는 `collection_history`에 기록하지 않는다. 피드는 `collection_history`를 `follow`와 조인(`actor_id = followee_id`, `follower_id = 나`, `is_public`)해서 만든다.
- 목록은 아직 페이지네이션이 없다.

## 최근 검색어

`public.search_history`(`id`, `user_id`, `query`, `searched_at`, `deleted_at`)는 유저가 장소 찾기에서 검색한 검색어다. `(user_id, query)`가 유일해서 같은 검색어는 한 행만 있고, 다시 검색하면 `searched_at`만 갱신된다. 인기 검색어도 이 테이블에서 집계한다. SQL: `backend/supabase/migrations/0009_search_history_table.sql`, `0010_search_history_soft_delete.sql`.

모두 `Authorization: Bearer <access_token>` 필요.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/search-histories` | 내 최근 검색어 (최근 검색순, 최대 10개) |
| POST | `/api/search-histories` | 검색어 기록. `{ "query": "성수 카페" }` — 앞뒤 공백 제거 후 1~100자(`GET /api/map/search`의 `query`와 같은 범위). 갱신된 목록을 그대로 돌려준다 |
| GET | `/api/search-histories/popular` | 인기 검색어 (아래 참고) |
| DELETE | `/api/search-histories/{id}` | 검색어 하나 삭제. 204. 다른 유저의 것이거나, 숨겨졌거나, 없는 id면 404 |
| DELETE | `/api/search-histories` | 내 검색어 전체 삭제(숨겨진 것 포함). 204 |

응답 항목: `id`, `query`, `searched_at`.

- 유저에게는 최대 10개만 보여 준다. 기록할 때 10개를 넘으면 같은 트랜잭션에서 가장 오래전에 검색한 것부터 **숨긴다**(`deleted_at` 설정, soft delete). 숨긴 검색어는 목록에 나오지 않지만 인기 검색어에는 계속 집계되고, 다시 검색하면 같은 행이 되살아난다(`deleted_at = null`).
- 유저가 직접 지운 검색어(개별 · 전체 삭제)는 실제로 지운다(hard delete). 인기 검색어에서도 빠진다.
- 숨긴 행 중 `searched_at`이 24시간보다 오래된 것은 더는 집계에 쓰이지 않으므로, 누가 검색어를 기록할 때마다 모든 유저의 것을 함께 지운다.
- 기록은 장소 검색 API가 아니라 프론트엔드가 한다: 검색이 성공하고 결과가 1곳 이상일 때만 `POST`를 호출한다. 결과가 없는 검색어(대개 오타)와 실패한 검색은 남기지 않는다.
- 최근 검색어 API가 실패해도 장소 검색은 그대로 동작한다 (프론트엔드가 오류를 무시한다).

### 인기 검색어

`GET /api/search-histories/popular` — 최근 24시간 동안 모든 유저가 검색한 검색어를, 검색한 사람이 많은 순으로 최대 10개 돌려준다. 결정 근거는 이슈 #65.

응답 항목: `query`, `searcher_count`.

- 대상은 `searched_at`이 최근 24시간 안인 모든 행이다. 숨긴 행도 센다. `searched_at`은 마지막으로 검색한 시각이므로, "24시간 안에 검색했다"와 "마지막 검색이 24시간 안이다"는 같은 뜻이다.
- `searcher_count`는 검색한 **사람 수**다. `(user_id, query)`당 한 행이므로 한 유저가 같은 검색어를 여러 번 검색해도 1명이다.
- 정렬: `searcher_count` 내림차순 → 가장 최근에 검색된 순 → 검색어. 결과가 없으면 빈 배열이다.
- 검색어는 기록할 때 앞뒤 공백만 제거한 그대로 묶는다. 부적절한 검색어는 판단할 기준이 없어 거르지 않는다.

## 피드

`GET /api/feed` — 내가 팔로우한 유저가 공개 컬렉션에 한 활동을 최신순으로 돌려준다. `Authorization: Bearer <access_token>` 필요. 코드: `backend/app/api/feed.py`.

| 쿼리 | 설명 |
|------|------|
| `limit` | 한 번에 받을 개수. 1~50, 기본 20 |
| `continuation` | 앞선 응답의 `continuation` 값. 주면 그 다음(더 오래된) 활동부터 돌려준다. 잘못된 값이면 400 |

응답은 `{ "items": [...], "continuation": "..." }`이다. `continuation`이 null이면 마지막 페이지다. 값은 마지막 항목의 `(created_at, id)`를 담은 불투명한 토큰이라, 그 사이에 새 활동이 생겨도 항목이 겹치거나 빠지지 않는다. 클라이언트는 내용을 해석하지 말고 그대로 돌려보낸다.

항목: `id`, `type`, `actor`(`id`, `name`, `handle`, `avatar_url`), `collection_id`(삭제된 컬렉션이면 null), `collection_name`(활동 시점의 이름), `place_name`(장소 활동일 때만), `created_at`.

| `type` | 히스토리 `action` |
|--------|-------------------|
| `place_added` / `place_removed` | 같은 이름 |
| `collection_added` | `collection_created`(공개로 생성), `collection_published` |
| `collection_renamed` | `collection_renamed` — `collection_name`은 바뀐 이름 |
| `collection_removed` | `collection_deleted` |

노출 규칙:

- 활동 시점에 공개였고(`collection_history.is_public`) **지금도 공개인** 컬렉션의 활동만 보인다. 컬렉션을 비공개로 바꾸면 공개 시절의 활동도 피드에서 사라지고, 다시 공개하면 돌아온다. 비공개인 동안 한 활동은 공개 후에도 보이지 않는다.
- 공개 컬렉션 삭제(`collection_removed`)만 예외로, 컬렉션이 없어도 스냅샷 기준으로 보인다. 그 컬렉션의 이전 활동은 함께 사라진다.
- 비공개 전환(`collection_unpublished`)은 알리지 않는다.
- 팔로우하기 전의 활동도 보이고, 언팔로우하면 그 유저의 활동은 모두 사라진다. 본인의 활동은 나오지 않는다.

## 인기 장소

`GET /api/places/popular` — 내가 팔로우한 유저들이 공개 컬렉션에 담은 장소를, 담은 사람이 많은 순으로 돌려준다. `Authorization: Bearer <access_token>` 필요. 코드: `backend/app/api/places.py`. 스키마 변경 없이 `follow` · `collection` · `collection_place`를 조인해 요청마다 집계한다.

| 쿼리 | 설명 |
|------|------|
| `limit` | 받을 개수. 1~50, 기본 20. 페이지는 없다 |

항목: 장소 검색 결과와 같은 필드(`id`, `provider`, `name`, `address`, `road_address`, `category`, `phone`, `url`, `lat`, `lng`) + `saver_count`, `savers`(`id`, `name`, `handle`, `avatar_url`), `saved_by_me`, `last_saved_at`.

집계 규칙 (결정 근거는 이슈 #41):

- 대상은 내가 팔로우한 유저다. 나를 팔로우만 한 유저는 들어가지 않고, 언팔로우하면 바로 빠진다.
- **지금 공개인** 컬렉션에 담긴 것만 센다(피드와 같은 기준). 비공개로 바꾸거나, 장소를 제외하거나, 컬렉션을 지우면 바로 빠진다.
- `saver_count`는 담은 **사람 수**다. 한 유저가 같은 장소를 여러 컬렉션에 담아도 1명이다. 장소는 `(provider, provider_place_id)`로 묶는다.
- 정렬: `saver_count` 내림차순 → 가장 최근에 담긴 순(`last_saved_at`) → `(provider, provider_place_id)`. 1명이 담은 장소도 나오고, 결과가 없으면 빈 배열이다(다른 데이터로 채우지 않는다).
- 내 저장은 세지 않는다(자기 자신은 팔로우할 수 없다). 대신 `saved_by_me`가 내 컬렉션(공개 · 비공개 무관)에 그 장소가 있는지 알려 준다.
- `savers`는 가장 최근에 담은 유저부터 최대 3명, 한 유저는 한 번만.

장소 정보(이름 · 주소 · 카테고리 등)는 사람마다 담을 때의 스냅샷이 달라서 하나를 골라야 한다(`representative_snapshot`).

- 서버가 스냅샷 값을 검증할 수 없으므로, **가장 많은 사람이 같은 값으로 담은 스냅샷**을 고른다. 일부가 바꾼 값은 다수에 묻힌다.
- 한 유저는 자신의 가장 최근 스냅샷으로 한 표만 낸다. 같은 장소를 여러 컬렉션에 담아 결과를 좌우할 수 없다.
- 필드마다 따로 고르지 않고 스냅샷 하나를 통째로 고른다. 이름과 주소가 서로 다른 저장에서 섞여 나오지 않는다.
- 표가 같으면 가장 최근 스냅샷이다.

## 테스트

DB를 쓰는 테스트(`backend/tests/conftest.py`의 `engine` 픽스처)는 인메모리 SQLite에 ORM 모델로 테이블을 만들어 돌린다. Postgres 전용 기능(제약 조건, RLS)은 테스트되지 않는다.
