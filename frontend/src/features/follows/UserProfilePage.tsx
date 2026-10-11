import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Link, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { isNotFound } from "../../lib/api";
import { loadFailed, queryKeys, retryLoad } from "../../lib/query";
import { useAuth } from "../auth/AuthProvider";
import { getUserProfile, listUserCollections, type UserProfile } from "./api";
import { ProfileDialog } from "./ProfileDialog";
import { UserAvatar } from "./UserAvatar";
import { useToggleFollow } from "./useToggleFollow";
import "../collections/CollectionsPage.css";
import "../collections/CollectionDetailPage.css";
import "./FollowersPage.css";

/** A user and the collections they have made public; the same view for every visitor. */
export function UserProfilePage() {
  const { userId = "" } = useParams();
  const { me, setMe } = useAuth();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: queryKeys.users.profile(userId),
    queryFn: () => getUserProfile(userId),
  });
  const collectionsQuery = useQuery({
    queryKey: queryKeys.users.collections(userId),
    queryFn: () => listUserCollections(userId),
  });
  const profile = profileQuery.data;
  const collections = collectionsQuery.data;
  const missing =
    isNotFound(profileQuery.error) || isNotFound(collectionsQuery.error);
  const { toggleFollow, pending, error } = useToggleFollow();
  const editDialog = useRef<HTMLDialogElement>(null);

  // My own profile is opened from the sidebar, so there is no list to go back to.
  const backLink =
    me?.id === userId ? null : (
      <Link className="back-link" to="/followers">
        <Icon name="back" />
        팔로워
      </Link>
    );

  if (missing || loadFailed(profileQuery, collectionsQuery)) {
    return (
      <>
        {backLink}
        <section className="empty-panel" role="alert">
          {missing ? (
            <p>찾을 수 없는 유저입니다.</p>
          ) : (
            <>
              <p>프로필을 불러오지 못했습니다.</p>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => retryLoad(profileQuery, collectionsQuery)}
              >
                다시 시도
              </button>
            </>
          )}
        </section>
      </>
    );
  }
  if (profile === undefined || collections === undefined) {
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
        </span>
        {profile.is_me ? (
          <span className="profile-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => editDialog.current?.showModal()}
            >
              프로필 수정
            </button>
            <Link className="button button-secondary" to="/collections">
              내 컬렉션 관리
            </Link>
          </span>
        ) : (
          <button
            type="button"
            className={`button ${profile.is_following ? "button-secondary" : "button-primary"}`}
            aria-pressed={profile.is_following}
            aria-label={`${profile.name} ${profile.is_following ? "팔로우 취소" : "팔로우"}`}
            disabled={pending.has(profile.id)}
            onClick={() => toggleFollow(profile)}
          >
            {profile.is_following ? "팔로잉" : "팔로우"}
          </button>
        )}
      </header>
      {error?.userId === profile.id && (
        <p className="follow-status follow-error" role="alert">
          {error.message}
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
      {profile.is_me && me && (
        <ProfileDialog
          // Remounts with the saved values as the fields' starting point.
          key={`${me.name}\n${me.handle}`}
          dialogRef={editDialog}
          me={me}
          onSaved={(saved) => {
            setMe(saved);
            queryClient.setQueryData<UserProfile>(
              queryKeys.users.profile(profile.id),
              { ...profile, name: saved.name, handle: saved.handle },
            );
          }}
        />
      )}
    </section>
  );
}
