import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import { loadFailed, queryKeys, retryLoad } from "../../lib/query";
import {
  type FollowUser,
  listFollowers,
  listFollowing,
  searchUsers,
  USER_QUERY_MAX_LENGTH,
} from "./api";
import { UserAvatar } from "./UserAvatar";
import { useToggleFollow } from "./useToggleFollow";
import "./FollowersPage.css";

const SEARCH_DELAY_MS = 300;

type Tab = "followers" | "following";

/** `value`, once it has stopped changing for `delayMs`. */
const useDebounced = <T,>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
};

export const FollowersPage = () => {
  const followersQuery = useQuery({
    queryKey: queryKeys.follows.followers,
    queryFn: listFollowers,
  });
  const followingQuery = useQuery({
    queryKey: queryKeys.follows.following,
    queryFn: listFollowing,
  });
  const followers = followersQuery.data;
  const following = followingQuery.data;
  const [tab, setTab] = useState<Tab>("followers");
  const [query, setQuery] = useState("");
  const { toggleFollow, pending, error } = useToggleFollow();

  const term = query.trim();
  const searchTerm = useDebounced(term, SEARCH_DELAY_MS);
  const searchQuery = useQuery({
    queryKey: queryKeys.users.search(searchTerm),
    queryFn: () => searchUsers(searchTerm),
    enabled: searchTerm !== "",
  });
  // Until the pause in typing has passed, what was found is for an older term.
  const searched = term === searchTerm;
  const results = searched ? searchQuery.data : undefined;
  const searchFailed = searched && loadFailed(searchQuery);

  const userList = (users: FollowUser[]) => {
    return (
      <ul className="user-list">
        {users.map((user) => (
          <li key={user.id} className="user-row">
            <Link className="user-link" to={`/users/${user.id}`}>
              <UserAvatar user={user} />
              <span className="user-identity">
                <strong>{user.name}</strong>
                <small>@{user.handle}</small>
              </span>
            </Link>
            <button
              type="button"
              className={`button ${user.is_following ? "button-secondary" : "button-primary"}`}
              aria-pressed={user.is_following}
              aria-label={`${user.name} ${user.is_following ? "팔로우 취소" : "팔로우"}`}
              disabled={pending.has(user.id)}
              onClick={() => toggleFollow(user)}
            >
              {user.is_following ? "팔로잉" : "팔로우"}
            </button>
          </li>
        ))}
      </ul>
    );
  };

  let content = null;
  if (term) {
    if (searchFailed) {
      content = (
        <p className="follow-status" role="alert">
          유저를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      );
    } else if (results === undefined) {
      content = (
        <p className="follow-status" role="status">
          검색 중…
        </p>
      );
    } else {
      content = (
        <>
          <p className="follow-status" role="status">
            <strong>‘{term}’</strong> 검색 결과 {results.length}명
          </p>
          {userList(results)}
        </>
      );
    }
  } else if (loadFailed(followersQuery, followingQuery)) {
    content = (
      <section className="empty-panel" role="alert">
        <p>팔로우 목록을 불러오지 못했습니다.</p>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => retryLoad(followersQuery, followingQuery)}
        >
          다시 시도
        </button>
      </section>
    );
  } else if (followers === undefined || following === undefined) {
    content = (
      <p className="follow-status" role="status">
        불러오는 중…
      </p>
    );
  } else {
    const users = tab === "followers" ? followers : following;
    const tabs = [
      { id: "followers", label: "팔로워", count: followers.length },
      {
        id: "following",
        label: "팔로잉",
        count: following.filter((user) => user.is_following).length,
      },
    ] as const;
    content = (
      <>
        <div className="follow-tabs">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label} {item.count}
            </button>
          ))}
        </div>
        {users.length > 0 ? (
          userList(users)
        ) : (
          <section className="empty-panel">
            <Icon name="people" />
            <h2>
              {tab === "followers"
                ? "아직 팔로워가 없어요"
                : "아직 팔로우한 사람이 없어요"}
            </h2>
            <p>
              {tab === "followers"
                ? "컬렉션을 공개하고 친구에게 핸들을 알려 주세요."
                : "위 검색창에서 이름이나 핸들로 친구를 찾아보세요."}
            </p>
          </section>
        )}
      </>
    );
  }

  return (
    <section aria-label="팔로워">
      <div className="user-search">
        <Icon name="search" />
        <label className="sr-only" htmlFor="user-query">
          이름 또는 핸들로 유저 검색
        </label>
        <input
          id="user-query"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="이름이나 핸들로 친구를 찾아보세요"
          maxLength={USER_QUERY_MAX_LENGTH}
        />
      </div>
      {error && (
        <p className="follow-status follow-error" role="alert">
          {error.message}
        </p>
      )}
      {content}
    </section>
  );
};
