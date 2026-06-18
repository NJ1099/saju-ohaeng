// ============================================================
//  saju · engine/saju.js
//  생년월일시(양/음력) → 사주 4기둥(년·월·일·시주) 산출.
//  - 년주: 입춘(立春) 절입 기준
//  - 월주: 절기(節) 태양황경 + 오호둔
//  - 일주: 율리우스일수 60갑자 (앵커 2000-01-07=갑자, 검증됨)
//  - 시주: 오서둔 + 진태양시·자시 경계
//  - 진태양시: KST 표준시 역사 + 경도 보정 + 균시차
// ============================================================

import {
  toJD, fromJD, jdnFromYMD, solarTermJD, sunLongitudeAtUT, deltaT,
  decimalYear, mod360,
} from './astro.js';
import { lunarToSolar, solarToLunar } from './lunar.js';
import {
  STEMS, BRANCHES, monthStemStart, hourStemStart,
  hourBranchIndex, monthBranchFromLongitude, ganjiFromIndex, ganjiIndex,
  HOUR_RANGES, SOLAR_TERMS,
} from './constants.js';

const DEG = Math.PI / 180;

// 대한민국 표준시 변경 이력 (research wq2fymeyx, 국가기록원·IANA tzdb)
const KST_PERIODS = [
  { start: [1908, 4, 1], end: [1911, 12, 31], offsetMin: 510, meridian: 127.5 },
  { start: [1912, 1, 1], end: [1954, 3, 20], offsetMin: 540, meridian: 135 },
  { start: [1954, 3, 21], end: [1961, 8, 9], offsetMin: 510, meridian: 127.5 },
  { start: [1961, 8, 10], end: [9999, 12, 31], offsetMin: 540, meridian: 135 },
];
// 서머타임(일광절약) 구간 — 이 구간 출생자는 시계가 +1h 앞당겨져 있었음.
const DST_WINDOWS = [
  ['1948-06-01', '1948-09-13'], ['1949-04-03', '1949-09-11'], ['1950-04-01', '1950-09-10'],
  ['1951-05-06', '1951-09-09'], ['1955-05-05', '1955-09-09'], ['1956-05-20', '1956-09-30'],
  ['1957-05-05', '1957-09-22'], ['1958-05-04', '1958-09-21'], ['1959-05-03', '1959-09-20'],
  ['1960-05-01', '1960-09-18'], ['1987-05-10', '1987-10-11'], ['1988-05-08', '1988-10-09'],
];
const SEOUL_LON = 126.9784;

function ymdNum(y, m, d) { return y * 10000 + m * 100 + d; }

/** 해당 양력 날짜의 법정 표준시 offset(분)·표준자오선. */
function legalOffset(y, m, d) {
  const n = ymdNum(y, m, d);
  for (const p of KST_PERIODS) {
    const s = ymdNum(...p.start), e = ymdNum(...p.end);
    if (n >= s && n <= e) return { offsetMin: p.offsetMin, meridian: p.meridian };
  }
  // 1908 이전: 서울 지방평균시 근사 (UTC+8:27)
  return { offsetMin: Math.round(SEOUL_LON * 4), meridian: SEOUL_LON };
}

/** 해당 양력 날짜가 서머타임 구간이면 true. */
function inDST(y, m, d) {
  const n = ymdNum(y, m, d);
  return DST_WINDOWS.some(([a, b]) => {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return n >= ymdNum(ay, am, ad) && n <= ymdNum(by, bm, bd);
  });
}

/** 균시차(Equation of Time), 분. apparent = mean + EoT. Meeus 기반. */
function equationOfTime(jde) {
  const T = (jde - 2451545.0) / 36525;
  const L0 = mod360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * DEG;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const sunLon = L0 + C;
  const omega = (125.04 - 1934.136 * T) * DEG;
  const lambda = (sunLon - 0.00569 - 0.00478 * Math.sin(omega)) * DEG;
  const eps = (23.439291 - 0.0130042 * T) * DEG;
  let alpha = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / DEG;
  alpha = mod360(alpha);
  let E = L0 - 0.0057183 - alpha;
  E = ((E + 180) % 360 + 360) % 360 - 180;
  return E * 4;
}

