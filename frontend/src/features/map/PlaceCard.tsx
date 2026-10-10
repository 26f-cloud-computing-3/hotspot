import { Icon } from "../../components/Icon";
import type { Place } from "./types";

interface PlaceCardProps {
  place: Place;
  onClose?: () => void;
  onSave?: () => void;
}

// Kakao categories arrive as "음식점 > 카페 > 커피전문점"; the last segment is the most specific.
function shortCategory(category: string | null) {
  return category?.split(">").at(-1)?.trim() || null;
}

// Naver has no lookup by another provider's place id, so link to a name search instead.
function naverMapUrl(name: string) {
  return `https://map.naver.com/p/search/${encodeURIComponent(name)}`;
}

export function PlaceCard({ place, onClose, onSave }: PlaceCardProps) {
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
      <nav className="place-card-links" aria-label="지도에서 자세히 보기">
        {place.url && (
          <a href={place.url} target="_blank" rel="noreferrer">
            카카오맵에서 보기
          </a>
        )}
        <a href={naverMapUrl(place.name)} target="_blank" rel="noreferrer">
          네이버 지도에서 보기
        </a>
      </nav>
      {onSave && (
        <button type="button" className="place-card-save" onClick={onSave}>
          <Icon name="plus" />
          컬렉션에 담기
        </button>
      )}
    </article>
  );
}
