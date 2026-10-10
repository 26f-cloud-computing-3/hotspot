import { Icon } from "../components/Icon";
import {
  NAVIGATION_ITEMS,
  type Page,
} from "../components/layout/navigationItems";

export function ComingSoon({ page }: { page: Page }) {
  const item =
    NAVIGATION_ITEMS.find((item) => item.id === page) ?? NAVIGATION_ITEMS[0];
  return (
    <section className="empty-panel">
      <Icon name={item.icon} />
      <h2>{item.label}</h2>
      <p>곧 이곳에서 만나보실 수 있어요.</p>
    </section>
  );
}
