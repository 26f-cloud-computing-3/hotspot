import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { AppShell } from "../components/layout/AppShell";
import {
  NAVIGATION_ITEMS,
  type Page,
} from "../components/layout/navigationItems";
import { useAuth } from "../features/auth/AuthProvider";
import "./HomePage.css";

export function HomePage() {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState("");
  const navigateTo = useNavigate();
  // The first path segment is the active tab, so a reload keeps it.
  const segment = useLocation().pathname.split("/")[1];
  const activePage =
    NAVIGATION_ITEMS.find((item) => item.id === segment) ?? NAVIGATION_ITEMS[0];
  const page = activePage.id;
  const title = activePage.label;

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
      <Outlet />
    </AppShell>
  );
}
