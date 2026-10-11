import type { Me } from "../../features/auth/AuthProvider";
import { UserAvatar } from "../../features/follows/UserAvatar";
import { Icon } from "../Icon";
import {
  type ActivePage,
  NAVIGATION_ITEMS,
  type Page,
} from "./navigationItems";

export interface NavigationProps {
  page: ActivePage;
  onNavigate: (page: Page) => void;
  me: Me | null;
  onOpenProfile: () => void;
  signingOut: boolean;
  onSignOut: () => void;
}

export function Navigation({
  page,
  onNavigate,
  me,
  onOpenProfile,
  signingOut,
  onSignOut,
}: NavigationProps) {
  return (
    <>
      <nav className="navigation" aria-label="주 내비게이션">
        {NAVIGATION_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="nav-item"
            aria-current={page === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        {me && (
          <button
            type="button"
            className="nav-item nav-profile"
            aria-label={`내 프로필 (${me.name})`}
            aria-current={page === "me" ? "page" : undefined}
            onClick={onOpenProfile}
          >
            <UserAvatar user={me} />
            <span className="user-identity">
              <strong>{me.name}</strong>
              <small>@{me.handle}</small>
            </span>
          </button>
        )}
        <button
          type="button"
          className="nav-item logout"
          disabled={signingOut}
          onClick={onSignOut}
        >
          <Icon name="logout" />
          <span>{signingOut ? "로그아웃 중…" : "로그아웃"}</span>
        </button>
      </div>
    </>
  );
}
