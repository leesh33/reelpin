import { parseUrl, isSupportedUrl, extractPlaces, PRESETS } from '../src/services/extractor.js';
import { naverMapAppUrl, naverMapWebUrl, kakaoMapAppUrl, kakaoMapWebUrl, buildShareLink } from '../src/utils/links.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else { fails++; console.log('FAIL ' + label + (extra ? '  -> ' + extra : '')); }
};

check('parse instagram reel', parseUrl('https://www.instagram.com/reel/C8xSg2BpQ1K/').platform === 'instagram');
check('parse youtube shorts', parseUrl('https://www.youtube.com/shorts/9Xk2mQpLz7A').platform === 'youtube');
check('parse youtu.be', parseUrl('https://youtu.be/9Xk2mQpLz7A').platform === 'youtube');
check('parse tiktok', parseUrl('https://www.tiktok.com/@food/video/7301234567890123456').platform === 'tiktok');
check('reject plain text', parseUrl('그냥 텍스트').ok === false);
check('reject http-less', isSupportedUrl('www.instagram.com/reel/abc') === false);

const r1 = await extractPlaces(PRESETS[0].url, { caption: PRESETS[0].caption });
check('preset1 extracts', r1.ok && r1.candidates.length > 0, JSON.stringify(r1).slice(0, 120));
check('preset1 top name', r1.candidates[0].name === '성수동 소금빵집', r1.candidates[0].name);

const r2 = await extractPlaces(PRESETS[1].url, { caption: PRESETS[1].caption });
check('preset2 top name', r2.candidates[0].name === '연남동 딸기 케이크 맛집', r2.candidates[0].name);

const r3 = await extractPlaces(PRESETS[2].url, { caption: PRESETS[2].caption });
check('preset3 top name', r3.candidates[0].name === '아라뱃길 뷰 카페', r3.candidates[0].name);

const r4 = await extractPlaces('https://www.instagram.com/reel/Unknown123/', {});
check('unknown link still returns manual candidate', r4.ok && r4.candidates.length === 1 && r4.candidates[0].manual === true);

const r5 = await extractPlaces('not-a-url', {});
check('invalid url rejected', r5.ok === false);

const pin = { name: '성수동 소금빵집', area: '성수동', lat: 37.5, lng: 127.0 };
check('naver app url', naverMapAppUrl(pin).startsWith('nmap://search?query='), naverMapAppUrl(pin));
check('naver web url', naverMapWebUrl(pin).includes('map.naver.com'), naverMapWebUrl(pin));
check('kakao app url', kakaoMapAppUrl(pin).includes('kakaomap://search?q='), kakaoMapAppUrl(pin));
check('kakao web url', kakaoMapWebUrl(pin).includes('map.kakao.com'), kakaoMapWebUrl(pin));
check('share link', buildShareLink('odol', [{ name: 'A', category: '카페' }], '성수동').includes('https://reelpin.app/m/odol'));

if (fails) { console.log('EXTRACT_FAILED=' + fails); process.exit(1); }
console.log('EXTRACT_OK');
