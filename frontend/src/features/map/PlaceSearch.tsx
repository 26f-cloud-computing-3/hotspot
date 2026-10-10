import {
  type FocusEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Icon } from "../../components/Icon";
import { apiGet } from "../../lib/api";
import { SavePlaceDialog } from "../collections/SavePlaceDialog";
import { MapView } from "./MapView";
import {
  clearSearchHistories,
  deleteSearchHistory,
  listSearchHistories,
  recordSearchHistory,
  type SearchHistory,
} from "./searchHistoryApi";
import type { LatLng, Place, PlaceSearchResult } from "./types";

const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 };
// Bounds on how far around a tapped point to look, whatever the zoom level.
const MIN_NEARBY_RADIUS = 20;
const MAX_NEARBY_RADIUS = 1000;

/** Where the listed places came from: a text search, or a tap on the map. */
type ResultSource = { kind: "search"; query: string } | { kind: "nearby" };

export function PlaceSearch() {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [source, setSource] = useState<ResultSource | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Only the latest search or nearby lookup may update the results.
  const latestRequest = useRef(0);
  const [savingPlace, setSavingPlace] = useState<Place | null>(null);
  const [histories, setHistories] = useState<SearchHistory[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Recent searches are a convenience: when their API fails, searching still works
  // and the list is simply left as it was.
  useEffect(() => {
    listSearchHistories()
      .then(setHistories)
      .catch(() => {});
  }, []);

  const selectPlace = useCallback((place: Place) => {
    setSelectedPlaceId(place.id);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPlaceId(null);
  }, []);

  const findNearby = useCallback(async (point: LatLng, radius: number) => {
    const request = ++latestRequest.current;
    const meters = Math.round(
      Math.min(Math.max(radius, MIN_NEARBY_RADIUS), MAX_NEARBY_RADIUS),
    );
    setNotice("");
    try {
      const nearby = await apiGet<Place[]>(
        `/api/map/nearby?lat=${point.lat}&lng=${point.lng}&radius=${meters}`,
      );
      if (request !== latestRequest.current) return;
      if (nearby.length === 0) {
        setNotice(
          "이 위치 근처에서 장소를 찾지 못했습니다. 지도를 확대해 다시 눌러 보거나 검색해 보세요.",
        );
        return;
      }
      setError("");
      setPlaces(nearby);
      setSource({ kind: "nearby" });
      // The nearest place is most likely the one that was tapped.
      setSelectedPlaceId(nearby[0].id);
    } catch {
      if (request !== latestRequest.current) return;
      setNotice("주변 장소를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }, []);

  async function search(text: string) {
    const trimmedQuery = text.trim();
    if (!trimmedQuery || isSearching) return;

    const request = ++latestRequest.current;
    setIsHistoryOpen(false);
    setIsSearching(true);
    setError("");
    setNotice("");
    setSelectedPlaceId(null);
    try {
      const result = await apiGet<PlaceSearchResult>(
        `/api/map/search?query=${encodeURIComponent(trimmedQuery)}&size=15`,
      );
      if (request !== latestRequest.current) return;
      setPlaces(result.places);
      setSource({ kind: "search", query: trimmedQuery });
      // A query that found nothing is most likely a typo; keep it out of the list.
      if (result.places.length > 0) {
        recordSearchHistory(trimmedQuery)
          .then(setHistories)
          .catch(() => {});
      }
    } catch {
      if (request !== latestRequest.current) return;
      setPlaces([]);
      setSource({ kind: "search", query: trimmedQuery });
      setError("장소를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSearching(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    search(query);
  }

  function searchAgain(history: SearchHistory) {
    setQuery(history.query);
    search(history.query);
  }

  function removeHistory(history: SearchHistory) {
    // The pressed button is about to disappear; keep focus inside the search box.
    inputRef.current?.focus();
    deleteSearchHistory(history.id)
      .then(() =>
        setHistories((current) =>
          current.filter((item) => item.id !== history.id),
        ),
      )
      .catch(() => {});
  }

  function clearHistories() {
    inputRef.current?.focus();
    clearSearchHistories()
      .then(() => setHistories([]))
      .catch(() => {});
  }

  function closeHistoryOnLeave(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsHistoryOpen(false);
    }
  }

  const showsHistory = isHistoryOpen && !query.trim() && histories.length > 0;

  return (
    <section className="place-search" aria-label="장소 찾기">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: only groups the search box and its recent searches to close them together */}
      <div
        className="place-search-box"
        onBlur={closeHistoryOnLeave}
        onKeyDown={(event) => {
          if (event.key === "Escape") setIsHistoryOpen(false);
        }}
      >
        <form className="place-search-form" onSubmit={submit}>
          <Icon name="search" />
          <label className="sr-only" htmlFor="place-query">
            장소명 또는 지역 검색
          </label>
          <input
            id="place-query"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsHistoryOpen(true);
            }}
            onFocus={() => setIsHistoryOpen(true)}
            placeholder="장소명이나 지역을 검색해 보세요"
            maxLength={100}
          />
          <button type="submit" disabled={!query.trim() || isSearching}>
            {isSearching ? "검색 중" : "검색"}
          </button>
        </form>

        {showsHistory && (
          <section className="search-history" aria-label="최근 검색어">
            <header>
              <h2>최근 검색어</h2>
              <button
                type="button"
                className="search-history-clear"
                onClick={clearHistories}
              >
                전체 삭제
              </button>
            </header>
            <ul>
              {histories.map((history) => (
                <li key={history.id}>
                  <button
                    type="button"
                    className="search-history-query"
                    onClick={() => searchAgain(history)}
                  >
                    <Icon name="search" />
                    <span>{history.query}</span>
                  </button>
                  <button
                    type="button"
                    className="search-history-remove"
                    aria-label={`‘${history.query}’ 검색어 삭제`}
                    onClick={() => removeHistory(history)}
                  >
                    <Icon name="close" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {error && (
        <p className="search-message search-error" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="search-message search-notice" role="status">
          {notice}
        </p>
      )}

      <section className="map-panel" aria-label="장소 지도">
        <MapView
          center={SEOUL_CITY_HALL}
          places={places}
          selectedPlaceId={selectedPlaceId}
          onPlaceSelect={selectPlace}
          onPlaceClear={clearSelection}
          onMapClick={findNearby}
          fitPlaces={source?.kind !== "nearby"}
          onPlaceSave={setSavingPlace}
        />
      </section>

      {source && !error && (
        <div className="search-results">
          <p className="result-summary" role="status">
            {source.kind === "search" ? (
              <>
                <strong>‘{source.query}’</strong> 검색 결과 {places.length}곳
              </>
            ) : (
              <>
                <strong>누른 위치 주변</strong> {places.length}곳
              </>
            )}
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

      {savingPlace && (
        <SavePlaceDialog
          key={`${savingPlace.provider}-${savingPlace.id}`}
          place={savingPlace}
          onClose={() => setSavingPlace(null)}
        />
      )}
    </section>
  );
}
