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
  onPlaceClear?: () => void;
  /**
   * A tap on the map away from any marker, with no place selected. `radius` is
   * how many meters around `point` the tap could have meant at the current zoom.
   */
  onMapClick?: (point: LatLng, radius: number) => void;
  /** Zoom to show every place when none is selected. Defaults to true. */
  fitPlaces?: boolean;
  /** When set, the selected place's card offers to save it into a collection. */
  onPlaceSave?: (place: Place) => void;
}
