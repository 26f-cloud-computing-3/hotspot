import { useEffect, useState } from "react";
import {
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
} from "react-router";
import { AppShell } from "../components/layout/AppShell";
import {
  NAVIGATION_ITEMS,
  type Page,
} from "../components/layout/navigationItems";
import { useAuth } from "../features/auth/AuthProvider";
import "./HomePage.css";

// Screens reached from a tab without living under its path.
const PAGE_BY_SEGMENT: Record<string, Page> = { users: "followers" };

interface PageOverride {
  pathname: string;
  page: Page;
}

/**
 * Lets a routed screen say which tab it belongs to when its path alone can't tell
 * (someone else's collection is opened from the followers tab). Pass null to keep
 * the tab the path implies.
 */
export function useActivePage(page: Page | null) {
  const setOverride = useOutletContext<(override: PageOverride) => void>();
  const { pathname } = useLocation();
  useEffect(() => {
    if (page) setOverride({ pathname, page });
  }, [page, pathname, setOverride]);
}

export function HomePage() {
  const { signOut, me } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState("");
  const navigateTo = useNavigate();
  const { pathname } = useLocation();
  // Tied to the path it was set for, so it lapses on its own when the screen changes.
  const [override, setOverride] = useState<PageOverride | null>(null);
  // The first path segment is the active tab, so a reload keeps it.
  const segment = pathname.split("/")[1];
  const pageId =
    override?.pathname === pathname
      ? override.page
      : (PAGE_BY_SEGMENT[segment] ?? segment);
  const activePage =
    NAVIGATION_ITEMS.find((item) => item.id === pageId) ?? NAVIGATION_ITEMS[0];
  // My own profile is opened from the sidebar footer, not from the followers tab.
  const onMyProfile = me !== null && pathname === `/users/${me.id}`;
  const page = onMyProfile ? "me" : activePage.id;
  const title = onMyProfile ? "내 프로필" : activePage.label;

  function navigate(next: Page) {
    navigateTo(`/${next}`);
    setNotice("");
  }
  async function handleSignOut() {
    setSigningOut(true);
    setNotice("");
    try {
      await signOut();
    } catch {
      setNotice("로그아웃하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <AppShell
      page={page}
      onNavigate={navigate}
      me={me}
      onOpenProfile={() => {
        if (me) navigateTo(`/users/${me.id}`);
        setNotice("");
      }}
      signingOut={signingOut}
      onSignOut={handleSignOut}
    >
      <div className="page-heading">
        <h1>{title}</h1>
        <p>
          {page === "me"
            ? "다른 사람에게 보이는 내 모습이에요."
            : page === "places"
              ? "나만의 핫스팟을 찾아보세요."
              : page === "collections"
                ? "좋아하는 장소를 테마별로 모아 보세요."
                : page === "followers"
                  ? "친구를 찾아 팔로우해 보세요."
                  : "좋아하는 장소로 이어지는 공간"}
        </p>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <Outlet context={setOverride} />
    </AppShell>
  );
}
