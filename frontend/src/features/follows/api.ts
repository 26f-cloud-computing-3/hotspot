import { apiDelete, apiGet, apiPut } from "../../lib/api";

export const USER_QUERY_MAX_LENGTH = 50;

export interface FollowUser {
  id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
  /** Whether the signed-in user follows this user. */
  is_following: boolean;
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
