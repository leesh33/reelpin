/**
 * src/components/mapEmbedHtml.js — v2.41
 * ─────────────────────────────────────────────────────────────
 * 🗺️ **네이티브 WebView 안에서 도는 네이버 지도(Dynamic Map v3) 페이지**를 만듭니다.
 *
 * 왜 이렇게 하나
 *   · 웹(`RealMapView.web.js`)은 브라우저 DOM 에 네이버 지도를 그립니다. 아이폰·안드로이드에는
 *     DOM 이 없어서 v1.x 도식 지도(`MapCanvas`)로 내려가 있었습니다 → 실제 지도가 안 보였습니다.
 *   · WebView 는 진짜 브라우저이므로, 웹과 **같은** 네이버 지도 v3 스크립트를 그대로 씁니다.
 *     `baseUrl` 을 `https://reelpin.vercel.app` 로 주면 페이지 출처가 그 도메인이 되어
 *     NCP 콘솔에 등록된 도메인 제약을 그대로 통과합니다.
 *
 * 통신 (postMessage)
 *   RN → 페이지  { type:'state', pins, selectedId, myCoords, radiusMeters, droppedPoint,
 *                  fit, fitKey, focus, focusKey, focusAnchorY, initialCenter, initialZoom }
 *                { type:'zoom', dir:'in'|'out' }
 *   페이지 → RN  { type:'ready' } · { type:'error', reason }
 *                { type:'select', id } · { type:'longpress', lat, lng }
 *
 * 핀 모양·색·라벨·클러스터 규칙은 웹과 **같은 값**입니다
 *   (동그라미 18/26px · 흰 테두리 2/3px · 라벨 흰 알약/선택 시 분류색 · 클러스터 22px 임계).
 *   분류 색은 RN 쪽에서 `getCategoryColor` 로 계산해 `pin.color` 로 넘겨 줍니다(규칙 한 곳).
 */

export const NAVER_MAP_CLIENT_ID = 'a1mxcz4n34';
export const NAVER_MAPS_SCRIPT = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=';

/** 웹과 같은 값들 (테스트가 이 상수들을 확인합니다) */
export const EMBED_CLUSTER_THRESHOLD_PX = 22;
export const EMBED_PIN_SIZE = 18;
export const EMBED_PIN_SIZE_SELECTED = 26;
export const EMBED_LABEL_MAX_WIDTH = 112;

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";

/**
 * 네이버 지도 페이지 HTML 을 만듭니다.
 * @param {{clientId?:string}} [options]
 * @returns {string} WebView `source={{ html }}` 에 그대로 넣는 HTML
 */
export function buildMapEmbedHtml(options = {}) {
  const clientId = String(options.clientId || NAVER_MAP_CLIENT_ID);
  const scriptUrl = NAVER_MAPS_SCRIPT + encodeURIComponent(clientId);
  return (
    '<!DOCTYPE html><html lang="ko"><head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">' +
    '<style>' +
    'html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#0F172A;' +
    '-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;' +
    'font-family:' +
    FONT_STACK +
    ';}' +
    '#map{position:absolute;left:0;top:0;width:100%;height:100%;}' +
    '#fallback{display:none;position:absolute;left:0;top:0;right:0;bottom:0;z-index:9;' +
    'align-items:center;justify-content:center;flex-direction:column;gap:6px;text-align:center;' +
    'padding:24px;color:#E2E8F0;font-size:13px;font-weight:700;line-height:1.5;}' +
    '#fallback span{font-size:12px;font-weight:500;color:#94A3B8;}' +
    '@keyframes rpPulse{0%{transform:scale(0.7);opacity:0.55}70%{transform:scale(1.6);opacity:0}100%{opacity:0}}' +
    '.rp-pulse{animation:rpPulse 1.8s ease-out infinite;}' +
    '</style>' +
    '<script src="' +
    scriptUrl +
    '"></script>' +
    '</head><body><div id="map"></div>' +
    '<div id="fallback">네이버 지도를 불러오지 못했어요<span>잠시 후 다시 시도해 주세요</span></div>' +
    '<script>' +
    EMBED_SCRIPT +
    '</script></body></html>'
  );
}

