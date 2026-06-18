// ============================================================
//  saju · engine/luck.js
//  대운(大運)·세운(歲運) 계산.
//  - 대운: 양남음녀 순행 / 음남양녀 역행, 절기 기반 대운수(시작 나이)
//  - 세운: 연도별 60갑자(입춘 기준) + 일간 대비 십성
// ============================================================

import { solarTermJD } from './astro.js';
import {
  STEM_YANG, STEMS, BRANCHES, ganjiFromIndex, sipseongOf, HIDDEN_STEMS,
  STEM_ELEMENT, BRANCH_ELEMENT,
} from './constants.js';

/** 節(월 경계)의 태양황경은 λ ≡ 15 (mod 30). 다음(forward)/이전 節의 JD(UT)를 찾는다. */
function nextJeolJD(saju, forward) {
  const lon = saju.solarLongitude;
  const y = saju.solar.year;
  const k = Math.floor(((((lon - 15) % 360) + 360) % 360) / 30);
  const prevNodeLon = (((k * 30 + 15) % 360) + 360) % 360;
  const nextNodeLon = (prevNodeLon + 30) % 360;
  const targetLon = forward ? nextNodeLon : prevNodeLon;
  // 출생연 ±1 후보 중 출생 순간 기준 방향이 맞고 가장 가까운 절입 JD
  let best = null;
  for (const yy of [y - 1, y, y + 1]) {
    const jd = solarTermJD(yy, targetLon);
    const diff = jd - saju.jdUT;
    if (forward && diff > 0) { if (!best || diff < best.diff) best = { jd, diff }; }
    else if (!forward && diff < 0) { if (!best || -diff < best.diff) best = { jd, diff: -diff }; }
  }
  return best ? best.jd : solarTermJD(y, targetLon);
}

/**
 * 대운 계산.
 * @param {object} saju computeSaju 결과
 * @param {object} [today] {year,month,day} 기준일(현재 대운 하이라이트용)
 * @returns {{direction, startAge, monthsExtra, list:[{age,kor,hanja,ganjiIndex,sipseong}], currentIndex}}
 */
export function computeDaewoon(saju, today = null) {
  const yangYear = STEM_YANG[saju.pillars.year.stemIdx];
  const male = saju.input.gender === '남';
  const forward = (yangYear && male) || (!yangYear && !male); // 양남·음녀 순행
  const direction = forward ? '순행' : '역행';

  // 대운수: 출생~절입(순행) 또는 절입~출생(역행) 일수 ÷ 3 (3일=1년, 1일=4개월)
  const jeolJD = nextJeolJD(saju, forward);
  const days = Math.abs(jeolJD - saju.jdUT);
  const totalMonths = days / 3 * 12; // 1일=4개월 → days/3년
  let startAge = Math.floor(days / 3);
  let monthsExtra = Math.round((days / 3 - startAge) * 12);
  if (monthsExtra >= 12) { startAge += 1; monthsExtra -= 12; }
  // 통상 대운수는 반올림 정수로 표기 (0이면 1)
  const startAgeRounded = Math.max(1, Math.round(days / 3));

  const step = forward ? 1 : -1;
  const startIdx = saju.pillars.month.ganjiIndex;
  const list = [];
  for (let i = 0; i < 9; i++) {
    const gi = (((startIdx + step * (i + 1)) % 60) + 60) % 60;
    const g = ganjiFromIndex(gi);
    list.push({
      age: startAgeRounded + i * 10,
      kor: g.kor, hanja: g.hanja, ganjiIndex: gi,
      sipseong: sipseongOf(saju.ilgan, STEMS[g.stemIdx]),
      stemEl: STEM_ELEMENT[g.stemIdx], branchEl: BRANCH_ELEMENT[g.branchIdx],
    });
  }

  // 현재 대운 인덱스
  let currentIndex = -1;
  if (today) {
    const age = today.year - saju.solar.year
      - ((today.month < saju.solar.month
        || (today.month === saju.solar.month && today.day < saju.solar.day)) ? 1 : 0);
    for (let i = list.length - 1; i >= 0; i--) {
      if (age >= list[i].age) { currentIndex = i; break; }
    }
  }

  return { direction, startAge: startAgeRounded, monthsExtra, list, currentIndex };
}

/**
 * 세운(연운) — fromYear부터 count개 연도의 60갑자 + 일간 대비 십성.
 * @returns {[{year, kor, hanja, sipseong, isCurrent}]}
 */
export function computeSewoon(saju, fromYear, count = 10, currentYear = null) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const y = fromYear + i;
    const sIdx = (((y - 4) % 10) + 10) % 10;
    const bIdx = (((y - 4) % 12) + 12) % 12;
    const g = ganjiFromIndex(gIndexOf(sIdx, bIdx));
    out.push({
      year: y, kor: g.kor, hanja: g.hanja,
      sipseong: sipseongOf(saju.ilgan, STEMS[sIdx]),
      jisipseong: sipseongOf(saju.ilgan, HIDDEN_STEMS[BRANCHES[bIdx]].slice(-1)[0]),
      isCurrent: currentYear === y,
    });
  }
  return out;
}

// 천간·지지 인덱스 → 60갑자 인덱스
function gIndexOf(s, b) {
  for (let i = 0; i < 60; i++) if (i % 10 === s && i % 12 === b) return i;
  return 0;
}
