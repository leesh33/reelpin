/**
 * src/components/RealMapView.js
 * ─────────────────────────────────────────────────────────────
 * 네이티브(Expo Go · iOS/Android) 폴백 지도.
 *
 * 웹에서는 Metro 가 `RealMapView.web.js`(Leaflet 실제 지도)를 먼저 집어갑니다.
 * 네이티브에서는 아직 react-native-maps(Google/Apple 지도 키 필요)를 넣지 않았으므로
 * v1.0~1.4 의 도식 지도(MapCanvas)를 그대로 씁니다 — 동작·모양 모두 이전과 같습니다.
 *
 * v2.4 — 분류 색을 맞추기 위해 categories(내 분류 목록)를 MapCanvas 로 그대로 넘깁니다.
 */
import React from 'react';
import MapCanvas from './MapCanvas';

export default function RealMapView({ pins, selectedId, onSelect, radiusMeters, categories }) {
  return (
    <MapCanvas
      pins={pins}
      selectedId={selectedId}
      onSelect={onSelect}
      radius={radiusMeters}
      categories={categories}
    />
  );
}
