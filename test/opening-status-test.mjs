/**
 * test/opening-status-test.mjs — v2.20
 * ─────────────────────────────────────────────────────────────
 * 🕒 영업 상태 배지(openingStatus) · 📝 한줄 메모 초안(memoDraft) · 매장 상세 연결(placeInfo).
 *
 *   · 영업 중 / 브레이크타임(HH:MM까지) / 오늘 휴무 / 영업 종료 / 영업 전 / 미확인
 *   · **한국 시간(Asia/Seoul)** 기준 — 기기 시간대와 무관
 *   · 자정을 넘기는 영업(18:00~02:00) · '매일' 행 · 요일별 행 · 정기휴무 · 임시휴무
 *   · 영업시간 데이터가 없으면 **지어내지 않고** '영업시간 미확인'
 *   · 한줄 메모: 확인된 조각만 · 중복 제거 · 120자 제한
 *
 * 네트워크는 타지 않습니다.
 */
import {
  WEEKDAY_CHARS,
  evaluateOpening,
  hasConfirmedHours,
  isClosedToday,
  minutesOf,
  seoulClock,
  todaySummary,
} from '../src/utils/openingStatus.js';
import {
  MEMO_DRAFT_MAX,
  memoDraftFromPlaceTips,
  memoDraftFromText,
  memoDraftOfParts,
  mergeMemoDrafts,
} from '../src/utils/memoDraft.js';
import { extractKakaoPlaceId, extractNaverPlaceId, needsPlaceInfo, placeInfoPathOf, placeInfoTargetOf } from '../src/services/placeInfo.js';
import { buildPin, normalizePin, withPlaceHours } from '../src/utils/pins.js';
// v2.20 — Gemini 응답의 memo 재료를 추출기가 그대로 받는지 (영상·사진 공통)
import { memoPartsOf } from '../src/services/extractor.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

// ── 픽스처 — 실제 API 응답 모양 그대로 (칸다소바 실제 값) ──────────────
const HOURS_EVERYDAY = {
  source: 'naver',
  days: [
    {
      day: '매일',
      start: '11:30',
      end: '21:30',
      closed: false,
      breaks: [{ start: '15:30', end: '17:00' }],
      lastOrder: [{ type: '영업시간', time: '21:00' }],
      endsNextDay: false,
      note: '',
    },
  ],
  closedDays: [],
  closedDates: [],
  hasHours: true,
};

const HOURS_WEEKDAY = {
  source: 'kakao',
  days: [
    { day: '화', start: '11:00', end: '22:00', closed: false, breaks: [], lastOrder: [], endsNextDay: false },
    { day: '수', start: '11:00', end: '22:00', closed: false, breaks: [], lastOrder: [], endsNextDay: false },
  ],
  closedDays: ['월'],
  closedDates: [],
  hasHours: true,
};

const at = (iso) => new Date(iso);

// ── 1. 시계 — 한국 시간 ────────────────────────────────────────────
const clock = seoulClock(at('2026-11-17T06:30:00Z')); // 15:30 KST 화요일
check('시계: UTC 06:30 → 한국 15:30', clock.minutes === 15 * 60 + 30 && clock.hhmm === '15:30', JSON.stringify(clock));
check('시계: 요일 화요일', clock.day === '화', clock.day);
check('시계: 날짜 2026-11-17', clock.date === '2026-11-17', clock.date);
check("시계: 'HH:MM' 파싱", minutesOf('09:05') === 545 && minutesOf('24:00') === 1440 && minutesOf('9시') === null);
check('시계: 요일표 월~일', WEEKDAY_CHARS.join('') === '일월화수목금토', WEEKDAY_CHARS.join(''));

// ── 2. 영업 상태 배지 ─────────────────────────────────────────────
const open = evaluateOpening(HOURS_EVERYDAY, at('2026-11-17T03:00:00Z')); // 12:00 KST
check('배지: 12:00 → 🟢 영업 중', open.state === 'open' && open.text === '🟢 영업 중', JSON.stringify(open));
check('배지: 영업 중이면 sub 에 마감 시각', open.sub.indexOf('21:30') >= 0, open.sub);

