import { useQuery } from "@tanstack/react-query";
import {
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useId,
  useState,
} from "react";

import { Icon } from "../../components/Icon";
import { queryKeys } from "../../lib/query";
import { listPopularSearches } from "./searchHistoryApi";

// How long each rank stays in view before the next one rolls in.
const ROLL_INTERVAL_MS = 3000;
// The ranking moves slowly; leaving the screen and coming back need not ask again.
const STALE_TIME_MS = 5 * 60 * 1000;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

const usePrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(
    () => window.matchMedia(REDUCED_MOTION).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(REDUCED_MOTION);
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
};

interface PopularSearchesProps {
  onSearch: (query: string) => void;
}

/**
 * The queries the most users searched in the last day, rolling from first to tenth.
 * Opening it lists them all. Like recent searches it is a convenience: while it loads,
 * when it fails, or when nobody searched, it is not shown.
 */
export const PopularSearches = ({ onSearch }: PopularSearchesProps) => {
  const { data: searches = [] } = useQuery({
    queryKey: queryKeys.popularSearches,
    queryFn: listPopularSearches,
    staleTime: STALE_TIME_MS,
  });
  const [rolled, setRolled] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const listId = useId();

  // Rolling would move a query out from under the pointer or the keyboard.
  const isRolling =
    searches.length > 1 && !isOpen && !isHovered && !hasFocus && !reducedMotion;

  useEffect(() => {
    if (!isRolling) return;
    const timer = window.setInterval(
      () => setRolled((count) => count + 1),
      ROLL_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [isRolling]);

  if (searches.length === 0) return null;

  // The ranking can shrink when it is fetched again; wrap instead of running past it.
  const index = rolled % searches.length;
  const current = searches[index];

  const pick = (event: MouseEvent<HTMLButtonElement>, query: string) => {
    // Let go of the pressed button so that rolling resumes while the results show.
    event.currentTarget.blur();
    setIsOpen(false);
    onSearch(query);
  };

  // A touch fires pointerenter but may never fire pointerleave; only a mouse hovers.
  const hover = (event: PointerEvent<HTMLElement>, hovered: boolean) => {
    if (event.pointerType === "mouse") setIsHovered(hovered);
  };

  const leaveFocus = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false);
  };

  return (
    <section
      className="popular-searches"
      aria-label="인기 검색어"
      onPointerEnter={(event) => hover(event, true)}
      onPointerLeave={(event) => hover(event, false)}
      onFocus={() => setHasFocus(true)}
      onBlur={leaveFocus}
    >
      <div className="popular-searches-bar">
        <h2>인기 검색어</h2>
        {isOpen ? (
          <span className="popular-searches-window">최근 24시간</span>
        ) : (
          <button
            // A new key restarts the roll-in animation for each rank.
            key={`${index}-${current.query}`}
            type="button"
            className="popular-searches-current"
            onClick={(event) => pick(event, current.query)}
          >
            <span className="popular-searches-rank">{index + 1}</span>
            <span className="popular-searches-query">{current.query}</span>
          </button>
        )}
        <button
          type="button"
          className="popular-searches-toggle"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-label={isOpen ? "인기 검색어 접기" : "인기 검색어 전체 보기"}
          onClick={() => setIsOpen((open) => !open)}
        >
          <Icon name="chevron" />
        </button>
      </div>

      {isOpen && (
        <ol id={listId} className="popular-searches-list">
          {searches.map((search, rank) => (
            <li key={search.query}>
              <button
                type="button"
                onClick={(event) => pick(event, search.query)}
              >
                <span className="popular-searches-rank">{rank + 1}</span>
                <span className="popular-searches-query">{search.query}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
