/**
 * utils/openingStatus.js (v2.20)
 * ─────────────────────────────────────────────────────────────
 * 매장 영업시간을 **지금 이 순간(한국 시간)** 기준 상태 배지로 바꿉니다.
 *
 *   🟢 영업 중             … 오늘 영업시간 안
 *   🟠 브레이크타임 (17:00까지) … 브레이크타임 안
 *   🔴 오늘 휴무            … 정기휴무 요일 · 임시휴무 날짜
 *   ⚪ 영업 종료            … 오늘 영업이 끝남
 *   ⚪ 영업 전 (11:30 오픈)  … 아직 열기 전
 *   ⚪ 영업시간 미확인       … 영업시간 데이터가 없음 (**절대 추측하지 않습니다**)
 *
 * 입력 `hours` 는 `api/naver-place.js` · `api/kakao-place.js` 가 돌려주는 모양입니다.
 *   { days:[{day:'화'|'매일', start:'11:30', end:'21:30', closed:false,
 *            breaks:[{start:'15:30', end:'17:00'}], lastOrder:[{type, time}], endsNextDay:false}],
 *     closedDays:['화'], closedDates:['2026-11-20'], hasHours:true }
 *
 * 모든 계산은 **순수 함수**입니다 — 시간은 인자로 받아 테스트에서 고정할 수 있습니다.
 */

export const SEOUL_TIME_ZONE = 'Asia/Seoul';
export const WEEKDAY_CHARS = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAY_FROM_EN = {
  Sun: '일',
  Mon: '월',
  Tue: '화',
  Wed: '수',
  Thu: '목',
  Fri: '금',
  Sat: '토',
};

/** 'HH:MM' → 자정부터의 분. 형식이 아니면 null */
export function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm == null ? '' : hhmm).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (mi > 59) return null;
  // '24:00' 은 자정 마감 표기라 1440분으로 받아 줍니다. (그 밖의 24시 이후는 거부)
  if (h === 24 && mi === 0) return 24 * 60;
  if (h > 23) return null;
  return h * 60 + mi;
}

/**
 * 지금 시각을 **한국 시간**의 { day:'화', minutes: 95, date:'2026-11-17', hhmm:'01:35' } 로.
 *   · 기기 시간대가 무엇이든 매장 영업시간은 한국 시간 기준이라 Intl 로 서울 시간을 읽습니다.
 *   · Intl 이 없는 아주 오래된 런타임은 UTC+9 로 계산합니다. (한국은 서머타임 없음)
 */
export function seoulClock(now) {
  const date = now instanceof Date ? now : now ? new Date(now) : new Date();
  const at = Number.isNaN(date.getTime()) ? new Date() : date;
  try {
    if (typeof Intl === 'object' && typeof Intl.DateTimeFormat === 'function') {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: SEOUL_TIME_ZONE,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(at);
      const bag = {};
      parts.forEach((p) => {
        bag[p.type] = p.value;
      });
      const hour = Number(bag.hour) % 24;
      const minute = Number(bag.minute);
      if (Number.isFinite(hour) && Number.isFinite(minute)) {
        const day = WEEKDAY_FROM_EN[bag.weekday] || '';
        return {
          day,
          minutes: hour * 60 + minute,
          date: bag.year + '-' + bag.month + '-' + bag.day,
          hhmm: String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0'),
        };
      }
    }
  } catch (e) {
    /* 아래 UTC+9 폴백으로 */
  }
  const seoul = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  const hour = seoul.getUTCHours();
  const minute = seoul.getUTCMinutes();
  return {
    day: WEEKDAY_CHARS[seoul.getUTCDay()],
    minutes: hour * 60 + minute,
    date:
      seoul.getUTCFullYear() +
      '-' +
      String(seoul.getUTCMonth() + 1).padStart(2, '0') +
      '-' +
      String(seoul.getUTCDate()).padStart(2, '0'),
    hhmm: String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0'),
  };
}

