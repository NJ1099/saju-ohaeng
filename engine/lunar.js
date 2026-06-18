// ============================================================
//  saju · engine/lunar.js
//  음력 ↔ 양력 변환 — Meeus 신월(삭) 공식 + 무중치윤(無中置閏).
//  모든 날짜 비교는 KST 민간일수(정수, =JDN)로 수행해 KASI 관행과 일치.
// ============================================================

import {
  toJD, fromJD, deltaT, solarTermJD, kstDayNumber, mod360,
} from './astro.js';

const DEG = Math.PI / 180;
const SYNODIC = 29.530588861; // 삭망월 평균(일)

/**
 * k번째 신월(삭)의 JDE(TT 기준). Meeus 천문알고리즘 ch.49.
 * k=0 → 2000-01-06 신월. 주기·행성 보정 포함(분 단위 정밀).
 */
function newMoonJDE(k) {
  const T = k / 1236.85;
  let JDE = 2451550.09766 + SYNODIC * k
    + 0.00015437 * T * T - 0.000000150 * T ** 3 + 0.00000000073 * T ** 4;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const M = (2.5534 + 29.10535670 * k - 0.0000014 * T * T - 0.00000011 * T ** 3) * DEG;
  const Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T ** 3 - 0.000000058 * T ** 4) * DEG;
  const F = (160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T ** 3 + 0.000000011 * T ** 4) * DEG;
  const Om = (124.7746 - 1.56375588 * k + 0.0020672 * T * T + 0.00000215 * T ** 3) * DEG;
  const corr = -0.40720 * Math.sin(Mp)
    + 0.17241 * E * Math.sin(M)
    + 0.01608 * Math.sin(2 * Mp)
    + 0.01039 * Math.sin(2 * F)
    + 0.00739 * E * Math.sin(Mp - M)
    - 0.00514 * E * Math.sin(Mp + M)
    + 0.00208 * E * E * Math.sin(2 * M)
    - 0.00111 * Math.sin(Mp - 2 * F)
    - 0.00057 * Math.sin(Mp + 2 * F)
    + 0.00056 * E * Math.sin(2 * Mp + M)
    - 0.00042 * Math.sin(3 * Mp)
    + 0.00042 * E * Math.sin(M + 2 * F)
    + 0.00038 * E * Math.sin(M - 2 * F)
    - 0.00024 * E * Math.sin(2 * Mp - M)
    - 0.00017 * Math.sin(Om)
    - 0.00007 * Math.sin(Mp + 2 * M)
    + 0.00004 * Math.sin(2 * Mp - 2 * F)
    + 0.00004 * Math.sin(3 * M)
    + 0.00003 * Math.sin(Mp + M - 2 * F)
    + 0.00003 * Math.sin(2 * Mp + 2 * F)
    - 0.00003 * Math.sin(Mp + M + 2 * F)
    + 0.00003 * Math.sin(Mp - M + 2 * F)
    - 0.00002 * Math.sin(Mp - M - 2 * F)
    - 0.00002 * Math.sin(3 * Mp + M)
    + 0.00002 * Math.sin(4 * Mp);
  // 추가 보정항 (A1~A14)
  const A1 = (299.77 + 0.107408 * k - 0.009173 * T * T) * DEG;
  const A2 = (251.88 + 0.016321 * k) * DEG;
  const A3 = (251.83 + 26.651886 * k) * DEG;
  const A4 = (349.42 + 36.412478 * k) * DEG;
  const A5 = (84.66 + 18.206239 * k) * DEG;
  const A6 = (141.74 + 53.303771 * k) * DEG;
  const A7 = (207.14 + 2.453732 * k) * DEG;
  const A8 = (154.84 + 7.306860 * k) * DEG;
  const A9 = (34.52 + 27.261239 * k) * DEG;
  const A10 = (207.19 + 0.121824 * k) * DEG;
  const A11 = (291.34 + 1.844379 * k) * DEG;
  const A12 = (161.72 + 24.198154 * k) * DEG;
  const A13 = (239.56 + 25.513099 * k) * DEG;
  const A14 = (331.55 + 3.592518 * k) * DEG;
  const add = 0.000325 * Math.sin(A1) + 0.000165 * Math.sin(A2) + 0.000164 * Math.sin(A3)
    + 0.000126 * Math.sin(A4) + 0.000110 * Math.sin(A5) + 0.000062 * Math.sin(A6)
    + 0.000060 * Math.sin(A7) + 0.000056 * Math.sin(A8) + 0.000047 * Math.sin(A9)
    + 0.000042 * Math.sin(A10) + 0.000040 * Math.sin(A11) + 0.000037 * Math.sin(A12)
    + 0.000035 * Math.sin(A13) + 0.000023 * Math.sin(A14);
  return JDE + corr + add;
}

/** k번째 신월의 KST 민간일수(정수 JDN). TT→UT(ΔT)→KST 환산 후 자정 기준. */
function newMoonKstDay(k) {
  const approxYear = 2000 + k / 12.3685;
  const jdUT = newMoonJDE(k) - deltaT(approxYear) / 86400;
  return kstDayNumber(jdUT);
}

/** dayNum(KST JDN) 이하의 가장 최근 신월 번호 k. */
function priorNewMoonK(dayNum) {
  // 추정 JD(UT) ≈ dayNum - 0.5 - 9/24 (KST 자정의 UT JD)
  const jdApprox = dayNum - 0.5 - 9 / 24;
  let k = Math.round((jdApprox - 2451550.09766) / SYNODIC);
  while (newMoonKstDay(k) > dayNum) k--;
  while (newMoonKstDay(k + 1) <= dayNum) k++;
  return k;
}

