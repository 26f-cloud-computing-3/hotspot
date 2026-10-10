import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { loadScript } from "../loadScript";
import { PlaceCard } from "../PlaceCard";
import type { MapViewProps } from "../types";

declare global {
  interface Window {
    // biome-ignore lint/suspicious/noExplicitAny: Kakao Maps SDK ships no official types
    kakao: any;
  }
}

const MARKER_SIZE = { width: 32, height: 42 };
const SELECTED_MARKER_SIZE = { width: 38, height: 50 };
// Gap between the selected marker's tip and the bottom of its info card.
const CARD_GAP = 8;
// How far below the map center the selected marker sits, so its card stays in view.
const CARD_ROOM = 96;

export function KakaoMap({
  clientKey,
  center,
  level = 3,
  places,
  selectedPlaceId,
  onPlaceSelect,
  onPlaceClear,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/suspicious/noExplicitAny: Kakao Maps SDK ships no official types
  const mapRef = useRef<any>(null);
  // biome-ignore lint/suspicious/noExplicitAny: Kakao Maps SDK ships no official types
  const markersRef = useRef<any[]>([]);
  const [overlayContent] = useState(() => document.createElement("div"));
  const [isReady, setIsReady] = useState(false);

  const selectedPlace =
    places?.find((place) => place.id === selectedPlaceId) ?? null;

  useEffect(() => {
    let cancelled = false;

    loadScript(
      `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${clientKey}&autoload=false`,
    ).then(() => {
      if (cancelled || !containerRef.current) return;
      window.kakao.maps.load(() => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(center.lat, center.lng),
          level,
        });
        setIsReady(true);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [clientKey, center.lat, center.lng, level]);

  useEffect(() => {
    if (!isReady || !mapRef.current) return;
    mapRef.current.setCenter(
      new window.kakao.maps.LatLng(center.lat, center.lng),
    );
  }, [center.lat, center.lng, isReady]);

  useEffect(() => {
    if (!isReady || !mapRef.current || !onPlaceClear) return;
    const map = mapRef.current;
    window.kakao.maps.event.addListener(map, "click", onPlaceClear);
    return () => {
      window.kakao.maps.event.removeListener(map, "click", onPlaceClear);
    };
  }, [isReady, onPlaceClear]);

  useEffect(() => {
    if (!isReady || !mapRef.current) return;

    for (const marker of markersRef.current) marker.setMap(null);
    markersRef.current = [];
    if (!places?.length) return;

    const primary = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-primary")
      .trim();
    const bounds = new window.kakao.maps.LatLngBounds();
    markersRef.current = places.map((place) => {
      const position = new window.kakao.maps.LatLng(place.lat, place.lng);
      const isSelected = place.id === selectedPlaceId;
      const { width, height } = isSelected ? SELECTED_MARKER_SIZE : MARKER_SIZE;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 32 42"><path fill="${primary}" stroke="white" stroke-width="2" d="M16 1C7.7 1 1 7.7 1 16c0 11.3 15 25 15 25s15-13.7 15-25C31 7.7 24.3 1 16 1Z"/><circle cx="16" cy="16" r="6" fill="white"/></svg>`;
      const image = new window.kakao.maps.MarkerImage(
        `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        new window.kakao.maps.Size(width, height),
        { offset: new window.kakao.maps.Point(width / 2, height) },
      );
      const marker = new window.kakao.maps.Marker({
        map: mapRef.current,
        position,
        image,
        title: place.name,
        zIndex: isSelected ? 2 : 1,
        // Keeps a marker click from also firing the map click that clears the selection.
        clickable: true,
      });
      window.kakao.maps.event.addListener(marker, "click", () =>
        onPlaceSelect?.(place),
      );
      bounds.extend(position);
      return marker;
    });

    if (selectedPlaceId) {
      const selected = places.find((place) => place.id === selectedPlaceId);
      if (selected) {
        // Pan so the marker lands below center, leaving room for its card above.
        const projection = mapRef.current.getProjection();
        const point = projection.containerPointFromCoords(
          new window.kakao.maps.LatLng(selected.lat, selected.lng),
        );
        mapRef.current.panTo(
          projection.coordsFromContainerPoint(
            new window.kakao.maps.Point(point.x, point.y - CARD_ROOM),
          ),
        );
      }
    } else {
      mapRef.current.setBounds(bounds, 48, 48, 48, 48);
    }

    return () => {
      for (const marker of markersRef.current) marker.setMap(null);
      markersRef.current = [];
    };
  }, [isReady, onPlaceSelect, places, selectedPlaceId]);

  useEffect(() => {
    if (!isReady || !mapRef.current || !selectedPlace) return;

    const overlay = new window.kakao.maps.CustomOverlay({
      map: mapRef.current,
      position: new window.kakao.maps.LatLng(
        selectedPlace.lat,
        selectedPlace.lng,
      ),
      content: overlayContent,
      xAnchor: 0.5,
      yAnchor: 1,
      zIndex: 3,
      clickable: true,
    });

    return () => overlay.setMap(null);
  }, [isReady, overlayContent, selectedPlace]);

  return (
    <>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {selectedPlace &&
        createPortal(
          <div
            className="place-overlay"
            style={{ paddingBottom: SELECTED_MARKER_SIZE.height + CARD_GAP }}
          >
            <PlaceCard place={selectedPlace} onClose={onPlaceClear} />
          </div>,
          overlayContent,
        )}
    </>
  );
}
