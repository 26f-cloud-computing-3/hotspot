import { apiDelete, apiGet, apiPatch, apiPut } from "../../lib/api";
import type { Me } from "../auth/AuthProvider";
import type { Collection } from "../collections/api";

export const USER_QUERY_MAX_LENGTH = 50;
export const USER_NAME_MAX_LENGTH = 50;
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;

export interface FollowUser {
  id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
  /** Whether the signed-in user follows this user. */
  is_following: boolean;
}

export interface UserProfile extends FollowUser {
  /** Whether this is the signed-in user's own profile. */
  is_me: boolean;
  public_collection_count: number;
}

export const getUserProfile = (userId: string): Promise<UserProfile> => {
  return apiGet<UserProfile>(`/api/users/${userId}`);
};

/** A user's public collections, newest first. */
export const listUserCollections = (userId: string): Promise<Collection[]> => {
  return apiGet<Collection[]>(`/api/users/${userId}/collections`);
};

export const searchUsers = (query: string): Promise<FollowUser[]> => {
  return apiGet<FollowUser[]>(`/api/users?q=${encodeURIComponent(query)}`);
};

export const listFollowing = (): Promise<FollowUser[]> => {
  return apiGet<FollowUser[]>("/api/follows/following");
};

export const listFollowers = (): Promise<FollowUser[]> => {
  return apiGet<FollowUser[]>("/api/follows/followers");
};

export const follow = (userId: string): Promise<void> => {
  return apiPut<void>(`/api/follows/${userId}`);
};

export const unfollow = (userId: string): Promise<void> => {
  return apiDelete<void>(`/api/follows/${userId}`);
};

/** Changes my name and/or handle; fields left out stay as they are. Rejects with 409 when the handle is taken. */
export const updateMe = (fields: {
  name?: string;
  handle?: string;
}): Promise<Me> => {
  return apiPatch<Me>("/api/me", fields);
};
