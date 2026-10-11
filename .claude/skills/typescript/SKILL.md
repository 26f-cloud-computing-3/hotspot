---
name: typescript
description: 프론트엔드(`frontend/`) TypeScript 코딩 컨벤션. `.ts`/`.tsx` 파일을 새로 만들거나 수정·리뷰할 때 사용한다. const 지향, arrow function, any 지양, 반환 타입 규칙을 다룬다.
---

# TypeScript 컨벤션

`frontend/` 아래의 모든 `.ts`/`.tsx` 코드에 적용한다. 컴포넌트·훅에 대한 규칙은 `react` 스킬을 함께 따른다. 포맷과 import 정렬은 Biome(`pnpm check`)이 맡으므로 여기서 다루지 않는다.

## 1. `const` 지향

재할당이 실제로 필요한 경우가 아니면 `const`로 선언한다. `var`는 쓰지 않는다.

```ts
const trimmed = text.trim();

// 재할당이 필요한 경우에만 let
let cancelled = false;
```

값을 조건에 따라 고르려고 `let`을 쓰기 전에, 삼항 연산자나 헬퍼 함수로 `const` 하나에 담을 수 있는지 먼저 본다. 분기마다 JSX 블록을 고르는 것처럼 `let`이 더 읽기 쉬운 경우는 그대로 둔다.

## 2. 함수는 모두 arrow function

`function` 선언과 `function` 표현식을 쓰지 않는다. 컴포넌트, 훅, 유틸, 파일 내부 헬퍼, 컴포넌트 안의 핸들러 모두 해당한다.

```ts
// Good
export const relativeTime = (date: Date, now = new Date()): string => {
  // ...
};

const toggleFollow = async (user: FollowUser) => {
  // ...
};

// Bad
export function relativeTime(date: Date, now = new Date()): string {}
async function toggleFollow(user: FollowUser) {}
```

- `const`는 hoisting 되지 않는다. 모듈 최상위나 렌더 중에 바로 호출·참조되는 함수는 쓰는 곳보다 위에 선언한다.
- `.tsx` 파일의 제네릭 arrow function은 JSX와 구분되도록 `<T,>`로 쓴다 (`const useDebounced = <T,>(value: T): T => ...`). `.ts` 파일에서는 `<T>` 그대로 쓴다.
- 클래스 메서드(`ApiError`의 `constructor` 등)는 예외다.

## 3. `any` 지양, 명시적 타이핑

`any`를 쓰지 않는다. 타입을 모르는 값은 `unknown`으로 받고 좁혀서 쓴다. API 응답은 각 feature의 `api.ts`에 `interface`/`type`으로 정의한다.

```ts
// Good
export const isNotFound = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 404;

// Bad
export const isNotFound = (error: any) => error.status === 404;
```

예외는 **우리 시스템이 처리할 필요가 없는 데이터**뿐이다. 내용을 들여다보지 않고 외부로 그대로 넘기는 값, 공식 타입이 없는 서드파티 SDK 객체(`KakaoMap.tsx`의 `window.kakao`)가 여기에 해당한다. 이때는 줄마다 이유를 적은 `biome-ignore`를 붙인다.

```ts
// biome-ignore lint/suspicious/noExplicitAny: Kakao Maps SDK ships no official types
const mapRef = useRef<any>(null);
```

`as` 단언과 `!` non-null 단언도 타입 검사를 우회하므로 같은 기준으로 아낀다.

## 4. 반환 타입

- **API 함수**(`api.ts`, `*Api.ts`, `lib/api.ts`의 서버 호출 함수)는 `Promise<T>`를 명시한다. 응답 타입이 호출부의 계약이므로 추론에 맡기지 않는다.
- **컴포넌트**는 반환 타입을 적지 않는다 (`JSX.Element`, `ReactNode` 등을 붙이지 않는다).
- 그 외 함수는 추론으로 충분하면 생략해도 된다. export 되는 유틸·훅처럼 반환 타입이 계약인 경우에는 적는 편을 권한다.

```ts
// API 함수
export const getCollection = (id: string): Promise<Collection> =>
  apiGet<Collection>(`/api/collections/${id}`);

// 컴포넌트
export const UserAvatar = ({ user }: UserAvatarProps) => {
  // ...
};
```

## 확인

수정 후 `cd frontend && pnpm check && pnpm build`가 통과해야 한다. arrow function 규칙은 린터가 잡아 주지 않으므로 아래로 직접 확인한다.

```bash
grep -rnE "(^|[^.\w])function[ (<*]" frontend/src   # 결과가 없어야 한다
```
