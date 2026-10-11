import "./FollowersPage.css";

interface UserAvatarProps {
  user: { name: string; avatar_url: string | null };
}

/** Decorative: the user's name is always shown next to it. */
export function UserAvatar({ user }: UserAvatarProps) {
  return user.avatar_url ? (
    <img
      className="user-avatar"
      src={user.avatar_url}
      alt=""
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className="user-avatar" aria-hidden="true">
      {user.name.slice(0, 1)}
    </span>
  );
}
