import { useEffect, useState } from "react";

import { apiGet } from "../../lib/api";
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
}

export function MapView({
  center,
  level,
  places,
  selectedPlaceId,
  onPlaceSelect,
  onPlaceClear,
}: MapViewContainerProps) {
  const [config, setConfig] = useState<MapConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<MapConfig>("/api/map/config")
      .then(setConfig)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div>지도 설정을 불러오지 못했습니다: {error}</div>;
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
    />
  );
}
