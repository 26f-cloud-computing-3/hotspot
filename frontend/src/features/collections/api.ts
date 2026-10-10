import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api";
import type { Place } from "../map/types";

export const COLLECTION_NAME_MAX_LENGTH = 50;

export interface Collection {
  id: string;
  name: string;
  is_public: boolean;
  place_count: number;
  /** Whether the place asked about is in this collection; null when none was asked about. */
  contains_place: boolean | null;
  created_at: string;
}

export interface CollectionFields {
  name: string;
  is_public: boolean;
}

export function listMyCollections(): Promise<Collection[]> {
  return apiGet<Collection[]>("/api/collections");
}

/** My collections, each with `contains_place` telling whether it holds `place`. */
export function listMyCollectionsForPlace(place: Place): Promise<Collection[]> {
  const params = new URLSearchParams({
    provider: place.provider,
    place_id: place.id,
  });
  return apiGet<Collection[]>(`/api/collections?${params}`);
}

export function createCollection(body: CollectionFields): Promise<Collection> {
  return apiPost<Collection>("/api/collections", body);
}

export function updateCollection(
  id: string,
  body: Partial<CollectionFields>,
): Promise<Collection> {
  return apiPatch<Collection>(`/api/collections/${id}`, body);
}

export function deleteCollection(id: string): Promise<void> {
  return apiDelete<void>(`/api/collections/${id}`);
}

export function addPlaceToCollection(
  collectionId: string,
  place: Place,
): Promise<unknown> {
  return apiPost(`/api/collections/${collectionId}/places`, place);
}

export function removePlaceFromCollection(
  collectionId: string,
  place: Place,
): Promise<void> {
  return apiDelete<void>(
    `/api/collections/${collectionId}/places/${encodeURIComponent(place.provider)}/${encodeURIComponent(place.id)}`,
  );
}
