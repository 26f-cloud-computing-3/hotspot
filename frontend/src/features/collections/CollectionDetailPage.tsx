import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { MapView } from "../map/MapView";
import type { Place } from "../map/types";
import {
  type Collection,
  getCollection,
  listCollectionPlaces,
  removePlaceFromCollection,
} from "./api";
import "./CollectionsPage.css";
import "./CollectionDetailPage.css";

// Only where the map starts; it then fits itself to the collection's places.
const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 };

function placeKey(place: Place) {
  return `${place.provider}-${place.id}`;
}

export function CollectionDetailPage() {
  const { collectionId = "" } = useParams();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [removingKeys, setRemovingKeys] = useState<string[]>([]);
  const [error, setError] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt re-runs the fetch on retry
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    Promise.all([
      getCollection(collectionId),
      listCollectionPlaces(collectionId),
    ])
      .then(([loadedCollection, loadedPlaces]) => {
        if (cancelled) return;
        setCollection(loadedCollection);
        setPlaces(loadedPlaces);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId, attempt]);

  const selectPlace = useCallback((place: Place) => {
    setSelectedPlaceId(place.id);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPlaceId(null);
  }, []);

  async function remove(place: Place) {
    const key = placeKey(place);
    setRemovingKeys((keys) => [...keys, key]);
    setError("");
    try {
      await removePlaceFromCollection(collectionId, place);
      setPlaces((items) =>
        (items ?? []).filter((item) => placeKey(item) !== key),
      );
      setSelectedPlaceId((id) => (id === place.id ? null : id));
    } catch {
      setError(
        `‘${place.name}’을(를) 제외하지 못했습니다. 다시 시도해 주세요.`,
      );
    } finally {
      setRemovingKeys((keys) => keys.filter((item) => item !== key));
    }
  }

  const backLink = (
    <Link className="back-link" to="/collections">
      <Icon name="back" />
      컬렉션 목록
    </Link>
  );

  if (failed) {
    return (
      <>
        {backLink}
        <section className="empty-panel" role="alert">
          <p>컬렉션을 불러오지 못했습니다.</p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            다시 시도
          </button>
        </section>
      </>
    );
  }
  if (collection === null || places === null) {
    return (
      <>
        {backLink}
        <p className="collections-status" role="status">
          불러오는 중…
        </p>
      </>
    );
  }

  return (
    <section className="collection-detail" aria-label={collection.name}>
      {backLink}
      <header className="collection-detail-header">
        <h2>{collection.name}</h2>
        <span className="badge" data-public={collection.is_public}>
          {collection.is_public ? "공개" : "비공개"}
        </span>
        <p className="collections-status" role="status">
          장소 {places.length}개
        </p>
      </header>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {places.length === 0 ? (
        <section className="empty-panel">
          <Icon name="pin" />
          <h2>아직 담긴 장소가 없어요</h2>
          <p>장소 찾기에서 마음에 드는 장소를 담아 보세요.</p>
          <Link className="button button-primary" to="/places">
            <Icon name="search" />
            장소 찾으러 가기
          </Link>
        </section>
      ) : (
        <>
          <section className="map-panel" aria-label="컬렉션 장소 지도">
            <MapView
              center={SEOUL_CITY_HALL}
              places={places}
              selectedPlaceId={selectedPlaceId}
              onPlaceSelect={selectPlace}
              onPlaceClear={clearSelection}
            />
          </section>
          <ol className="saved-place-list">
            {places.map((place) => (
              <li
                key={placeKey(place)}
                className={
                  place.id === selectedPlaceId ? "is-selected" : undefined
                }
              >
                <button
                  type="button"
                  className="saved-place"
                  onClick={() => selectPlace(place)}
                  aria-pressed={place.id === selectedPlaceId}
                >
                  <span className="place-pin">
                    <Icon name="pin" />
                  </span>
                  <span>
                    <strong>{place.name}</strong>
                    <small>{place.road_address || place.address}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${place.name} 제외`}
                  disabled={removingKeys.includes(placeKey(place))}
                  onClick={() => remove(place)}
                >
                  <Icon name="close" />
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
