import { useQuery } from "@tanstack/react-query";

import { apiGet } from "../../lib/api";
import { queryKeys } from "../../lib/query";
import { GoogleMap } from "./providers/GoogleMap";
import { KakaoMap } from "./providers/KakaoMap";
import { NaverMap } from "./providers/NaverMap";
import type { LatLng, MapConfig, Place } from "./types";

const PROVIDERS = {
  kakao: KakaoMap,
  naver: NaverMap,
  google: GoogleMap,
};

interface MapViewContainerProps {
  center: LatLng;
  level?: number;
  places?: Place[];
  selectedPlaceId?: string | null;
  onPlaceSelect?: (place: Place) => void;
  onPlaceClear?: () => void;
  onMapClick?: (point: LatLng, radius: number) => void;
  fitPlaces?: boolean;
  onPlaceSave?: (place: Place) => void;
  startAtCurrentLocation?: boolean;
}

export const MapView = ({
  center,
  level,
  places,
  selectedPlaceId,
  onPlaceSelect,
  onPlaceClear,
  onMapClick,
  fitPlaces,
  onPlaceSave,
  startAtCurrentLocation,
}: MapViewContainerProps) => {
  // The provider is fixed by the backend's configuration, so one answer lasts the visit.
  const { data: config, error } = useQuery({
    queryKey: queryKeys.mapConfig,
    queryFn: () => apiGet<MapConfig>("/api/map/config"),
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (error) return <div>지도 설정을 불러오지 못했습니다: {error.message}</div>;
  if (!config) return <div>지도를 불러오는 중...</div>;

  const Provider = PROVIDERS[config.provider];
  return (
    <Provider
      clientKey={config.client_key}
      center={center}
      level={level}
      places={places}
      selectedPlaceId={selectedPlaceId}
      onPlaceSelect={onPlaceSelect}
      onPlaceClear={onPlaceClear}
      onMapClick={onMapClick}
      fitPlaces={fitPlaces}
      onPlaceSave={onPlaceSave}
      startAtCurrentLocation={startAtCurrentLocation}
    />
  );
};
