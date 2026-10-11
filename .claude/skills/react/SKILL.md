---
name: react
description: 프론트엔드(`frontend/`) React 코딩 컨벤션. 컴포넌트·훅(`.tsx`, `use*.ts`)을 새로 만들거나 수정·리뷰할 때 사용한다. arrow function 컴포넌트, named export, 구조분해, React.FC 금지, TanStack Query 규칙을 다룬다.
---

# React 컨벤션

`frontend/src` 아래의 컴포넌트와 훅에 적용한다. 언어 수준의 규칙(`const`, `any`, 반환 타입)은 `typescript` 스킬을, 색·간격 등 스타일은 루트 `DESIGN.md`를 따른다.

## 1. 컴포넌트는 arrow function

컴포넌트와 커스텀 훅을 `const` + arrow function으로 작성한다. 반환 타입은 적지 않는다.

```tsx
// Good
export const PlaceCard = ({ place, onClose, onSave }: PlaceCardProps) => {
  return <article className="place-card">...</article>;
};

// Bad
export function PlaceCard(props: PlaceCardProps) {}
```

컴포넌트 안의 이벤트 핸들러와 헬퍼도 arrow function이다 (`const handleSubmit = async (event) => { ... }`).

## 2. named export만 사용

`export default`를 쓰지 않는다. 컴포넌트 이름과 import 이름이 항상 같아지고, 이름 변경이 검색·리팩터링으로 따라온다.

```tsx
// Good
export const App = () => { ... };
import { App } from "./App.tsx";

// Bad
export default App;
import App from "./App.tsx";
```

Biome의 `style/noDefaultExport`가 이를 검사한다. 도구가 default export를 요구하는 설정 파일(`vite.config.ts`)만 `biome.json`의 `overrides`로 예외 처리되어 있다.

## 3. 구조분해를 적극 사용

props는 매개변수 자리에서 구조분해하고, 기본값도 거기서 준다. 훅 반환값·객체도 필요한 필드만 꺼내 쓴다.

```tsx
// Good
export const KakaoMap = ({ center, level = 3, places }: MapViewProps) => {
  const { session, signOut } = useAuth();
  // ...
};

// Bad
export const KakaoMap = (props: MapViewProps) => {
  const level = props.level ?? 3;
  const auth = useAuth();
  // auth.session, props.center ...
};
```

- props 타입은 컴포넌트 위에 `interface XxxProps`로 선언한다. 필드가 한두 개뿐이면 인라인 타입(`({ name }: { name: IconName })`)도 괜찮다.
- 아직 props를 쓰지 않는 스텁 컴포넌트는 `_props`처럼 밑줄로 시작하는 이름으로 받는다.
- 쿼리 결과처럼 객체 자체를 헬퍼(`loadFailed(collectionsQuery)`)에 넘겨야 하는 경우에는 객체를 그대로 둔다.

## 4. `React.FC`를 쓰지 않는다

`React.FC` / `FC` / `FunctionComponent`로 컴포넌트를 타이핑하지 않는다. props 매개변수에 직접 타입을 붙인다. `children`이 필요하면 props에 `children: ReactNode`를 명시한다.

```tsx
// Good
export const AuthProvider = ({ children }: { children: ReactNode }) => { ... };

// Bad
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => { ... };
```

## 5. 서버 데이터는 TanStack Query

서버에서 읽어 오는 데이터는 `useEffect` + `useState`로 fetch 하지 않고 `useQuery` / `useInfiniteQuery`로 읽는다.

- fetch 함수는 각 feature의 `api.ts`에 두고(`Promise<T>` 반환 타입 명시) `queryFn`으로 넘긴다. 컴포넌트에서 `fetch`를 직접 부르지 않는다.
- 캐시 키는 직접 배열로 쓰지 않고 `frontend/src/lib/query.ts`의 `queryKeys`에 추가해 참조한다.
- "불러오지 못했습니다 · 다시 시도" 패널은 같은 파일의 `loadFailed` / `retryLoad`를 쓴다.
- 서버 데이터를 바꾼 뒤에는 관련 키를 `queryClient.invalidateQueries`로 무효화하거나 `setQueryData`로 갱신한다. 서버 데이터를 `useState`에 복사해 두지 않는다.

```tsx
export const CollectionsPage = () => {
  const collectionsQuery = useQuery({
    queryKey: queryKeys.collections.mine,
    queryFn: listMyCollections,
  });
  const collections = collectionsQuery.data;
  // ...
};
```

## 확인

수정 후 `cd frontend && pnpm check && pnpm build`가 통과해야 한다.