/** 동지(冬至, 황경 270°)의 KST 민간일수. year의 12월 동지. */
function winterSolsticeDay(year) {
  return kstDayNumber(solarTermJD(year, 270));
}

/**
 * 해당 sui(동지~동지) 구간에 들어오는 중기(中氣, 황경 30°배수)의 KST 일수 목록.
 * year-1, year, year+1 의 12개 중기를 모아 정렬.
 */
function zhongqiDays(year) {
  const days = [];
  for (let y = year - 1; y <= year + 1; y++) {
    for (let lon = 0; lon < 360; lon += 30) {
      days.push(kstDayNumber(solarTermJD(y, lon)));
    }
  }
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

/**
 * sui(Y) 의 음력 달 목록을 만든다 — 동지(Y-1) 직전 신월(11月)부터
 * 동지(Y) 직전 신월 전까지. 각 원소 {num, isLeap, startDay}.
 */
function buildSui(Y) {
  const wsPrev = winterSolsticeDay(Y - 1);
  const wsThis = winterSolsticeDay(Y);
  const k0 = priorNewMoonK(wsPrev); // 11月 (이전 sui)
  const k1 = priorNewMoonK(wsThis); // 다음 11月
  const total = k1 - k0; // 12(평년) 또는 13(윤년 포함)
  const leap = total === 13;
  const starts = [];
  for (let i = 0; i <= total; i++) starts.push(newMoonKstDay(k0 + i));
  const zq = zhongqiDays(Y);
  const hasZhongqi = (a, b) => zq.some((d) => d >= a && d < b); // [a,b)

  const months = [];
  let num = 11, prevNum = 11, leapDone = false;
  for (let i = 0; i < total; i++) {
    const hz = hasZhongqi(starts[i], starts[i + 1]);
    if (leap && !leapDone && !hz && i > 0) {
      months.push({ num: prevNum, isLeap: true, startDay: starts[i] });
      leapDone = true;
    } else {
      months.push({ num, isLeap: false, startDay: starts[i] });
      prevNum = num;
      num = num === 12 ? 1 : num + 1;
    }
  }
  return months;
}

/** 음력 연도 LY의 모든 달(정월~섣달, 윤달 포함) — 정렬된 {num,isLeap,startDay}. */
export function lunarMonths(LY) {
  const a = buildSui(LY);
  const b = buildSui(LY + 1);
  const out = [];
  for (const m of a) if (m.num >= 1 && m.num <= 10) out.push({ ...m });
  for (const m of b) {
    if (m.num === 11 || m.num === 12) out.push({ ...m });
    else break;
  }
  out.sort((x, y) => x.startDay - y.startDay);
  return out;
}

/** JDN(KST 민간일수) → {year, month, day} 양력. */
function dayNumToSolar(dayNum) {
  const { year, month, day } = fromJD(dayNum);
  return { year, month, day };
}

/**
 * 음력 → 양력.
 * @returns {{year,month,day} | null}  해당 윤달이 없으면 null.
 */
export function lunarToSolar(LY, LM, isLeap, LD) {
  const months = lunarMonths(LY);
  const m = months.find((x) => x.num === LM && x.isLeap === !!isLeap);
  if (!m) return null;
  return dayNumToSolar(m.startDay + (LD - 1));
}

/**
 * 양력 → 음력.
 * @returns {{lunarYear,lunarMonth,lunarDay,isLeap}}
 */
export function solarToLunar(y, mo, d) {
  const D = toJD(y, mo, d, 12, 0, 0);
  const dayNum = Math.floor(D + 9 / 24 + 0.5); // KST 일수
  // 후보 달들을 모아 D가 속한 달을 찾는다
  let all = [];
  for (let yy = y - 1; yy <= y + 1; yy++) {
    for (const m of lunarMonths(yy)) all.push({ ...m, ly: yy });
  }
  all = all.filter((m, i, arr) => arr.findIndex((x) => x.startDay === m.startDay) === i);
  all.sort((a, b) => a.startDay - b.startDay);
  for (let i = 0; i < all.length - 1; i++) {
    if (dayNum >= all[i].startDay && dayNum < all[i + 1].startDay) {
      return {
        lunarYear: all[i].ly,
        lunarMonth: all[i].num,
        lunarDay: dayNum - all[i].startDay + 1,
        isLeap: all[i].isLeap,
      };
    }
  }
  return null;
}

/** 음력 연도 LY에 존재하는 윤달 번호 (없으면 0). UI에서 윤달 선택지 표시용. */
export function leapMonthOf(LY) {
  const lm = lunarMonths(LY).find((m) => m.isLeap);
  return lm ? lm.num : 0;
}

/** 음력 한 달의 길이(일수, 29 또는 30). 소월/대월 판별 — UI 일자 선택 상한용. */
export function daysInLunarMonth(LY, LM, isLeap) {
  const months = lunarMonths(LY);
  const idx = months.findIndex((m) => m.num === LM && m.isLeap === !!isLeap);
  if (idx < 0) return 30;
  let nextStart;
  if (idx + 1 < months.length) nextStart = months[idx + 1].startDay;
  else {
    const nm = lunarMonths(LY + 1);
    nextStart = nm.length ? nm[0].startDay : months[idx].startDay + 30;
  }
  return nextStart - months[idx].startDay;
}
