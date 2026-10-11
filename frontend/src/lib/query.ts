import { QueryClient, type UseQueryResult } from "@tanstack/react-query";

import { ApiError } from "./api";

/** A 4xx answer is final: asking again gets the same one. */
function isClientError(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => failureCount < 1 && !isClientError(error),
      // A screen refreshes when it is opened; coming back to the tab leaves it as it was.
      refetchOnWindowFocus: false,
    },
  },
});

/** Cache keys of the server data, grouped so that a prefix invalidates the whole group. */
export const queryKeys = {
  me: (userId: string | undefined) => ["me", userId] as const,
  mapConfig: ["map", "config"] as const,
  feed: ["feed"] as const,
  collections: {
    all: ["collections"] as const,
    mine: ["collections", "mine"] as const,
    mineForPlace: (place: { provider: string; id: string }) =>
      ["collections", "mine", place.provider, place.id] as const,
    detail: (id: string) => ["collections", "detail", id] as const,
    places: (id: string) => ["collections", "places", id] as const,
  },
  users: {
    all: ["users"] as const,
    profile: (id: string) => ["users", "profile", id] as const,
    collections: (id: string) => ["users", "collections", id] as const,
    searches: ["users", "search"] as const,
    search: (term: string) => ["users", "search", term] as const,
  },
  follows: {
    followers: ["follows", "followers"] as const,
    following: ["follows", "following"] as const,
  },
};

type LoadState = Pick<UseQueryResult, "data" | "isError" | "isFetching">;

/**
 * Whether the first load of `queries` has given up. A refetch that fails later is not
 * a failed load: the data from before is still there to show.
 */
export function loadFailed(...queries: LoadState[]): boolean {
  const waiting = queries.filter((query) => query.data === undefined);
  return (
    waiting.some((query) => query.isError) &&
    !waiting.some((query) => query.isFetching)
  );
}

/** Asks again for what `loadFailed` reported. */
export function retryLoad(
  ...queries: Pick<UseQueryResult, "data" | "refetch">[]
): void {
  for (const query of queries) {
    if (query.data === undefined) void query.refetch();
  }
}
