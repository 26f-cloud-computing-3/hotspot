import { Icon } from "../Icon";
import { NAVIGATION_ITEMS, type Page } from "./navigationItems";

export interface NavigationProps {
  page: Page;
  onNavigate: (page: Page) => void;
  signingOut: boolean;
  onSignOut: () => void;
}

export function Navigation({
  page,
  onNavigate,
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
