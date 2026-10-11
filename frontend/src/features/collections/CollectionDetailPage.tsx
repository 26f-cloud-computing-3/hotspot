import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { isNotFound } from "../../lib/api";
import { loadFailed, queryKeys, retryLoad } from "../../lib/query";
import { useActivePage } from "../../pages/HomePage";
import { UserAvatar } from "../follows/UserAvatar";
import { MapView } from "../map/MapView";
import type { Place } from "../map/types";
import {
  getCollection,
  invalidateCollections,
  listCollectionPlaces,
  removePlaceFromCollection,
} from "./api";
import { SavePlaceDialog } from "./SavePlaceDialog";
import "./CollectionsPage.css";
import "./CollectionDetailPage.css";

// Only where the map starts; it then fits itself to the collection's places.
const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 };

const placeKey = (place: Place) => {
  return `${place.provider}-${place.id}`;
};

/** My collection, which I can edit, or someone else's public one, which I can only read. */
export const CollectionDetailPage = () => {
  const { collectionId = "" } = useParams();
  // Set by the profile screen, so the way back is known before (or without) the load.
  const fromOwnerId: string | undefined = useLocation().state?.ownerId;
  const queryClient = useQueryClient();
  const collectionQuery = useQuery({
    queryKey: queryKeys.collections.detail(collectionId),
    queryFn: () => getCollection(collectionId),
  });
  const placesQuery = useQuery({
    queryKey: queryKeys.collections.places(collectionId),
    queryFn: () => listCollectionPlaces(collectionId),
  });
  const collection = collectionQuery.data;
  const places = placesQuery.data;
  // Private and deleted collections look the same from here: both are 404.
  // One that went away since it was last loaded must stop being shown, too.
  const missing =
    isNotFound(collectionQuery.error) || isNotFound(placesQuery.error);
  const [savingPlace, setSavingPlace] = useState<Place | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [removingKeys, setRemovingKeys] = useState<string[]>([]);
  const [error, setError] = useState("");

  const readOnly = collection ? !collection.is_owner : fromOwnerId != null;
  useActivePage(readOnly ? "followers" : null);

  const selectPlace = useCallback((place: Place) => {
    setSelectedPlaceId(place.id);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPlaceId(null);
  }, []);

  const remove = async (place: Place) => {
    const key = placeKey(place);
    setRemovingKeys((keys) => [...keys, key]);
    setError("");
    try {
      await removePlaceFromCollection(collectionId, place);
      queryClient.setQueryData<Place[]>(
        queryKeys.collections.places(collectionId),
        (items) => items?.filter((item) => placeKey(item) !== key),
      );
      void invalidateCollections(queryClient);
      setSelectedPlaceId((id) => (id === place.id ? null : id));
    } catch {
      setError(
        `‘${place.name}’을(를) 제외하지 못했습니다. 다시 시도해 주세요.`,
      );
    } finally {
      setRemovingKeys((keys) => keys.filter((item) => item !== key));
    }
  };

  const ownerId = readOnly ? (collection?.owner.id ?? fromOwnerId) : undefined;
  const backLink = ownerId ? (
    <Link className="back-link" to={`/users/${ownerId}`}>
      <Icon name="back" />
      {collection ? `${collection.owner.name} 님의 프로필` : "프로필"}
    </Link>
  ) : (
    <Link className="back-link" to="/collections">
      <Icon name="back" />
      컬렉션 목록
    </Link>
  );

  if (missing || loadFailed(collectionQuery, placesQuery)) {
    return (
      <>
        {backLink}
        <section className="empty-panel" role="alert">
          {missing ? (
            <p>비공개이거나 삭제된 컬렉션입니다.</p>
          ) : (
            <>
              <p>컬렉션을 불러오지 못했습니다.</p>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => retryLoad(collectionQuery, placesQuery)}
              >
                다시 시도
              </button>
            </>
          )}
        </section>
      </>
    );
  }
  if (collection === undefined || places === undefined) {
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
        {collection.is_owner && (
          <span className="badge" data-public={collection.is_public}>
            {collection.is_public ? "공개" : "비공개"}
          </span>
        )}
        <p className="collections-status" role="status">
          장소 {places.length}개
        </p>
        {!collection.is_owner && (
          <Link
            className="user-link collection-owner"
            to={`/users/${collection.owner.id}`}
          >
            <UserAvatar user={collection.owner} />
            <span className="user-identity">
              <strong>{collection.owner.name}</strong>
              <small>@{collection.owner.handle}</small>
            </span>
          </Link>
        )}
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
          {collection.is_owner && (
            <>
              <p>장소 찾기에서 마음에 드는 장소를 담아 보세요.</p>
              <Link className="button button-primary" to="/places">
                <Icon name="search" />
                장소 찾으러 가기
              </Link>
            </>
          )}
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
              onPlaceSave={collection.is_owner ? undefined : setSavingPlace}
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
                {collection.is_owner ? (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${place.name} 제외`}
                    disabled={removingKeys.includes(placeKey(place))}
                    onClick={() => remove(place)}
                  >
                    <Icon name="close" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${place.name} 컬렉션에 담기`}
                    title="컬렉션에 담기"
                    onClick={() => setSavingPlace(place)}
                  >
                    <Icon name="plus" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

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