/** 페이지 안에서 도는 스크립트 (문자열 — 템플릿 리터럴을 쓰지 않습니다) */
const EMBED_SCRIPT = `
(function(){
  var FONT = ${JSON.stringify(FONT_STACK)};
  var CLUSTER_THRESHOLD = ${EMBED_CLUSTER_THRESHOLD_PX};
  var PIN_SIZE = ${EMBED_PIN_SIZE};
  var PIN_SIZE_SELECTED = ${EMBED_PIN_SIZE_SELECTED};
  var LABEL_MAX_WIDTH = ${EMBED_LABEL_MAX_WIDTH};
  var CLUSTER_MIXED = '#64748B';
  var FOCUS_ZOOM = 16;
  var FIT_PADDING = { top: 260, right: 56, bottom: 150, left: 56 };
  var INITIAL_FIT_PADDING = { top: 56, right: 56, bottom: 56, left: 56 };

  var host = document.getElementById('map');
  var fallback = document.getElementById('fallback');
  var map = null;
  var nv = null;
  var ready = false;
  var markers = {};
  var badges = {};
  var badgeSig = '';
  var meDot = null;
  var meCircle = null;
  var droppedMarker = null;
  var focusKeySeen = null;
  var fitKeySeen = null;
  var didFit = false;
  var state = {
    pins: [], selectedId: null, myCoords: null, radiusMeters: 500, droppedPoint: null,
    fit: null, fitKey: 0, focus: null, focusKey: null, focusAnchorY: 0.5,
    initialCenter: null, initialZoom: 13
  };

  function post(msg) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {}
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
  function coordOf(p) {
    if (!p || typeof p !== 'object') return null;
    var lat = num(p.lat !== undefined ? p.lat : p.latitude);
    var lng = num(p.lng !== undefined ? p.lng : (p.lon !== undefined ? p.lon : p.longitude));
    if (lat === null || lng === null) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat: lat, lng: lng };
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function hexA(hex, alpha) {
    var h = String(hex || '#0D9488').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return 'rgba(13,148,136,' + alpha + ')';
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
  function size() {
    var w = host.clientWidth || window.innerWidth || 0;
    var h = host.clientHeight || window.innerHeight || 0;
    return { w: w, h: h };
  }
  function project(lat, lng) {
    if (!map || !nv) return null;
    try {
      var p = map.getProjection();
      if (!p || typeof p.fromCoordToOffset !== 'function') return null;
      var offset = p.fromCoordToOffset(new nv.LatLng(lat, lng));
      if (!offset || !isFinite(offset.x) || !isFinite(offset.y)) return null;
      return { x: offset.x, y: offset.y };
    } catch (e) { return null; }
  }

  // ── 핀 모양 (웹과 같은 HTML) ───────────────────────────────
  function labelHtml(pin, selected) {
    var name = String((pin && pin.name) || '').trim();
    if (!name) return '';
    var visited = pin && pin.visited === true;
    var color = (pin && pin.color) || '#0D9488';
    var background = selected ? color : 'rgba(255,255,255,0.96)';
    var textColor = selected ? '#FFFFFF' : (visited ? '#15803D' : '#1C1C1E');
    var border = selected ? 'rgba(255,255,255,0.85)' : (visited ? 'rgba(22,163,74,0.7)' : hexA(color, 0.55));
    return '<div style="margin-top:3px;max-width:' + LABEL_MAX_WIDTH + 'px;box-sizing:border-box;' +
      'padding:2px 6px;border-radius:999px;background:' + background + ';border:1px solid ' + border +
      ';color:' + textColor + ';font-family:' + FONT + ';font-size:11px;font-weight:800;line-height:13px;' +
      'letter-spacing:-0.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
      'box-shadow:0 1px 4px rgba(15,23,42,0.22);">' + (visited ? '\\u2713 ' : '') + esc(name) + '</div>';
  }
  function pinIcon(pin, selected) {
    var size = selected ? PIN_SIZE_SELECTED : PIN_SIZE;
    var border = selected ? 3 : 2;
    var color = (pin && pin.color) || '#0D9488';
    var circle = '<div style="width:' + size + 'px;height:' + size + 'px;box-sizing:border-box;' +
      'border-radius:50%;background:' + color + ';border:' + border + 'px solid #FFFFFF;' +
      'box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>';
    var html = '<div style="display:flex;flex-direction:column;align-items:center;width:max-content;' +
      'transform:translateX(-50%);cursor:pointer;-webkit-tap-highlight-color:transparent;">' +
      circle + labelHtml(pin, selected) + '</div>';
    return { content: html, anchor: new nv.Point(0, size / 2) };
  }
  function clusterIcon(count, color) {
    var size = Number(count) >= 10 ? 46 : 40;
    var halo = /^#/.test(String(color || '')) ? color : '#0D9488';
    var label = Number(count) > 99 ? '99+' : String(Math.round(Number(count)));
    var html = '<div style="display:flex;align-items:center;justify-content:center;width:' + size +
      'px;height:' + size + 'px;box-sizing:border-box;border-radius:50%;background:#0F172A;' +
      'box-shadow:0 0 0 2.5px #FFFFFF,0 0 0 5.5px ' + hexA(halo, 0.5) + ',0 4px 10px rgba(15,23,42,0.38);' +
      'color:#FFFFFF;font-family:' + FONT + ';font-size:' + (Number(count) >= 10 ? 15 : 14) +
      'px;font-weight:900;line-height:1;letter-spacing:-0.4px;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent;">' + label + '</div>';
    return { content: html, anchor: new nv.Point(size / 2, size / 2) };
  }
  function dropIcon() {
    var html = '<div style="position:relative;display:flex;flex-direction:column;align-items:center;' +
      'width:max-content;transform:translateX(-50%);">' +
      '<div style="position:relative;width:22px;height:22px;">' +
      '<span class="rp-pulse" style="position:absolute;left:50%;top:50%;width:22px;height:22px;' +
      'margin:-11px 0 0 -11px;border-radius:50%;background:rgba(13,148,136,0.30);"></span>' +
      '<div style="position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;' +
      'box-sizing:border-box;border-radius:50%;background:#0D9488;border:3px solid #FFFFFF;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.42);"></div></div>' +
      '<div style="margin-top:3px;padding:2px 7px;border-radius:999px;background:#0D9488;color:#FFFFFF;' +
      'font-family:' + FONT + ';font-size:10.5px;font-weight:900;line-height:13px;letter-spacing:-0.2px;' +
      'white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.30);">\\uC5EC\\uAE30</div></div>';
    return { content: html, anchor: new nv.Point(0, 11) };
  }
  function myDotIcon() {
    var html = '<div style="width:14px;height:14px;box-sizing:border-box;border-radius:50%;' +
      'background:#2563EB;border:3px solid #FFFFFF;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>';
    return { content: html, anchor: new nv.Point(7, 7) };
  }

  // ── 클러스터 계산 (utils/cluster.js 와 같은 규칙) ───────────
  function groupPoints(points) {
    var sorted = points.slice().sort(function (a, b) {
      return a.y - b.y || a.x - b.x || String(a.id).localeCompare(String(b.id));
    });
    var parent = sorted.map(function (_, i) { return i; });
    function find(start) {
      var i = start;
      while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
      return i;
    }
    for (var i = 0; i < sorted.length; i += 1) {
      for (var j = i + 1; j < sorted.length; j += 1) {
        var dx = sorted[i].x - sorted[j].x, dy = sorted[i].y - sorted[j].y;
        if (Math.sqrt(dx * dx + dy * dy) > CLUSTER_THRESHOLD) continue;
        var left = find(i), right = find(j);
        if (left !== right) parent[right] = left;
      }
    }
    var buckets = {};
    sorted.forEach(function (point, index) {
      var root = find(index);
      if (!buckets[root]) buckets[root] = [];
      buckets[root].push(point);
    });
    var groups = Object.keys(buckets).map(function (key) {
      var members = buckets[key];
      var ids = members.map(function (m) { return String(m.id); });
      var sumX = 0, sumY = 0, sumLat = 0, sumLng = 0;
      members.forEach(function (m) { sumX += m.x; sumY += m.y; sumLat += m.lat; sumLng += m.lng; });
      var colors = {};
      members.forEach(function (m) { colors[String(m.color || '')] = true; });
      var colorKeys = Object.keys(colors).filter(Boolean);
      return {
        key: ids.slice().sort().join('|'),
        ids: ids,
        count: members.length,
        x: sumX / members.length,
        y: sumY / members.length,
        lat: sumLat / members.length,
        lng: sumLng / members.length,
        color: colorKeys.length === 1 ? colorKeys[0] : CLUSTER_MIXED,
        members: members
      };
    });
    groups.sort(function (a, b) { return a.y - b.y || a.x - b.x || a.key.localeCompare(b.key); });
    return groups;
  }

  // ── 그리기 ─────────────────────────────────────────────────
  function clearMarkers() {
    Object.keys(markers).forEach(function (id) { try { markers[id].setMap(null); } catch (e) {} });
    markers = {};
  }
  function clearBadges() {
    Object.keys(badges).forEach(function (key) { try { badges[key].setMap(null); } catch (e) {} });
    badges = {};
  }

  function render() {
    if (!ready || !map || !nv) return;
    var selected = state.selectedId;
    var points = [];
    var drawList = [];
    (state.pins || []).forEach(function (pin) {
      if (!pin || pin.id == null) return;
      var c = coordOf(pin);
      if (!c) return;
      var isSelected = selected != null && String(pin.id) === String(selected);
      if (isSelected) { drawList.push({ pin: pin, c: c, selected: true }); return; }
      var pt = project(c.lat, c.lng);
      if (!pt) { drawList.push({ pin: pin, c: c, selected: false }); return; }
      points.push({ id: String(pin.id), x: pt.x, y: pt.y, lat: c.lat, lng: c.lng, color: pin.color || '#0D9488' });
      drawList.push({ pin: pin, c: c, selected: false });
    });

    var groups = groupPoints(points);
    var hidden = {};
    var wanted = {};
    groups.forEach(function (group) {
      if (group.count >= 2) { group.ids.forEach(function (id) { hidden[id] = true; }); wanted[group.key] = group; }
    });

    // 핀 마커 — 사라진 것 지우고, 남은 것 갱신/생성
    var alive = {};
    drawList.forEach(function (item) {
      var key = String(item.pin.id);
      if (hidden[key]) {
        if (markers[key]) { try { markers[key].setMap(null); } catch (e) {} delete markers[key]; }
        return;
      }
      alive[key] = true;
      var position = new nv.LatLng(item.c.lat, item.c.lng);
      var icon = pinIcon(item.pin, item.selected);
      if (markers[key]) {
        markers[key].setPosition(position);
        markers[key].setIcon(icon);
        markers[key].setTitle(item.pin.name || '');
        markers[key].setZIndex(item.selected ? 100 : 1);
      } else {
        var marker = new nv.Marker({
          position: position, map: map, icon: icon, title: item.pin.name || '',
          zIndex: item.selected ? 100 : 1, clickable: true
        });
        (function (pinId) {
          nv.Event.addListener(marker, 'click', function () { post({ type: 'select', id: pinId }); });
        })(item.pin.id);
        markers[key] = marker;
      }
    });
    Object.keys(markers).forEach(function (key) {
      if (alive[key]) return;
      try { markers[key].setMap(null); } catch (e) {}
      delete markers[key];
    });

    // 클러스터 배지 — 묶음이 바뀔 때만 다시 그립니다
    var signature = Object.keys(wanted).sort().join(',');
    if (signature !== badgeSig) {
      badgeSig = signature;
      clearBadges();
      Object.keys(wanted).forEach(function (key) {
        var group = wanted[key];
        if (group.lat === null || group.lng === null) return;
        var marker = new nv.Marker({
          position: new nv.LatLng(group.lat, group.lng), map: map,
          icon: clusterIcon(group.count, group.color), title: group.count + '\\uACF3', zIndex: 300, clickable: true
        });
        (function (captured) {
          nv.Event.addListener(marker, 'click', function (event) {
            if (event && typeof event.stop === 'function') event.stop();
            expandCluster(captured);
          });
        })(group);
        badges[key] = marker;
      });
    }
  }

  function expandCluster(group) {
    if (!map || !nv || !group || !group.members || !group.members.length) return;
    var members = group.members;
    var xs = members.map(function (m) { return m.x; });
    var ys = members.map(function (m) { return m.y; });
    var spread = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs),
                          Math.max.apply(null, ys) - Math.min.apply(null, ys));
    try {
      if (members.length > 1 && spread >= 2) {
        var bounds = new nv.LatLngBounds();
        members.forEach(function (m) { bounds.extend(new nv.LatLng(m.lat, m.lng)); });
        map.fitBounds(bounds, { top: 110, right: 64, bottom: 180, left: 64, maxZoom: 19 });
      } else {
        var zoom = Math.min((map.getZoom() || 14) + 2, map.getMaxZoom());
        map.morph(new nv.LatLng(group.lat, group.lng), zoom, { duration: 500, easing: 'easeOutCubic' });
      }
    } catch (e) {}
  }

  function applyMe() {
    if (!ready || !map || !nv) return;
    var c = coordOf(state.myCoords);
    if (!c) {
      if (meDot) { try { meDot.setMap(null); } catch (e) {} meDot = null; }
      if (meCircle) { try { meCircle.setMap(null); } catch (e) {} meCircle = null; }
      return;
    }
    var position = new nv.LatLng(c.lat, c.lng);
    if (!meDot) {
      meDot = new nv.Marker({ position: position, map: map, icon: myDotIcon(), title: '\\uB0B4 \\uC704\\uCE58', zIndex: 200, clickable: false });
    } else {
      meDot.setPosition(position);
    }
    var r = Number(state.radiusMeters) > 0 ? Number(state.radiusMeters) : 500;
    if (!meCircle) {
      meCircle = new nv.Circle({
        map: map, center: position, radius: r, strokeColor: '#3B82F6', strokeWeight: 1.5,
        strokeOpacity: 0.9, fillColor: '#3B82F6', fillOpacity: 0.12, zIndex: 50
      });
    } else {
      meCircle.setCenter(position);
      meCircle.setRadius(r);
    }
  }

  function applyDropped() {
    if (!ready || !map || !nv) return;
    var c = coordOf(state.droppedPoint);
    if (!c) {
      if (droppedMarker) { try { droppedMarker.setMap(null); } catch (e) {} droppedMarker = null; }
      return;
    }
    var position = new nv.LatLng(c.lat, c.lng);
    if (!droppedMarker) {
      droppedMarker = new nv.Marker({ position: position, map: map, icon: dropIcon(), title: '\\uAFB9 \\uB204\\uB978 \\uC790\\uB9AC', zIndex: 400, clickable: false });
    } else {
      droppedMarker.setPosition(position);
      droppedMarker.setIcon(dropIcon());
      droppedMarker.setMap(map);
    }
  }

  function applyFocus() {
    if (!ready || !map || !nv) return;
    if (state.focusKey == null || state.focusKey === focusKeySeen) return;
    var c = coordOf(state.focus);
    if (!c) return;
    focusKeySeen = state.focusKey;
    var zoom = Math.max(map.getZoom() || state.initialZoom || 13, FOCUS_ZOOM);
    var anchorY = Number(state.focusAnchorY);
    if (!isFinite(anchorY)) anchorY = 0.5;
    try {
      var target = new nv.LatLng(c.lat, c.lng);
      var s = size();
      if (anchorY !== 0.5 && s.h > 0) {
        var projection = map.getProjection();
        if (projection && typeof projection.fromCoordToPoint === 'function') {
          var scale = Math.pow(2, zoom);
          var world = projection.fromCoordToPoint(target);
          var dy = s.h * anchorY - s.h / 2;
          var center = projection.fromPointToCoord(new nv.Point(world.x, world.y - dy / scale));
          if (center && typeof center.lat === 'function') target = new nv.LatLng(center.lat(), center.lng());
        }
      }
      map.morph(target, zoom, { duration: 500, easing: 'easeOutCubic' });
    } catch (e) {}
  }

  function applyFit() {
    if (!ready || !map || !nv) return;
    var points = (Array.isArray(state.fit) ? state.fit : []).map(coordOf).filter(Boolean);
    if (!points.length) return;
    if (state.fitKey === fitKeySeen) return;
    fitKeySeen = state.fitKey;
    try {
      if (points.length === 1) {
        map.morph(new nv.LatLng(points[0].lat, points[0].lng), FOCUS_ZOOM, { duration: 500, easing: 'easeOutCubic' });
        return;
      }
      var bounds = new nv.LatLngBounds();
      points.forEach(function (p) { bounds.extend(new nv.LatLng(p.lat, p.lng)); });
      map.fitBounds(bounds, { top: FIT_PADDING.top, right: FIT_PADDING.right, bottom: FIT_PADDING.bottom, left: FIT_PADDING.left, maxZoom: FOCUS_ZOOM });
    } catch (e) {}
  }

  /** 첫 화면 — 내 위치가 없고 핀이 2곳 이상이면 전체가 보이게 */
  function applyInitialFit() {
    if (didFit || !ready || !map || !nv) return;
    didFit = true;
    if (coordOf(state.myCoords)) return;
    var points = (state.pins || []).map(function (pin) {
      if (state.selectedId != null && String(pin.id) === String(state.selectedId)) return null;
      return coordOf(pin);
    }).filter(Boolean);
    if (points.length < 2) return;
    try {
      var bounds = new nv.LatLngBounds();
      points.forEach(function (p) { bounds.extend(new nv.LatLng(p.lat, p.lng)); });
      map.fitBounds(bounds, { top: INITIAL_FIT_PADDING.top, right: INITIAL_FIT_PADDING.right,
        bottom: INITIAL_FIT_PADDING.bottom, left: INITIAL_FIT_PADDING.left, maxZoom: 15 });
    } catch (e) {}
  }

  // ── 지도 초기화 ────────────────────────────────────────────
  function startCenter() {
    var f = coordOf(state.initialCenter);
    if (f) return f;
    var me = coordOf(state.myCoords);
    if (me) return me;
    var first = (state.pins || []).map(coordOf).filter(Boolean)[0];
    if (first) return first;
    return { lat: 37.5665, lng: 126.978 };
  }

  function showFallback(reason) {
    fallback.style.display = 'flex';
    post({ type: 'error', reason: reason || 'naver_missing' });
  }

  function boot() {
    if (typeof window.naver === 'undefined' || !window.naver || !window.naver.maps) {
      showFallback('naver_missing');
      return;
    }
    nv = window.naver.maps;
    var center = startCenter();
    var s = size();
    try {
      map = new nv.Map(host, {
        center: new nv.LatLng(center.lat, center.lng),
        zoom: Number(state.initialZoom) || 13,
        minZoom: 3,
        maxZoom: 19,
        zoomControl: false,
        scaleControl: false,
        mapDataControl: false,
        logoControl: true
      });
    } catch (e) {
      showFallback('naver_init');
      return;
    }
    ready = true;
    try {
      nv.Event.addListener(map, 'idle', function () { render(); });
      nv.Event.addListener(map, 'zoom_changed', function () { render(); });
    } catch (e) {}
    bindLongPress();
    window.addEventListener('resize', function () {
      try { var next = size(); map.setSize(new nv.Size(next.w, next.h)); } catch (e) {}
      render();
    });
    post({ type: 'ready' });
    render();
    applyMe();
    applyDropped();
    applyInitialFit();
    setTimeout(function () { applyFit(); }, 30);
    setTimeout(function () { try { var next = size(); map.setSize(new nv.Size(next.w, next.h)); render(); } catch (e) {} }, 250);
  }

  // ── 꾹 누르기 (웹 longPressGesture 와 같은 뜻: 550ms · 10px 이동까지) ──
  function bindLongPress() {
    var timer = null;
    var start = null;
    var moved = false;
    function cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
      start = null;
      moved = false;
    }
    function coordAt(clientX, clientY) {
      try {
        var projection = map.getProjection();
        if (!projection || typeof projection.fromOffsetToCoord !== 'function') return null;
        var rect = host.getBoundingClientRect();
        var px = clientX - rect.left;
        var py = clientY - rect.top;
        var centerOffset = projection.fromCoordToOffset(map.getCenter());
        var mapSize = map.getSize();
        var offset = new nv.Point(
          centerOffset.x + (px - mapSize.width / 2),
          centerOffset.y + (py - mapSize.height / 2)
        );
        var coord = projection.fromOffsetToCoord(offset);
        if (!coord || typeof coord.lat !== 'function') return null;
        return { lat: coord.lat(), lng: coord.lng() };
      } catch (e) { return null; }
    }
    host.addEventListener('touchstart', function (event) {
      if (event.touches && event.touches.length !== 1) { cancel(); return; }
      var touch = event.touches ? event.touches[0] : event;
      start = { x: touch.clientX, y: touch.clientY };
      moved = false;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        if (moved || !start) return;
        var coord = coordAt(start.x, start.y);
        timer = null;
        if (coord) post({ type: 'longpress', lat: coord.lat, lng: coord.lng });
      }, 550);
    }, { passive: true });
    host.addEventListener('touchmove', function (event) {
      if (!start || !event.touches || !event.touches.length) return;
      var touch = event.touches[0];
      var dx = touch.clientX - start.x;
      var dy = touch.clientY - start.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) { moved = true; if (timer) { clearTimeout(timer); timer = null; } }
    }, { passive: true });
    host.addEventListener('touchend', cancel, { passive: true });
    host.addEventListener('touchcancel', cancel, { passive: true });
  }

  // ── RN → 페이지 ────────────────────────────────────────────
  function applyState(next) {
    var previousSelected = state.selectedId;
    var previousPins = state.pins;
    state.pins = Array.isArray(next.pins) ? next.pins : state.pins;
    state.selectedId = next.selectedId === undefined ? state.selectedId : next.selectedId;
    if (next.myCoords !== undefined) state.myCoords = next.myCoords;
    if (next.radiusMeters !== undefined) state.radiusMeters = next.radiusMeters;
    if (next.droppedPoint !== undefined) state.droppedPoint = next.droppedPoint;
    if (next.fit !== undefined) state.fit = next.fit;
    if (next.fitKey !== undefined) state.fitKey = next.fitKey;
    if (next.focus !== undefined) state.focus = next.focus;
    if (next.focusKey !== undefined) state.focusKey = next.focusKey;
    if (next.focusAnchorY !== undefined) state.focusAnchorY = next.focusAnchorY;
    if (next.initialCenter !== undefined) state.initialCenter = next.initialCenter;
    if (next.initialZoom !== undefined) state.initialZoom = next.initialZoom;
    if (!ready) return;
    if (previousPins !== state.pins || previousSelected !== state.selectedId) {
      badgeSig = '';
      render();
    }
    applyMe();
    applyDropped();
    applyFocus();
    applyFit();
  }

  window.__reelpinReceive = function (payload) {
    var message = payload;
    if (typeof payload === 'string') {
      try { message = JSON.parse(payload); } catch (e) { return; }
    }
    if (!message || !message.type) return;
    if (message.type === 'state') { applyState(message); return; }
    if (message.type === 'zoom' && ready && map) {
      try {
        if (message.dir === 'in') map.setZoom(Math.min(map.getZoom() + 1, map.getMaxZoom()), true);
        else map.setZoom(Math.max(map.getZoom() - 1, map.getMinZoom()), true);
      } catch (e) {}
    }
  };

  function start() {
    var waited = 0;
    (function retry() {
      if (typeof window.naver !== 'undefined' && window.naver && window.naver.maps) { boot(); return; }
      if (waited >= 9000) { showFallback('naver_timeout'); return; }
      waited += 150;
      setTimeout(retry, 150);
    })();
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') start();
  else document.addEventListener('DOMContentLoaded', start);
})();
`;
