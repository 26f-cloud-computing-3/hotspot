import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { ApiError } from "../../lib/api";
import { useAuth } from "../auth/AuthProvider";
import type { Collection } from "../collections/api";
import {
  follow,
  getUserProfile,
  listUserCollections,
  type UserProfile,
  unfollow,
} from "./api";
import { UserAvatar } from "./UserAvatar";
import "../collections/CollectionsPage.css";
import "../collections/CollectionDetailPage.css";
import "./FollowersPage.css";

type LoadError = "missing" | "failed";

/** A user and the collections they have made public; the same view for every visitor. */
export function UserProfilePage() {
  const { userId = "" } = useParams();
  const { me } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt re-runs the fetch on retry
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setProfile(null);
    setCollections(null);
    setError("");
    Promise.all([getUserProfile(userId), listUserCollections(userId)])
      .then(([loadedProfile, loadedCollections]) => {
        if (cancelled) return;
        setProfile(loadedProfile);
        setCollections(loadedCollections);
      })
      .catch((cause) => {
        if (cancelled) return;
        // 422 is an id that is not a UUID, which no user can have.
        const missing =
          cause instanceof ApiError &&
          (cause.status === 404 || cause.status === 422);
        setLoadError(missing ? "missing" : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  async function toggleFollow(user: UserProfile) {
    const next = !user.is_following;
    setError("");
    setPending(true);
    setProfile({ ...user, is_following: next });
    try {
      await (next ? follow(user.id) : unfollow(user.id));
    } catch {
      setProfile(user);
      setError(
        next
          ? `${user.name} 님을 팔로우하지 못했습니다. 다시 시도해 주세요.`
          : `${user.name} 님 팔로우를 취소하지 못했습니다. 다시 시도해 주세요.`,
      );
    } finally {
      setPending(false);
    }
  }

  // My own profile is opened from the sidebar, so there is no list to go back to.
  const backLink =
    me?.id === userId ? null : (
      <Link className="back-link" to="/followers">
        <Icon name="back" />
        팔로워
      </Link>
    );

  if (loadError) {
    return (
      <>
        {backLink}
        <section className="empty-panel" role="alert">
          {loadError === "missing" ? (
            <p>찾을 수 없는 유저입니다.</p>
          ) : (
            <>
              <p>프로필을 불러오지 못했습니다.</p>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setAttempt((value) => value + 1)}
              >
                다시 시도
              </button>
            </>
          )}
        </section>
      </>
    );
  }
  if (profile === null || collections === null) {
    return (
      <>
        {backLink}
        <p className="follow-status" role="status">
          불러오는 중…
        </p>
      </>
    );
  }

  return (
    <section aria-label={`${profile.name} 프로필`}>
      {backLink}
      <header className="user-row profile-header">
        <UserAvatar user={profile} />
        <span className="user-identity">
          <strong>{profile.name}</strong>
          <small>@{profile.handle}</small>
          {profile.is_me && me?.email && <small>{me.email}</small>}
        </span>
        {profile.is_me ? (
          <Link className="button button-secondary" to="/collections">
            내 컬렉션 관리
          </Link>
        ) : (
          <button
            type="button"
            className={`button ${profile.is_following ? "button-secondary" : "button-primary"}`}
            aria-pressed={profile.is_following}
            aria-label={`${profile.name} ${profile.is_following ? "팔로우 취소" : "팔로우"}`}
            disabled={pending}
            onClick={() => toggleFollow(profile)}
          >
            {profile.is_following ? "팔로잉" : "팔로우"}
          </button>
        )}
      </header>
      {error && (
        <p className="follow-status follow-error" role="alert">
          {error}
        </p>
      )}
      {collections.length === 0 ? (
        <section className="empty-panel">
          <Icon name="collection" />
          <h2>아직 공개한 컬렉션이 없어요</h2>
          {profile.is_me && (
            <p>컬렉션을 공개하면 다른 사람에게 이렇게 보여요.</p>
          )}
        </section>
      ) : (
        <>
          <div className="collections-toolbar">
            <p className="collections-status">
              공개 컬렉션 {collections.length}개
            </p>
          </div>
          <ul className="collection-grid">
            {collections.map((collection) => (
              <li key={collection.id} className="collection-card">
                <h2>
                  <Link
                    to={`/collections/${collection.id}`}
                    // Lets the detail screen point back here before it has loaded.
                    state={
                      collection.is_owner ? undefined : { ownerId: profile.id }
                    }
                  >
                    {collection.name}
                  </Link>
                </h2>
                <p>장소 {collection.place_count}개</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
