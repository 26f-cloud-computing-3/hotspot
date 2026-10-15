import { apiDelete, apiGet, apiPost } from "../../lib/api";

export interface SearchHistory {
  id: string;
  query: string;
  searched_at: string;
}

/** The signed-in user's recent search queries, most recently searched first. */
export const listSearchHistories = (): Promise<SearchHistory[]> => {
  return apiGet<SearchHistory[]>("/api/search-histories");
};

/** Records a query and resolves to the updated list. */
export const recordSearchHistory = (
  query: string,
): Promise<SearchHistory[]> => {
  return apiPost<SearchHistory[]>("/api/search-histories", { query });
};

export const deleteSearchHistory = (id: string): Promise<void> => {
  return apiDelete<void>(`/api/search-histories/${id}`);
};

export const clearSearchHistories = (): Promise<void> => {
  return apiDelete<void>("/api/search-histories");
};

export interface PopularSearch {
  query: string;
  /** Users who searched it in the last day; one user counts once. */
  searcher_count: number;
}

/** The queries the most users searched in the last day, at most ten. */
export const listPopularSearches = (): Promise<PopularSearch[]> => {
  return apiGet<PopularSearch[]>("/api/search-histories/popular");
};
