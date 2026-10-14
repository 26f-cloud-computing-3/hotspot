import type { QueryClient } from "@tanstack/react-query";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api";
import { queryKeys } from "../../lib/query";
import type { Place } from "../map/types";

export const COLLECTION_NAME_MAX_LENGTH = 50;

export interface CollectionOwner {
  id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
}

export interface Collection {
  id: string;
  name: string;
  is_public: boolean;
  place_count: number;
  owner: CollectionOwner;
  /** Whether the signed-in user owns this collection; only the owner may change it. */
  is_owner: boolean;
  /** Whether the place asked about is in this collection; null when none was asked about. */
  contains_place: boolean | null;
  created_at: string;
}

export interface CollectionFields {
  name: string;
  is_public: boolean;
}

export const listMyCollections = (): Promise<Collection[]> => {
  return apiGet<Collection[]>("/api/collections");
};

/** My collections, each with `contains_place` telling whether it holds `place`. */
export const listMyCollectionsForPlace = (
  place: Place,
): Promise<Collection[]> => {
  const params = new URLSearchParams({
    provider: place.provider,
    place_id: place.id,
  });
  return apiGet<Collection[]>(`/api/collections?${params}`);
};

/** One of my collections, or anyone's public one. */
export const getCollection = (id: string): Promise<Collection> => {
  return apiGet<Collection>(`/api/collections/${id}`);
};

/** The places saved in a collection, most recently added first. */
export const listCollectionPlaces = async (
  collectionId: string,
): Promise<Place[]> => {
  const places = await apiGet<Omit<Place, "distance">[]>(
    `/api/collections/${collectionId}/places`,
  );
  // Saved places have no search center to be measured from.
  return places.map((place) => ({ ...place, distance: null }));
};

export const createCollection = (
  body: CollectionFields,
): Promise<Collection> => {
  return apiPost<Collection>("/api/collections", body);
};

export const updateCollection = (
  id: string,
  body: Partial<CollectionFields>,
): Promise<Collection> => {
  return apiPatch<Collection>(`/api/collections/${id}`, body);
};

export const deleteCollection = (id: string): Promise<void> => {
  return apiDelete<void>(`/api/collections/${id}`);
};

export const addPlaceToCollection = (
  collectionId: string,
  place: Place,
): Promise<unknown> => {
  return apiPost(`/api/collections/${collectionId}/places`, place);
};

export const removePlaceFromCollection = (
  collectionId: string,
  place: Place,
): Promise<void> => {
  return apiDelete<void>(
    `/api/collections/${collectionId}/places/${encodeURIComponent(place.provider)}/${encodeURIComponent(place.id)}`,
  );
};

/**
 * Marks every cached collection out of date after one of mine changed, and resolves
 * once the lists on screen are fresh. A profile shows its user's collections too, and
 * the popular places tell which of them I have saved.
 */
export const invalidateCollections = async (
  queryClient: QueryClient,
): Promise<void> => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.collections.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.popularPlaces }),
  ]);
};
