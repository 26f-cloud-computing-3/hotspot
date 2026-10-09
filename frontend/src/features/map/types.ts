export type MapProviderName = "kakao" | "naver" | "google";

export interface MapConfig {
  provider: MapProviderName;
  client_key: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place extends LatLng {
  id: string;
  provider: string;
  name: string;
  address: string;
  road_address: string | null;
  category: string | null;
  phone: string | null;
  url: string | null;
  distance: number | null;
}

export interface PlaceSearchResult {
  places: Place[];
  page: number;
  size: number;
  total: number;
  has_next: boolean;
}

export interface MapViewProps {
  clientKey: string;
  center: LatLng;
  level?: number;
  places?: Place[];
  selectedPlaceId?: string | null;
  onPlaceSelect?: (place: Place) => void;
}