const breakTime = evaluateOpening(HOURS_EVERYDAY, at('2026-11-17T06:45:00Z')); // 15:45 KST
check(
  '배지: 15:45 → 🟠 브레이크타임 (17:00까지)',
  breakTime.state === 'break' && breakTime.text === '🟠 브레이크타임 (17:00까지)' && breakTime.breakUntil === '17:00',
  JSON.stringify(breakTime)
);

const breakStart = evaluateOpening(HOURS_EVERYDAY, at('2026-11-17T06:30:00Z')); // 15:30 KST = 시작
check('배지: 브레이크 시작 시각(15:30)도 브레이크타임', breakStart.state === 'break', breakStart.state);

const afterBreak = evaluateOpening(HOURS_EVERYDAY, at('2026-11-17T08:00:00Z')); // 17:00 KST = 끝
check('배지: 브레이크 끝(17:00) → 다시 영업 중', afterBreak.state === 'open', afterBreak.state);

const before = evaluateOpening(HOURS_EVERYDAY, at('2026-11-17T02:00:00Z')); // 11:00 KST
check('배지: 11:00 → ⚪ 영업 전 (11:30 오픈)', before.state === 'before' && before.text === '⚪ 영업 전 (11:30 오픈)', before.text);

const closed = evaluateOpening(HOURS_EVERYDAY, at('2026-11-17T13:00:00Z')); // 22:00 KST
check('배지: 22:00 → ⚪ 영업 종료', closed.state === 'closed' && closed.text === '⚪ 영업 종료', closed.text);

const lastOrderPassed = evaluateOpening(HOURS_EVERYDAY, at('2026-11-17T12:10:00Z')); // 21:10 KST
check('배지: 라스트오더(21:00) 지난 뒤 안내', lastOrderPassed.state === 'open' && lastOrderPassed.sub.indexOf('라스트오더') >= 0, lastOrderPassed.sub);

// 요일별 · 정기휴무
const tuesday = evaluateOpening(HOURS_WEEKDAY, at('2026-11-17T04:00:00Z')); // 13:00 KST 화
check('배지: 요일별 행(화 11:00~22:00) → 영업 중', tuesday.state === 'open', tuesday.state);
const monday = evaluateOpening(HOURS_WEEKDAY, at('2026-11-16T04:00:00Z')); // 13:00 KST 월
check('배지: 정기휴무(월) → 🔴 오늘 휴무', monday.state === 'closedToday' && monday.text === '🔴 오늘 휴무', JSON.stringify(monday));
check('배지: 휴무일이면 sub 에 다음 영업', monday.sub.indexOf('다음 영업') >= 0, monday.sub);

// 임시휴무 날짜
const tempClosed = evaluateOpening({ ...HOURS_EVERYDAY, closedDates: ['2026-11-17'] }, at('2026-11-17T04:00:00Z'));
check('배지: 임시휴무 날짜 → 오늘 휴무', tempClosed.state === 'closedToday', tempClosed.state);

// 자정 넘김 (18:00~02:00)
const overnight = {
  days: [{ day: '매일', start: '18:00', end: '02:00', closed: false, breaks: [], lastOrder: [], endsNextDay: true }],
  closedDays: [],
  closedDates: [],
  hasHours: true,
};
const lateNight = evaluateOpening(overnight, at('2026-11-17T16:30:00Z')); // 01:30 KST
check('배지: 자정 넘김(18:00~02:00) 01:30 → 영업 중', lateNight.state === 'open', lateNight.state);
const eveningGap = evaluateOpening(overnight, at('2026-11-17T08:00:00Z')); // 17:00 KST
check('배지: 자정 넘김 17:00 → 영업 전', eveningGap.state === 'before', eveningGap.state);

// 미확인 — 절대 지어내지 않음
check('미확인: null → 영업시간 미확인', evaluateOpening(null).text === '⚪ 영업시간 미확인');
check('미확인: hasHours=false', evaluateOpening({ hasHours: false, days: [] }).state === 'unknown');
check('미확인: 빈 days', evaluateOpening({ days: [], closedDays: [], hasHours: true }).state === 'unknown');
check('미확인: hasConfirmedHours', hasConfirmedHours(HOURS_EVERYDAY) && !hasConfirmedHours(null) && !hasConfirmedHours({ days: [] }));

