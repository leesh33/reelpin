import React from 'react';
import { renderToString } from 'react-dom/server';
import MapScreen from '../src/screens/MapScreen';
import PasteScreen from '../src/screens/PasteScreen';
import ProfileScreen from '../src/screens/ProfileScreen';
import PinDetailSheet from '../src/components/PinDetailSheet';
import GeofenceBanner from '../src/components/GeofenceBanner';
import FilterChips from '../src/components/FilterChips';
import TabBar from '../src/components/TabBar';
import MapCanvas from '../src/components/MapCanvas';
import { SEED_PINS } from '../src/data/seedPins';

const noop = () => {};

const cases = [
  ['MapScreen', <MapScreen pins={SEED_PINS} selectedPinId={SEED_PINS[0].id} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} />],
  ['MapScreen(empty)', <MapScreen pins={[]} selectedPinId={null} onSelectPin={noop} radiusMeters={500} onGoPaste={noop} onDeletePin={noop} onToast={noop} />],
  ['PasteScreen', <PasteScreen active pinCount={4} isPro={false} onSaved={noop} onClose={noop} onGoProfile={noop} onToast={noop} />],
  ['PasteScreen(limit)', <PasteScreen active pinCount={10} isPro={false} onSaved={noop} onClose={noop} onGoProfile={noop} onToast={noop} />],
  ['ProfileScreen', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} />],
  ['PinDetailSheet', <PinDetailSheet pin={SEED_PINS[0]} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />],
  ['GeofenceBanner', <GeofenceBanner pin={SEED_PINS[0]} radiusMeters={1000} onPress={noop} />],
  ['GeofenceBanner(empty)', <GeofenceBanner pin={null} radiusMeters={300} onPress={noop} empty />],
  ['FilterChips', <FilterChips value="전체" onChange={noop} counts={{ 전체: 4 }} />],
  ['TabBar', <TabBar active="map" onChange={noop} />],
  ['MapCanvas', <MapCanvas pins={SEED_PINS} selectedId={SEED_PINS[0].id} onSelect={noop} radius={300} />],
];

let failed = 0;
for (const [label, element] of cases) {
  try {
    const html = renderToString(element);
    if (!html || html.length < 20) throw new Error('empty output');
    console.log('OK   ' + label + '  (' + html.length + ' chars)');
  } catch (err) {
    failed += 1;
    console.log('FAIL ' + label + '  -> ' + (err && err.message));
  }
}
if (failed) { console.log('SMOKE_FAILED=' + failed); process.exit(1); }
console.log('SMOKE_OK ' + cases.length + '/' + cases.length);
