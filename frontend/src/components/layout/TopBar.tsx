import { Icon } from "../Icon";

interface TopBarProps {
  navigationExpanded: boolean;
  onToggleNavigation: () => void;
  onHome: () => void;
}

export function TopBar({
  navigationExpanded,
  onToggleNavigation,
  onHome,
}: TopBarProps) {
  return (
    <header className="topbar">
      <button
        className="icon-button"
        type="button"
        aria-label="내비게이션 열기/접기"
        aria-controls="desktop-navigation mobile-navigation"
        aria-expanded={navigationExpanded}
        onClick={onToggleNavigation}
      >
        <Icon name="menu" />
      </button>
      <button type="button" className="brand brand-button" onClick={onHome}>
        <Icon name="pin" />
        <span>Hotspot</span>
      </button>
      <span className="brand-caption">좋아하는 장소를 모으고, 나누세요.</span>
    </header>
  );
}