// 오늘 요약
const summary = todaySummary(HOURS_EVERYDAY, at('2026-11-17T03:00:00Z'));
check(
  '요약: 오늘 11:30~21:30 · 브레이크 15:30~17:00 · 라스트오더 21:00',
  summary === '오늘 11:30~21:30 · 브레이크 15:30~17:00 · 라스트오더 21:00',
  summary
);
check('요약: 휴무일은 "오늘 휴무"', todaySummary(HOURS_WEEKDAY, at('2026-11-16T04:00:00Z')) === '오늘 휴무');
check('요약: 영업시간 없으면 빈 문자열', todaySummary(null) === '');

// ── 3. 한줄 메모 초안 ─────────────────────────────────────────────
const fullDraft = memoDraftOfParts({
  recommendedMenu: '고추삼선간짜장',
  parking: '주차 불가',
  kids: '아기의자 있음',
  waiting: '웨이팅 있음',
});
check(
  '메모: 네 조각이 " · " 로 이어짐',
  fullDraft === '추천: 고추삼선간짜장 · 주차 불가 · 아기의자 있음 · 웨이팅 있음',
  fullDraft
);
check('메모: 재료가 없으면 빈 문자열', memoDraftOfParts({}) === '' && memoDraftOfParts() === '');
check('메모: 추천 메뉴 배열은 첫 항목', memoDraftOfParts({ recommendedMenu: ['마제소바', '지로케'] }) === '추천: 마제소바');
check('메모: 120자 제한', memoDraftOfParts({ parking: '주차 불가' }).length <= MEMO_DRAFT_MAX);

const textDraft = memoDraftFromText(
  '성수동 맛집 다녀왔어요\n추천 메뉴: 마제소바\n주차 불가\n아기의자 있음\n웨이팅 20분'
);
check(
  '메모(설명글): 표식 붙은 값만 뽑음',
  textDraft.indexOf('추천: 마제소바') >= 0 &&
    textDraft.indexOf('주차 불가') >= 0 &&
    textDraft.indexOf('아기의자 있음') >= 0 &&
    textDraft.indexOf('웨이팅 있음') >= 0,
  textDraft
);
check('메모(설명글): 정보가 없으면 빈 문자열', memoDraftFromText('그냥 맛있었어요 다음에 또 갈게요') === '');
check('메모(설명글): 주차 없음 → 주차 불가', memoDraftFromText('주차장 없음') === '주차 불가');
check('메모(설명글): 무료 주차', memoDraftFromText('주차 무료') === '무료 주차');
check('메모(설명글): 노키즈존', memoDraftFromText('노키즈존입니다') === '노키즈존');

check(
  '메모(매장정보): 추천 메뉴 · 주차',
  memoDraftFromPlaceTips({ recommendedMenu: ['지로케 라멘', '마제소바'], parking: '주차 불가' }) ===
    '추천: 지로케 라멘 · 주차 불가'
);
check(
  '메모 합치기: 같은 종류는 앞의 것 유지',
  mergeMemoDrafts('추천: 마제소바 · 웨이팅 있음', '추천: 지로케 라멘 · 주차 불가') ===
    '추천: 마제소바 · 웨이팅 있음 · 주차 불가',
  mergeMemoDrafts('추천: 마제소바 · 웨이팅 있음', '추천: 지로케 라멘 · 주차 불가')
);
check('메모 합치기: 한쪽이 비면 다른 쪽', mergeMemoDrafts('', '주차 불가') === '주차 불가');

// ── 4. 매장 상세 연결 (placeInfo) ─────────────────────────────────
check('매장: 네이버 placeId 그대로', extractNaverPlaceId('1736095566') === '1736095566');
check(
  '매장: 네이버 링크에서 placeId',
  extractNaverPlaceId('https://m.place.naver.com/restaurant/1736095566/home') === '1736095566' &&
    extractNaverPlaceId('https://map.naver.com/p/entry/place/1736095566?lng=1') === '1736095566'
);
check('매장: 카카오 placeUrl 에서 id', extractKakaoPlaceId('http://place.map.kakao.com/2057792795') === '2057792795');
check('매장: id 없는 링크는 빈 문자열', extractNaverPlaceId('https://blog.naver.com/x') === '' && extractKakaoPlaceId('https://instagram.com') === '');

