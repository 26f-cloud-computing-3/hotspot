import { type FormEvent, useCallback, useState } from "react";

import { Icon } from "../../components/Icon";
import { apiGet } from "../../lib/api";
import { MapView } from "./MapView";
import type { Place, PlaceSearchResult } from "./types";

const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 };

export function PlaceSearch() {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  const selectPlace = useCallback((place: Place) => {
    setSelectedPlaceId(place.id);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPlaceId(null);
  }, []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery || isSearching) return;

    setIsSearching(true);
    setError("");
    setSelectedPlaceId(null);
    try {
      const result = await apiGet<PlaceSearchResult>(
        `/api/map/search?query=${encodeURIComponent(trimmedQuery)}&size=15`,
      );
      setPlaces(result.places);
      setSubmittedQuery(trimmedQuery);
    } catch {
      setPlaces([]);
      setSubmittedQuery(trimmedQuery);
      setError("장소를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <section className="place-search" aria-label="장소 찾기">
      <form className="place-search-form" onSubmit={search}>
        <Icon name="search" />
        <label className="sr-only" htmlFor="place-query">
          장소명 또는 지역 검색
        </label>
        <input
          id="place-query"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="장소명이나 지역을 검색해 보세요"
          maxLength={100}
        />
        <button type="submit" disabled={!query.trim() || isSearching}>
          {isSearching ? "검색 중" : "검색"}
        </button>
      </form>

      {error && (
        <p className="search-message search-error" role="alert">
          {error}
        </p>
      )}

      <section className="map-panel" aria-label="장소 지도">
        <MapView
          center={SEOUL_CITY_HALL}
          places={places}
          selectedPlaceId={selectedPlaceId}
          onPlaceSelect={selectPlace}
          onPlaceClear={clearSelection}
        />
      </section>

      {submittedQuery && !error && (
        <div className="search-results">
          <p className="result-summary" role="status">
            <strong>‘{submittedQuery}’</strong> 검색 결과 {places.length}곳
          </p>
          {places.length > 0 ? (
            <ol className="place-list">
              {places.map((place) => (
                <li key={`${place.provider}-${place.id}`}>
                  <button
                    type="button"
                    className={
                      place.id === selectedPlaceId ? "is-selected" : undefined
                    }
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
                </li>
              ))}
            </ol>
          ) : (
            <p className="search-message">검색 결과가 없습니다.</p>
          )}
        </div>
      )}
    </section>
  );
}
