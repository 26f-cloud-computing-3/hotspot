import "./Avatar.css";

/** A user's profile picture, or their initial when they have none. */
export function Avatar({ name, url }: { name: string; url: string | null }) {
  return url ? (
    <img className="avatar" src={url} alt="" referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar" aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}
