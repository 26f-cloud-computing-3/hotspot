import { apiGet } from "../../lib/api";
import type { Place } from "../map/types";

export interface PlaceSaver {
  id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
}

export interface PopularPlace extends Place {
  /** Users I follow who keep it in a public collection; one user counts once. */
  saver_count: number;
  /** The most recent savers first, at most three. */
  savers: PlaceSaver[];
  /** Whether it is in any of my own collections, public or not. */
  saved_by_me: boolean;
  last_saved_at: string;
}

/** Places the users I follow saved in public collections, saved by the most first. */
export const listPopularPlaces = (): Promise<PopularPlace[]> =>
  apiGet<PopularPlace[]>("/api/places/popular");