const naverPin = { naverPlaceId: '', placeUrl: 'https://m.place.naver.com/place/1736095566/home' };
const kakaoPin = { naverPlaceId: '', placeUrl: 'http://place.map.kakao.com/2057792795' };
check('매장: 네이버 핀 → naver 대상', JSON.stringify(placeInfoTargetOf(naverPin)) === '{"provider":"naver","id":"1736095566"}');
check('매장: 카카오 핀 → kakao 대상', JSON.stringify(placeInfoTargetOf(kakaoPin)) === '{"provider":"kakao","id":"2057792795"}');
check('매장: id 없으면 null (요청 안 함)', placeInfoTargetOf({ name: '어딘가' }) === null);
check(
  '매장: 프록시 경로',
  placeInfoPathOf(placeInfoTargetOf(naverPin)) === '/api/naver-place?id=1736095566' &&
    placeInfoPathOf(placeInfoTargetOf(kakaoPin)) === '/api/kakao-place?id=2057792795'
);
check('매장: 6시간 지나면 다시 확인', needsPlaceInfo(kakaoPin, Date.now()) === true);
check(
  '매장: 방금 확인했으면 다시 안 부름',
  needsPlaceInfo({ ...kakaoPin, hours: HOURS_EVERYDAY, hoursCheckedAt: new Date().toISOString() }, Date.now()) === false
);

// ── 5. 핀에 영업시간 저장 ─────────────────────────────────────────
const pin = buildPin({ name: '칸다소바', category: '맛집', lat: 37.5, lng: 127 }, { platform: 'search' });
check('핀: 새 핀은 hours null (미확인)', pin.hours === null && pin.hoursCheckedAt === '');
const withHours = withPlaceHours(pin, { hours: HOURS_EVERYDAY, hoursCheckedAt: '2026-11-17T00:00:00.000Z', hoursName: '칸다소바' });
check(
  '핀: withPlaceHours 가 영업시간·확인시각을 담음',
  withHours.hours && withHours.hours.days.length === 1 && withHours.hoursCheckedAt === '2026-11-17T00:00:00.000Z',
  JSON.stringify(withHours.hoursCheckedAt)
);
check('핀: 영업시간은 updatedAt 을 건드리지 않음 (클라우드 동기화 대상 아님)', !withHours.updatedAt);
check('핀: 예전 핀(v2.19) 정규화에도 hours 기본값', normalizePin({ name: '옛 핀', id: 'p1' }).hours === null);

// ── 6. Gemini memo 재료 → 추출기 ────────────────────────────────────
const geminiParts = memoPartsOf({
  storeName: '착한부대찌개',
  memo: { recommendedMenu: '부대찌개', parking: '', kidsOrWaitingTip: '웨이팅 있음' },
});
check(
  'AI: memo 세 칸을 그대로 받음 (빈 칸은 빈 문자열)',
  geminiParts.recommendedMenu === '부대찌개' && geminiParts.parking === '' && geminiParts.kidsOrWaitingTip === '웨이팅 있음',
  JSON.stringify(geminiParts)
);
check('AI: memo 가 없으면 전부 빈 문자열 (지어내지 않음)', JSON.stringify(memoPartsOf({})) === '{"recommendedMenu":"","parking":"","kidsOrWaitingTip":""}');
check(
  'AI: 최상위 필드로 와도 받아 줌',
  memoPartsOf({ recommendedMenu: '마제소바', parking: '주차 불가' }).parking === '주차 불가'
);
check(
  'AI: 초안이 실제 한줄 메모로',
  memoDraftOfParts(geminiParts) === '추천: 부대찌개 · 웨이팅 있음',
  memoDraftOfParts(geminiParts)
);

if (fails) {
  console.log('\nHOURS_TEST_FAILED=' + fails);
  process.exit(1);
}
console.log('\nHOURS_TEST_OK');
