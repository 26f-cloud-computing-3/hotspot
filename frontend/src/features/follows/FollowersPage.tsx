import { useEffect, useState } from "react";
import { Avatar } from "../../components/Avatar";
import { Icon } from "../../components/Icon";
import {
  type FollowUser,
  follow,
  listFollowers,
  listFollowing,
  searchUsers,
  USER_QUERY_MAX_LENGTH,
  unfollow,
} from "./api";
import "./FollowersPage.css";

const SEARCH_DELAY_MS = 300;

type Tab = "followers" | "following";

function withFollowing(users: FollowUser[], id: string, value: boolean) {
  return users.map((user) =>
    user.id === id ? { ...user, is_following: value } : user,
  );
}

export function FollowersPage() {
  const [followers, setFollowers] = useState<FollowUser[] | null>(null);
  const [following, setFollowing] = useState<FollowUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("followers");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FollowUser[] | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt re-runs the fetch on retry
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    Promise.all([listFollowers(), listFollowing()])
      .then(([nextFollowers, nextFollowing]) => {
        if (cancelled) return;
        setFollowers(nextFollowers);
        setFollowing(nextFollowing);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const term = query.trim();
  useEffect(() => {
    setResults(null);
    setSearchFailed(false);
    if (!term) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchUsers(term)
        .then((users) => {
          if (!cancelled) setResults(users);
        })
        .catch(() => {
          if (!cancelled) setSearchFailed(true);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  function applyFollowing(user: FollowUser, value: boolean) {
    setResults((users) => users && withFollowing(users, user.id, value));
    setFollowers((users) => users && withFollowing(users, user.id, value));
    // An unfollowed user stays in the list until the next load so it can be undone.
    setFollowing((users) => {
      if (!users) return users;
      return value && !users.some((item) => item.id === user.id)
        ? [{ ...user, is_following: true }, ...users]
        : withFollowing(users, user.id, value);
    });
  }
  async function toggleFollow(user: FollowUser) {
    const next = !user.is_following;
    const wasListed = following?.some((item) => item.id === user.id) ?? false;
    setError("");
    setPending((ids) => new Set(ids).add(user.id));
    applyFollowing(user, next);
    try {
      await (next ? follow(user.id) : unfollow(user.id));
    } catch {
      applyFollowing(user, !next);
      if (next && !wasListed) {
        setFollowing(
          (users) => users?.filter((item) => item.id !== user.id) ?? null,
        );
      }
      setError(
        next
          ? `${user.name} 님을 팔로우하지 못했습니다. 다시 시도해 주세요.`
          : `${user.name} 님 팔로우를 취소하지 못했습니다. 다시 시도해 주세요.`,
      );
    } finally {
      setPending((ids) => {
        const rest = new Set(ids);
        rest.delete(user.id);
        return rest;
      });
    }
  }

  function userList(users: FollowUser[]) {
    return (
      <ul className="user-list">
        {users.map((user) => (
          <li key={user.id} className="user-row">
            <Avatar name={user.name} url={user.avatar_url} />
            <span className="user-identity">
              <strong>{user.name}</strong>
              <small>@{user.handle}</small>
            </span>
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
  }

  let content = null;
  if (term) {
    if (searchFailed) {
      content = (
        <p className="follow-status" role="alert">
          유저를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      );
    } else if (results === null) {
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
  } else if (failed) {
    content = (
      <section className="empty-panel" role="alert">
        <p>팔로우 목록을 불러오지 못했습니다.</p>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          다시 시도
        </button>
      </section>
    );
  } else if (followers === null || following === null) {
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
          {error}
        </p>
      )}
      {content}
    </section>
  );
}
