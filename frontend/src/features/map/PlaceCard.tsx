import { Icon } from "../../components/Icon";
import type { Place } from "./types";

interface PlaceCardProps {
  place: Place;
  onClose?: () => void;
}

// Kakao categories arrive as "음식점 > 카페 > 커피전문점"; the last segment is the most specific.
function shortCategory(category: string | null) {
  return category?.split(">").at(-1)?.trim() || null;
}

export function PlaceCard({ place, onClose }: PlaceCardProps) {
  const category = shortCategory(place.category);
  const address = place.road_address || place.address;

  return (
    <article className="place-card" aria-label={`${place.name} 정보`}>
      <header>
        <div>
          <strong>{place.name}</strong>
          {category && <span>{category}</span>}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="장소 정보 닫기">
            <Icon name="close" />
          </button>
        )}
      </header>
      {address && <p>{address}</p>}
      {place.phone && <p>{place.phone}</p>}
      {place.url && (
        <a href={place.url} target="_blank" rel="noreferrer">
          지도에서 자세히 보기
        </a>
      )}
    </article>
  );
}
