import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import { loadFailed, queryKeys, retryLoad } from "../../lib/query";
import { SavePlaceDialog } from "../collections/SavePlaceDialog";
import { UserAvatar } from "../follows/UserAvatar";
import { MapView } from "../map/MapView";
import { shortCategory } from "../map/PlaceCard";
import type { Place } from "../map/types";
import { listPopularPlaces, type PopularPlace } from "./api";
import "./PopularPage.css";

// Only where the map starts; it then fits itself to the places.
const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 };

const placeKey = (place: Place) => {
  return `${place.provider}-${place.id}`;
};

const PlaceSavers = ({ place }: { place: PopularPlace }) => {
  return (
    <div className="popular-savers">
      <span className="popular-avatars">
        {place.savers.map((saver) => (
          <Link
            key={saver.id}
            to={`/users/${saver.id}`}
            aria-label={`${saver.name} 님의 프로필`}
            title={saver.name}
          >
            <UserAvatar user={saver} />
          </Link>
        ))}
      </span>
      <span>팔로잉 {place.saver_count}명이 담음</span>
      {place.saved_by_me && (
        <span className="popular-mine">내가 담은 장소</span>
      )}
    </div>
  );
};

/** Places the users I follow keep in their public collections, saved by the most first. */
export const PopularPage = () => {
  const popularQuery = useQuery({
    queryKey: queryKeys.popularPlaces,
    queryFn: listPopularPlaces,
  });
  const places = popularQuery.data;
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [savingPlace, setSavingPlace] = useState<Place | null>(null);

  const selectPlace = useCallback((place: Place) => {
    setSelectedPlaceId(place.id);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPlaceId(null);
  }, []);

  if (loadFailed(popularQuery)) {
    return (
      <section className="empty-panel" role="alert">
        <p>인기 장소를 불러오지 못했습니다.</p>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => retryLoad(popularQuery)}
        >
          다시 시도
        </button>
      </section>
    );
  }
  if (places === undefined) {
    return (
      <p className="popular-status" role="status">
        불러오는 중…
      </p>
    );
  }
  if (places.length === 0) {
    return (
      <section className="empty-panel">
        <Icon name="flame" />
        <h2>아직 인기 장소가 없어요</h2>
        <p>팔로우한 친구들이 공개 컬렉션에 장소를 담으면 여기에 보여요.</p>
        <Link className="button button-primary popular-link" to="/followers">
          친구 찾기
        </Link>
      </section>
    );
  }

  return (
    <section className="popular" aria-label="팔로잉 인기 장소">
      <p className="popular-status" role="status">
        팔로우한 친구들이 공개 컬렉션에 많이 담은 장소 {places.length}곳
      </p>
      <section className="map-panel" aria-label="인기 장소 지도">
        <MapView
          center={SEOUL_CITY_HALL}
          places={places}
          selectedPlaceId={selectedPlaceId}
          onPlaceSelect={selectPlace}
          onPlaceClear={clearSelection}
          onPlaceSave={setSavingPlace}
        />
      </section>
      <ol className="popular-list">
        {places.map((place, index) => {
          const category = shortCategory(place.category);
          const address = place.road_address || place.address;
          return (
            <li
              key={placeKey(place)}
              className={
                place.id === selectedPlaceId ? "is-selected" : undefined
              }
            >
              <button
                type="button"
                className="popular-place"
                onClick={() => selectPlace(place)}
                aria-pressed={place.id === selectedPlaceId}
              >
                <span className="popular-rank">
                  {index + 1}
                  <span className="sr-only">위</span>
                </span>
                <span className="popular-place-text">
                  <strong>{place.name}</strong>
                  <small>
                    {[category, address].filter(Boolean).join(" · ")}
                  </small>
                </span>
              </button>
              <PlaceSavers place={place} />
            </li>
          );
        })}
      </ol>

      {savingPlace && (
        <SavePlaceDialog
          key={placeKey(savingPlace)}
          place={savingPlace}
          onClose={() => setSavingPlace(null)}
        />
      )}
    </section>
  );
};
