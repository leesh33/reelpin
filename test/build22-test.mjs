/**
 * test/build22-test.mjs — 🗺️ 빌드 22: 지도 핀/이름표 세로 잘림 · 백그라운드 복귀 까만 화면
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 지적(빌드 21 TestFlight · 아이폰):
 *   ① `IMG_9335` — 핀 아래 이름표(`검단 아라뱃…`)의 오른쪽 절반이 잘려 보임
 *      → 네이버 마커 content 가 `width:max-content` + `translateX(-50%)` 로 마커 상자 밖으로
 *        밀려 나가 iOS WKWebView 에서 잘렸습니다. 이제 **고정 폭 박스 + 박스 가운데 anchor**.
 *   ② `IMG_9336` — 30분 이상 백그라운드 후 돌아오면 지도 자리에 까만 화면(`#0F172A`)만
 *      → iOS WKWebView 프로세스가 종료돼도 `onContentProcessDidTerminate` 가 없어 아무것도
 *        다시 그리지 못했습니다. 이제 프로세스가 죽으면 `retry` 로 key 를 올려 다시 띄웁니다.
 *
 * 실제로 페이지 스크립트를 node vm 에서 돌려 **마커 content·anchor 값**을 꺼내 확인합니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  buildMapEmbedHtml,
  EMBED_PIN_BOX_WIDTH,
  EMBED_DROP_BOX_WIDTH,
  EMBED_LABEL_MAX_WIDTH,
  EMBED_PIN_SIZE,
  EMBED_PIN_SIZE_SELECTED,
} from '../src/components/mapEmbedHtml.js';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

// ── 1. 상수 ─────────────────────────────────────────────────
check(
  '고정 폭: 이름표 최대 폭(112) + 좌우 여백 16 = 128px',
  EMBED_LABEL_MAX_WIDTH === 112 && EMBED_PIN_BOX_WIDTH === EMBED_LABEL_MAX_WIDTH + 16 && EMBED_PIN_BOX_WIDTH === 128,
  EMBED_LABEL_MAX_WIDTH + ' / ' + EMBED_PIN_BOX_WIDTH
);
check(
  '고정 폭: 이름표가 박스보다 넓어질 수 없다 (잘림 방지의 전제)',
  EMBED_LABEL_MAX_WIDTH <= EMBED_PIN_BOX_WIDTH,
  EMBED_LABEL_MAX_WIDTH + ' ≤ ' + EMBED_PIN_BOX_WIDTH
);
check('꾹 누른 자리 핀 박스 폭 상수 존재', EMBED_DROP_BOX_WIDTH >= 48, EMBED_DROP_BOX_WIDTH);

// ── 2. 페이지 스크립트를 실제로 돌려 마커 content·anchor 확인 ──
const html = buildMapEmbedHtml();
check('페이지: translateX(-50%) 마커 정렬이 사라졌다', html.indexOf('translateX(-50%)') < 0);
check('페이지: 고정 폭 상수가 스크립트에 주입된다',
  html.indexOf('var PIN_BOX_WIDTH = ' + EMBED_PIN_BOX_WIDTH + ';') > 0 &&
    html.indexOf('var DROP_BOX_WIDTH = ' + EMBED_DROP_BOX_WIDTH + ';') > 0);

const inline = html.match(/<script>([\s\S]*?)<\/script>/);
check('페이지: 인라인 스크립트를 찾았다', !!inline);

function bootEmbed() {
  const posted = [];
  const icons = [];
  const hostEl = {
    clientWidth: 390,
    clientHeight: 700,
    style: {},
    addEventListener() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 390, height: 700 };
    },
  };
  const fallbackEl = { style: {} };

  class Point {
    constructor(x, y) { this.x = x; this.y = y; }
  }
  class LatLng {
    constructor(lat, lng) { this._lat = lat; this._lng = lng; }
    lat() { return this._lat; }
    lng() { return this._lng; }
  }
  class Size {
    constructor(w, h) { this.width = w; this.height = h; }
  }
  class LatLngBounds { extend() {} }
  class Circle {
    constructor(opts) { Object.assign(this, opts); }
    setCenter() {}
    setRadius() {}
    setMap() {}
  }
  class Marker {
    constructor(opts) {
      this.opts = opts;
      icons.push(opts.icon);
    }
    setPosition() {}
    setIcon(icon) { this.opts.icon = icon; icons.push(icon); }
    setTitle() {}
    setZIndex() {}
    setMap() {}
    getMap() { return this.opts.map; }
  }
  class Map {
    getProjection() {
      return {
        fromCoordToOffset: () => ({ x: 120, y: 240 }),
        fromOffsetToCoord: () => new LatLng(37.58, 126.71),
        fromCoordToPoint: () => ({ x: 1, y: 1 }),
        fromPointToCoord: () => new LatLng(37.58, 126.71),
      };
    }
    getZoom() { return 14; }
    getMaxZoom() { return 19; }
    getMinZoom() { return 3; }
    setSize() {}
    setZoom() {}
    morph() {}
    fitBounds() {}
    getCenter() { return new LatLng(37.58, 126.71); }
    getSize() { return new Size(390, 700); }
  }
  const maps = {
    Point,
    LatLng,
    Size,
    LatLngBounds,
    Circle,
    Marker,
    Map,
    Event: { addListener: () => ({}) },
  };
  const sandbox = {
    document: {
      readyState: 'complete',
      getElementById: (id) => (id === 'map' ? hostEl : fallbackEl),
      addEventListener() {},
    },
    window: {
      naver: { maps },
      ReactNativeWebView: { postMessage: (m) => posted.push(m) },
      addEventListener() {},
      innerWidth: 390,
      innerHeight: 700,
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(inline[1], sandbox, { filename: 'map-embed.js' });
  return { win: sandbox.window, posted, icons };
}

const embed = bootEmbed();
check('부팅: 페이지가 RN 으로 ready 를 보냈다',
  embed.posted.some((raw) => raw.indexOf('"ready"') > 0));

embed.win.__reelpinReceive({
  type: 'state',
  pins: [{ id: 'pin-1', name: '검단 아라뱃길', lat: 37.58, lng: 126.71, color: '#0D9488' }],
  selectedId: null,
});
const plain = embed.icons[embed.icons.length - 1];
check('핀: 마커가 그려졌다', !!plain && typeof plain.content === 'string');

const plainContent = String((plain && plain.content) || '');
check('핀: content 가 고정 폭 박스(128px) 안에서 가운데 정렬',
  plainContent.indexOf('width:' + EMBED_PIN_BOX_WIDTH + 'px') > 0 &&
    plainContent.indexOf('align-items:center') > 0);
check('핀: translateX 정렬을 쓰지 않는다', plainContent.indexOf('translateX') < 0);
check('핀: 이름표는 max-width 112px + 말줄임 유지',
  plainContent.indexOf('max-width:' + EMBED_LABEL_MAX_WIDTH + 'px') > 0 &&
    plainContent.indexOf('text-overflow:ellipsis') > 0 &&
    plainContent.indexOf('white-space:nowrap') > 0);
check('핀: 빈 여백은 눌리지 않고 동그라미·이름표만 눌린다',
  plainContent.indexOf('pointer-events:none') > 0 && plainContent.indexOf('pointer-events:auto') > 0);
check('핀: anchor = 박스 가운데 (width/2, size/2) — 동그라미 중심이 위경도',
  plain && plain.anchor && plain.anchor.x === EMBED_PIN_BOX_WIDTH / 2 &&
    plain.anchor.y === EMBED_PIN_SIZE / 2,
  JSON.stringify(plain && plain.anchor));

embed.win.__reelpinReceive({ type: 'state', pins: [{ id: 'pin-1', name: '검단 아라뱃길', lat: 37.58, lng: 126.71, color: '#0D9488' }], selectedId: 'pin-1' });
const selected = embed.icons[embed.icons.length - 1];
check('선택된 핀: 커진 동그라미(26)에서도 anchor 가 박스 가운데',
  selected && selected.anchor && selected.anchor.x === EMBED_PIN_BOX_WIDTH / 2 &&
    selected.anchor.y === EMBED_PIN_SIZE_SELECTED / 2,
  JSON.stringify(selected && selected.anchor));

embed.win.__reelpinReceive({ type: 'state', pins: [], selectedId: null, droppedPoint: { lat: 37.581, lng: 126.715 } });
const dropped = embed.icons[embed.icons.length - 1];
check('꾹 누른 자리 핀: 고정 폭 박스 + 가운데 anchor(11)',
  dropped && dropped.content.indexOf('width:' + EMBED_DROP_BOX_WIDTH + 'px') > 0 &&
    dropped.content.indexOf('translateX') < 0 &&
    dropped.anchor.x === EMBED_DROP_BOX_WIDTH / 2 && dropped.anchor.y === 11,
  JSON.stringify(dropped && dropped.anchor));

// ── 3. 백그라운드 복귀: WebView 프로세스 종료 → 자동 재로딩 ──
const nativeMap = read('src/components/RealMapView.js');
check('iOS: onContentProcessDidTerminate 가 붙어 있다 (까만 화면의 원인)',
  /onContentProcessDidTerminate=\{retry\}/.test(nativeMap));
check('Android: onRenderProcessGone 도 같은 복구(retry)로 동작한다',
  /onRenderProcessGone=\{retry\}/.test(nativeMap) &&
    nativeMap.indexOf("onRenderProcessGone={() => setStatus('error')}") < 0);
check('복구: retry 는 reloadKey 를 올려 WebView 를 다시 띄운다',
  /const retry = useCallback\(\(\) => \{[\s\S]*?setReloadKey\(\(n\) => n \+ 1\);[\s\S]*?\}, \[\]\);/.test(nativeMap) &&
    nativeMap.indexOf('key={reloadKey}') > 0);

// ── 4. 빌드 번호 ────────────────────────────────────────────
const app = JSON.parse(read('app.json')).expo;
check('빌드: ios.buildNumber = 22 · 버전 2.40.0 유지',
  String(app.ios.buildNumber) === '22' && app.version === '2.40.0',
  app.version + ' (' + app.ios.buildNumber + ')');

if (fails) {
  console.log('\n' + fails + ' FAILED');
  process.exit(1);
}
console.log('\nALL OK — build 22');
