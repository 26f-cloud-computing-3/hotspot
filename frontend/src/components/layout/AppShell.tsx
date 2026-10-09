import { type ReactNode, useEffect, useRef, useState } from "react";
import { MobileDrawer } from "./MobileDrawer";
import { Navigation, type NavigationProps } from "./Navigation";
import type { Page } from "./navigationItems";
import { TopBar } from "./TopBar";
import "./AppShell.css";

interface AppShellProps extends NavigationProps {
  children: ReactNode;
}

export function AppShell({
  children,
  page,
  onNavigate,
  signingOut,
  onSignOut,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [desktop, setDesktop] = useState(
    () => window.matchMedia("(min-width: 768px)").matches,
  );
  const drawer = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      setDesktop(media.matches);
      if (media.matches) drawer.current?.close();
    };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  function toggleNavigation() {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setCollapsed((value) => !value);
    } else {
      drawer.current?.showModal();
      setDrawerOpen(true);
    }
  }
  function navigate(next: Page) {
    onNavigate(next);
    drawer.current?.close();
  }
  function signOut() {
    drawer.current?.close();
    onSignOut();
  }
  const navigationProps = {
    page,
    onNavigate: navigate,
    signingOut,
    onSignOut: signOut,
  };
  return (
    <div className="app-shell" data-collapsed={collapsed}>
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <TopBar
        navigationExpanded={desktop ? !collapsed : drawerOpen}
        onToggleNavigation={toggleNavigation}
        onHome={() => navigate("places")}
      />
      <aside
        id="desktop-navigation"
        className="sidebar"
        aria-label="사이드바"
        hidden={collapsed}
      >
        <Navigation {...navigationProps} />
      </aside>
      <MobileDrawer dialogRef={drawer} onClose={() => setDrawerOpen(false)}>
        <Navigation {...navigationProps} />
      </MobileDrawer>
      <main id="main-content" className="main-content">
        {children}
      </main>
    </div>
  );
}