/** 영업시간 데이터가 실제로 있는가 (없으면 배지를 그리지 않습니다) */
export function hasConfirmedHours(hours) {
  if (!hours || typeof hours !== 'object') return false;
  if (hours.hasHours === false) return false;
  const days = Array.isArray(hours.days) ? hours.days : [];
  const closed = Array.isArray(hours.closedDays) ? hours.closedDays : [];
  return days.length > 0 || closed.length > 0;
}

/** 오늘의 영업 행 — 요일 행이 있으면 그것, 없으면 '매일' 행 */
export function todaySchedule(hours, clock) {
  const days = (hours && Array.isArray(hours.days) ? hours.days : []).filter(Boolean);
  if (!days.length) return null;
  const day = (clock && clock.day) || '';
  const exact = days.find((d) => d.day === day);
  if (exact) return exact;
  return days.find((d) => d.day === '매일') || null;
}

/** 오늘 휴무인가 — 정기휴무 요일 · 임시휴무 날짜 · 오늘 행이 닫힘 */
export function isClosedToday(hours, clock) {
  if (!hours) return false;
  const closedDays = Array.isArray(hours.closedDays) ? hours.closedDays : [];
  if (clock && clock.day && closedDays.indexOf(clock.day) >= 0) return true;
  const closedDates = Array.isArray(hours.closedDates) ? hours.closedDates : [];
  if (clock && clock.date && closedDates.indexOf(clock.date) >= 0) return true;
  const row = todaySchedule(hours, clock);
  return Boolean(row && row.closed === true);
}

/** 분이 [start, end) 안인가. 자정을 넘기는 영업(18:00~02:00)도 처리합니다. */
export function isWithin(minutes, start, end) {
  const from = minutesOf(start);
  const to = minutesOf(end);
  if (minutes == null || from == null || to == null) return false;
  if (from === to) return false;
  if (from < to) return minutes >= from && minutes < to;
  return minutes >= from || minutes < to;
}

/** 'HH:MM' 그대로 (없으면 '') */
function hm(value) {
  return String(value == null ? '' : value).trim();
}

/** 브레이크타임 중이면 그 브레이크 { start, end }, 아니면 null */
export function currentBreak(row, minutes) {
  const breaks = row && Array.isArray(row.breaks) ? row.breaks : [];
  for (const b of breaks) {
    if (!b || !b.start || !b.end) continue;
    if (isWithin(minutes, b.start, b.end)) return b;
  }
  return null;
}

/**
 * 오늘 영업시간 요약 — "오늘 11:30~21:30 · 브레이크 15:30~17:00 · 라스트오더 21:00"
 * 영업시간이 없으면 '' (화면은 이때 요약 줄을 그리지 않습니다)
 */
export function todaySummary(hours, now) {
  if (!hasConfirmedHours(hours)) return '';
  const clock = seoulNow(now);
  if (isClosedToday(hours, clock)) return '오늘 휴무';
  const row = todaySchedule(hours, clock);
  if (!row || row.closed || (!row.start && !row.end)) return '오늘 영업시간 정보 없음';
  const span = '오늘 ' + hm(row.start) + '~' + hm(row.end);
  const parts = [span];
  const firstBreak = (Array.isArray(row.breaks) ? row.breaks : [])[0];
  if (firstBreak && firstBreak.start && firstBreak.end) {
    parts.push('브레이크 ' + firstBreak.start + '~' + firstBreak.end);
  }
  const last = (Array.isArray(row.lastOrder) ? row.lastOrder : []).filter((t) => t && t.time);
  if (last.length) parts.push('라스트오더 ' + last[last.length - 1].time);
  return parts.join(' · ');
}

/** now 인자 정규화 — Date/문자열/숫자 모두 허용 */
function seoulNow(now) {
  return seoulClock(now);
}

