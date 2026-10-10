import { apiGet } from "../../lib/api";

export type FeedItemType =
  | "place_added"
  | "place_removed"
  | "collection_added"
  | "collection_renamed"
  | "collection_removed";

export interface FeedItem {
  id: string;
  type: FeedItemType;
  actor: {
    id: string;
    name: string;
    handle: string;
    avatar_url: string | null;
  };
  /** Null once the collection is deleted. */
  collection_id: string | null;
  /** The collection's name when the activity happened (the new name for a rename). */
  collection_name: string;
  /** Set only for activity about a place. */
  place_name: string | null;
  created_at: string;
}

export interface FeedPage {
  items: FeedItem[];
  /** Opaque token for the next (older) page; null on the last page. */
  continuation: string | null;
}

/** Activity of the users I follow, newest first. Pass a page's `continuation` to get the next. */
export function getFeed(continuation?: string): Promise<FeedPage> {
  const params = continuation
    ? `?${new URLSearchParams({ continuation })}`
    : "";
  return apiGet<FeedPage>(`/api/feed${params}`);
}
