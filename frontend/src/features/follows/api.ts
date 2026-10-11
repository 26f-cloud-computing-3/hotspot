import { apiDelete, apiGet, apiPut } from "../../lib/api";
import type { Collection } from "../collections/api";

export const USER_QUERY_MAX_LENGTH = 50;

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

export function getUserProfile(userId: string): Promise<UserProfile> {
  return apiGet<UserProfile>(`/api/users/${userId}`);
}

/** A user's public collections, newest first. */
export function listUserCollections(userId: string): Promise<Collection[]> {
  return apiGet<Collection[]>(`/api/users/${userId}/collections`);
}

export function searchUsers(query: string): Promise<FollowUser[]> {
  return apiGet<FollowUser[]>(`/api/users?q=${encodeURIComponent(query)}`);
}

export function listFollowing(): Promise<FollowUser[]> {
  return apiGet<FollowUser[]>("/api/follows/following");
}

export function listFollowers(): Promise<FollowUser[]> {
  return apiGet<FollowUser[]>("/api/follows/followers");
}

export function follow(userId: string): Promise<void> {
  return apiPut<void>(`/api/follows/${userId}`);
}

export function unfollow(userId: string): Promise<void> {
  return apiDelete<void>(`/api/follows/${userId}`);
}
