import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { queryKeys } from "../../lib/query";
import { type FollowUser, follow, type UserProfile, unfollow } from "./api";

const withFollowing = (users: FollowUser[], id: string, value: boolean) => {
  return users.map((user) =>
    user.id === id ? { ...user, is_following: value } : user,
  );
};

interface FollowError {
  userId: string;
  message: string;
}

/**
 * Follows or unfollows a user, showing the change on every screen at once and taking
 * it back if the server refuses.
 */
export const useToggleFollow = () => {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<FollowError | null>(null);

  const applyFollowing = (user: FollowUser, value: boolean) => {
    queryClient.setQueriesData<FollowUser[]>(
      { queryKey: queryKeys.users.searches },
      (users) => users && withFollowing(users, user.id, value),
    );
    queryClient.setQueryData<FollowUser[]>(
      queryKeys.follows.followers,
      (users) => users && withFollowing(users, user.id, value),
    );
    // An unfollowed user stays in the list until the next load so it can be undone.
    queryClient.setQueryData<FollowUser[]>(
      queryKeys.follows.following,
      (users) => {
        if (!users) return users;
        if (!value || users.some((item) => item.id === user.id)) {
          return withFollowing(users, user.id, value);
        }
        const { id, name, handle, avatar_url } = user;
        return [{ id, name, handle, avatar_url, is_following: true }, ...users];
      },
    );
    queryClient.setQueryData<UserProfile>(
      queryKeys.users.profile(user.id),
      (profile) => profile && { ...profile, is_following: value },
    );
  };

  const toggleFollow = async (user: FollowUser) => {
    const next = !user.is_following;
    const wasListed =
      queryClient
        .getQueryData<FollowUser[]>(queryKeys.follows.following)
        ?.some((item) => item.id === user.id) ?? false;
    setError(null);
    setPending((ids) => new Set(ids).add(user.id));
    applyFollowing(user, next);
    try {
      await (next ? follow(user.id) : unfollow(user.id));
      // Whose activity the feed shows has just changed.
      void queryClient.invalidateQueries({ queryKey: queryKeys.feed });
    } catch {
      applyFollowing(user, !next);
      if (next && !wasListed) {
        queryClient.setQueryData<FollowUser[]>(
          queryKeys.follows.following,
          (users) => users?.filter((item) => item.id !== user.id),
        );
      }
      setError({
        userId: user.id,
        message: next
          ? `${user.name} 님을 팔로우하지 못했습니다. 다시 시도해 주세요.`
          : `${user.name} 님 팔로우를 취소하지 못했습니다. 다시 시도해 주세요.`,
      });
    } finally {
      setPending((ids) => {
        const rest = new Set(ids);
        rest.delete(user.id);
        return rest;
      });
    }
  };

  return { toggleFollow, pending, error };
};
