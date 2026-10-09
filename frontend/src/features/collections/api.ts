import { apiGet, apiPost } from "../../lib/api";

export const COLLECTION_NAME_MAX_LENGTH = 50;

export interface Collection {
  id: string;
  name: string;
  is_public: boolean;
  place_count: number;
  created_at: string;
}

export interface NewCollection {
  name: string;
  is_public: boolean;
}

export function listMyCollections(): Promise<Collection[]> {
  return apiGet<Collection[]>("/api/collections");
}

export function createCollection(body: NewCollection): Promise<Collection> {
  return apiPost<Collection>("/api/collections", body);
}
