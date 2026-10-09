import { useEffect, useRef, useState } from "react";

import { loadScript } from "../loadScript";
import type { MapViewProps } from "../types";

declare global {
  interface Window {
    // biome-ignore lint/suspicious/noExplicitAny: Kakao Maps SDK ships no official types
    kakao: any;
  }
}

export function KakaoMap({
  clientKey,
  center,
  level = 3,
  places,
  selectedPlaceId,
  onPlaceSelect,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/suspicious/noExplicitAny: Kakao Maps SDK ships no official types
  const mapRef = useRef<any>(null);
  // biome-ignore lint/suspicious/noExplicitAny: Kakao Maps SDK ships no official types
  const markersRef = useRef<any[]>([]);
  const [isReady, setIsReady] = useState(false);

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
      const width = isSelected ? 38 : 32;
      const height = isSelected ? 50 : 42;
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
        mapRef.current.panTo(
          new window.kakao.maps.LatLng(selected.lat, selected.lng),
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

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