function pillar(idx) {
  const g = ganjiFromIndex(idx);
  return { ...g, ganjiIndex: ((idx % 60) + 60) % 60 };
}

/**
 * 사주 4기둥 산출.
 * @param {object} input
 *  - calendar: 'solar' | 'lunar'
 *  - year, month, day : 생년월일 (양력 또는 음력)
 *  - isLeapMonth : 음력 윤달 여부 (calendar==='lunar')
 *  - hour, minute : 출생 시각 (없으면 hour=null → 시주 미상)
 *  - gender : '남' | '여'
 *  - name : 이름(선택)
 *  - options:
 *      trueSolarTime(bool, def true) — 진태양시(경도) 보정
 *      longitude(number, def 서울) — 출생지 경도
 *      equationOfTime(bool, def true) — 균시차 보정
 *      useDST(bool, def true) — 서머타임 자동 보정
 *      dayBoundary('자시'|'자정', def '자시') — 일주 경계 학설
 * @returns {object} 전체 사주 결과
 */
export function computeSaju(input) {
  const opt = {
    trueSolarTime: true, longitude: SEOUL_LON, equationOfTime: true,
    useDST: true, dayBoundary: '자시', ...(input.options || {}),
  };

  // 1) 음력이면 양력으로 변환
  let sy = input.year, sm = input.month, sd = input.day;
  let lunarInfo = null;
  if (input.calendar === 'lunar') {
    const conv = lunarToSolar(input.year, input.month, !!input.isLeapMonth, input.day);
    if (!conv) {
      return { error: `음력 ${input.year}년 ${input.isLeapMonth ? '윤' : ''}${input.month}월은 존재하지 않습니다. 윤달 여부를 확인하세요.` };
    }
    // 라운드트립 검증 — 음력 일자가 그 달 길이를 넘었는지 확인
    const back = solarToLunar(conv.year, conv.month, conv.day);
    if (!back || back.lunarMonth !== input.month || back.lunarDay !== input.day || back.isLeap !== !!input.isLeapMonth) {
      return { error: `음력 ${input.year}년 ${input.isLeapMonth ? '윤' : ''}${input.month}월 ${input.day}일은 존재하지 않는 날짜입니다. (그 달은 ${input.day - 1 > 28 ? '29일 또는 30일까지' : ''} 있습니다)` };
    }
    lunarInfo = { lunarYear: input.year, lunarMonth: input.month, lunarDay: input.day, isLeap: !!input.isLeapMonth };
    sy = conv.year; sm = conv.month; sd = conv.day;
  }

  const hasTime = input.hour !== null && input.hour !== undefined && input.hour !== '';
  const clockH = hasTime ? Number(input.hour) : 12;
  const clockM = hasTime ? Number(input.minute || 0) : 0;

  // 2) 출생 순간의 UT 율리우스일 (법정 표준시 offset, 서머타임 포함)
  const { offsetMin, meridian } = legalOffset(sy, sm, sd);
  const dstOn = opt.useDST && inDST(sy, sm, sd);
  const effOffsetMin = offsetMin + (dstOn ? 60 : 0); // 서머타임이면 시계가 +1h
  const jdLocalAsUT = toJD(sy, sm, sd, clockH, clockM, 0);
  const jdUT = jdLocalAsUT - effOffsetMin / 1440;
  const dY = decimalYear(sy, sm);

  // 3) 년주 — 입춘(315°) 절입 순간과 비교
  const ipchunJD = solarTermJD(sy, 315); // 그 해 입춘(UT)
  const sajuYear = jdUT < ipchunJD ? sy - 1 : sy;
  const yIdx = (((sajuYear - 4) % 10) + 10) % 10;
  const yBranch = (((sajuYear - 4) % 12) + 12) % 12;
  const yearPillar = pillar(ganjiIndex(yIdx, yBranch));

  // 4) 월주 — 출생 순간 태양황경 → 월지, 오호둔 → 월간
  const lon = sunLongitudeAtUT(jdUT, dY);
  const monthBranchIdx = monthBranchFromLongitude(lon);
  const sectorFromIn = (monthBranchIdx - 2 + 12) % 12; // 寅(2)부터의 섹터
  const monthStemIdx = (monthStemStart(yearPillar.stemIdx) + sectorFromIn) % 10;
  const monthPillar = pillar(ganjiIndex(monthStemIdx, monthBranchIdx));

  // 5) 진태양시 보정 (시주·일주 경계용 — 물리적 instant인 년/월과 무관)
  let corrMin = 0;
  let eotMin = 0;
  if (opt.trueSolarTime) {
    corrMin += (opt.longitude - meridian) * 4; // 경도 보정 (서울 약 −32분)
  }
  if (opt.trueSolarTime && opt.equationOfTime) {
    eotMin = equationOfTime(jdUT + deltaT(dY) / 86400);
    corrMin += eotMin;
  }
  // 서머타임 제거: 시계에서 −60분 (보정 후 표준시각화)
  const dstAdjMin = dstOn ? -60 : 0;
  const totalClockMin = clockH * 60 + clockM + dstAdjMin + corrMin;

  // 6) 일주·시주 — 보정된 지방시 기준
  let dayShift = Math.floor(totalClockMin / 1440);
  let normMin = totalClockMin - dayShift * 1440; // 0..1439
  let dayJDN = jdnFromYMD(sy, sm, sd) + dayShift;
  // 정자시(子時)설: 23:00~24:00 출생은 익일 일주로 넘김
  if (opt.dayBoundary === '자시' && normMin >= 1380) dayJDN += 1;
  const dayIdx = ((dayJDN - 11) % 60 + 60) % 60;
  const dayPillar = pillar(dayIdx);

  let hourPillar = null;
  let hourBranchIdx = null;
  if (hasTime) {
    hourBranchIdx = hourBranchIndex(normMin);
    const hStem = (hourStemStart(dayPillar.stemIdx) + hourBranchIdx) % 10;
    hourPillar = pillar(ganjiIndex(hStem, hourBranchIdx));
  }

  // 7) 현재 절기명 — 출생 황경이 막 지난 절기(가장 가까운 직전 절기)
  const curTerm = SOLAR_TERMS.reduce((best, t) => {
    const d = mod360(lon - t.lon);
    return d < best.d ? { name: t.name, d } : best;
  }, { name: '', d: 999 }).name;

  // 보정 시각 표기 (normMin ∈ [0,1440)). Math.floor로 반올림 오버플로 방지.
  const ch = Math.floor(normMin / 60) % 24;
  const cm = Math.floor(normMin % 60);

  return {
    input: { ...input, name: input.name || '', gender: input.gender || '' },
    solar: { year: sy, month: sm, day: sd, hour: hasTime ? clockH : null, minute: hasTime ? clockM : null },
    lunar: lunarInfo,
    sajuYear,
    pillars: {
      year: yearPillar, month: monthPillar, day: dayPillar, hour: hourPillar,
    },
    ilgan: dayPillar.kor[0], // 일간 (한글 천간)
    ilganHanja: dayPillar.hanja[0],
    hourBranchIdx,
    hourRange: hasTime ? HOUR_RANGES[hourBranchIdx] : null,
    solarLongitude: lon,
    currentTerm: curTerm,
    jdUT, // 출생 순간 UT 율리우스일 (대운수 계산용)
    decYear: dY,
    corrections: {
      legalOffsetMin: offsetMin, meridian, dstApplied: dstOn,
      longitudeCorrMin: opt.trueSolarTime ? +((opt.longitude - meridian) * 4).toFixed(1) : 0,
      eotMin: +eotMin.toFixed(1),
      correctedTime: hasTime ? `${String((ch + 24) % 24).padStart(2, '0')}:${String((cm + 60) % 60).padStart(2, '0')}` : null,
      dayBoundary: opt.dayBoundary,
      trueSolarTime: opt.trueSolarTime,
    },
    options: opt,
  };
}

/** 4기둥을 "성별 / 년주 / 월주 / 일주 / 시주" 텍스트로 (프롬프트·표시용). */
export function pillarsText(result, withHanja = true) {
  const p = result.pillars;
  const fmt = (x) => (x ? (withHanja ? `${x.kor}(${x.hanja})` : x.kor) : '미상');
  return {
    year: fmt(p.year), month: fmt(p.month), day: fmt(p.day), hour: fmt(p.hour),
  };
}
