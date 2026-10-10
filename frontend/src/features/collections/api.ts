import { apiGet, apiPatch, apiPost } from "../../lib/api";

export const COLLECTION_NAME_MAX_LENGTH = 50;

export interface Collection {
  id: string;
  name: string;
  is_public: boolean;
  place_count: number;
  created_at: string;
}

export interface CollectionFields {
  name: string;
  is_public: boolean;
}

export function listMyCollections(): Promise<Collection[]> {
  return apiGet<Collection[]>("/api/collections");
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