/**
 * 지금 영업 상태.
 * @param {object|null} hours  api/naver-place · api/kakao-place 의 hours
 * @param {Date|string|number} [now]  테스트·미리보기용 시각 (기본: 지금)
 * @returns {{state:string, emoji:string, label:string, detail:string, text:string,
 *            sub:string, tone:string, breakUntil:string, schedule:object|null}}
 */
export function evaluateOpening(hours, now) {
  const clock = seoulNow(now);
  const unknown = {
    state: 'unknown',
    emoji: '⚪',
    label: '영업시간 미확인',
    detail: '',
    text: '⚪ 영업시간 미확인',
    sub: '',
    tone: 'muted',
    breakUntil: '',
    schedule: null,
  };
  if (!hasConfirmedHours(hours)) return unknown;

  if (isClosedToday(hours, clock)) {
    const next = (hours.days || []).find((d) => d && !d.closed && d.start && d.day !== clock.day);
    return {
      state: 'closedToday',
      emoji: '🔴',
      label: '오늘 휴무',
      detail: '',
      text: '🔴 오늘 휴무',
      sub: next ? '다음 영업 ' + next.day + ' ' + next.start + '~' + next.end : '오늘은 문을 닫아요',
      tone: 'closed',
      breakUntil: '',
      schedule: null,
    };
  }

  const row = todaySchedule(hours, clock);
  if (!row || row.closed || (!row.start && !row.end)) return unknown;

  const minutes = clock.minutes;
  const start = minutesOf(row.start);
  const end = minutesOf(row.end);
  const openNow = isWithin(minutes, row.start, row.end);
  const breakNow = openNow ? currentBreak(row, minutes) : null;

  if (breakNow) {
    return {
      state: 'break',
      emoji: '🟠',
      label: '브레이크타임',
      detail: '(' + breakNow.end + '까지)',
      text: '🟠 브레이크타임 (' + breakNow.end + '까지)',
      sub: '오늘 ' + row.start + '~' + row.end,
      tone: 'break',
      breakUntil: breakNow.end,
      schedule: row,
    };
  }

  if (openNow) {
    const last = (Array.isArray(row.lastOrder) ? row.lastOrder : []).filter((t) => t && t.time);
    const lastTime = last.length ? last[last.length - 1].time : '';
    const lastPassed = lastTime && minutesOf(lastTime) != null && minutes >= minutesOf(lastTime);
    return {
      state: 'open',
      emoji: '🟢',
      label: '영업 중',
      detail: '',
      text: '🟢 영업 중',
      sub: lastPassed ? lastTime + ' 라스트오더 지남 · ' + row.end + ' 마감' : row.end + '까지',
      tone: 'open',
      breakUntil: '',
      schedule: row,
    };
  }

  // 열기 전 / 닫은 뒤 — 자정을 넘기는 영업(예: 18:00~02:00)은 범위 계산이 이미 처리합니다.
  const before = start != null && minutes < start && !(end != null && end < start && minutes < end);
  if (before) {
    return {
      state: 'before',
      emoji: '⚪',
      label: '영업 전',
      detail: '(' + row.start + ' 오픈)',
      text: '⚪ 영업 전 (' + row.start + ' 오픈)',
      sub: '오늘 ' + row.start + '~' + row.end,
      tone: 'closed',
      breakUntil: '',
      schedule: row,
    };
  }

  return {
    state: 'closed',
    emoji: '⚪',
    label: '영업 종료',
    detail: '',
    text: '⚪ 영업 종료',
    sub: '오늘 ' + row.start + '~' + row.end,
    tone: 'closed',
    breakUntil: '',
    schedule: row,
  };
}

// v2.28.0 — 반경 500m 알림이 큰 배너(영업 상태 뱃지 포함)에서 3초 한줄 토스트로 바뀌면서
//   `bannerOpeningBadge` 는 걷어냈습니다. 영업 상태 표기는 장소 상세 시트(pin-opening-badge)가 맡습니다.
