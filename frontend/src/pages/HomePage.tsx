import { useState } from "react";
import { Icon } from "../components/Icon";
import { AppShell } from "../components/layout/AppShell";
import {
  NAVIGATION_ITEMS,
  type Page,
} from "../components/layout/navigationItems";
import { useAuth } from "../features/auth/AuthProvider";
import { CollectionsPage } from "../features/collections/CollectionsPage";
import { PlaceSearch } from "../features/map/PlaceSearch";
import "./HomePage.css";

export function HomePage() {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [page, setPage] = useState<Page>("places");
  const [notice, setNotice] = useState("");
  const activePage =
    NAVIGATION_ITEMS.find((item) => item.id === page) ?? NAVIGATION_ITEMS[0];
  const title = activePage.label;

  function navigate(next: Page) {
    setPage(next);
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
      signingOut={signingOut}
      onSignOut={handleSignOut}
    >
      <div className="page-heading">
        <h1>{title}</h1>
        <p>
          {page === "places"
            ? "나만의 핫스팟을 찾아보세요."
            : page === "collections"
              ? "좋아하는 장소를 테마별로 모아 보세요."
              : "좋아하는 장소로 이어지는 공간"}
        </p>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {page === "places" ? (
        <PlaceSearch />
      ) : page === "collections" ? (
        <CollectionsPage />
      ) : (
        <section className="empty-panel">
          <Icon name={activePage.icon} />
          <h2>{title}</h2>
          <p>곧 이곳에서 만나보실 수 있어요.</p>
        </section>
      )}
    </AppShell>
  );
}
