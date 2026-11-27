// 만세력 엔진 검증 — 권위 레퍼런스(data/manse-reference.json) 대조.
// 실행: node tests/manse.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeSaju, pillarsText } from '../engine/saju.js';
import { lunarToSolar, solarToLunar, leapMonthOf, daysInLunarMonth } from '../engine/lunar.js';
import { solarTermJD, fromJD, toJD } from '../engine/astro.js';
import { computeDaewoon, computeSewoon } from '../engine/luck.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(join(__dir, '../data/manse-reference.json'), 'utf8'));

let pass = 0, fail = 0;
const fails = [];
function check(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; fails.push(`✗ ${name}\n    기대: ${want}\n    실제: ${got}`); }
}
function near(name, got, want, tolMin) {
  const d = Math.abs(got - want);
  if (d <= tolMin) { pass++; }
  else { fail++; fails.push(`✗ ${name}  Δ=${d.toFixed(1)}분 (허용 ${tolMin})\n    기대: ${want}  실제: ${got}`); }
}

// ── 1) 일주 앵커 ───────────────────────────────────────────
for (const a of REF.dayPillarAnchors) {
  const [y, m, d] = a.solar.split('-').map(Number);
  const r = computeSaju({ calendar: 'solar', year: y, month: m, day: d, hour: 12, minute: 0, options: { trueSolarTime: false, useDST: false } });
  check(`일주 ${a.solar}`, r.pillars.day.kor, a.pillar);
}

// ── 2) 절기 시각 (입춘 등) ─────────────────────────────────
function termKST(year, lon) {
  const jd = solarTermJD(year, lon);
  const t = fromJD(jd + 9 / 24); // KST
  return t;
}
function toMin(t) { return ((t.year * 12 + t.month) * 31 + t.day) * 1440 + t.hour * 60 + t.min; }
function refMin(str) {
  const [date, time] = str.split(' ');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return ((y * 12 + mo) * 31 + d) * 1440 + h * 60 + mi;
}
const termLon = { 입춘: 315, 춘분: 0, 하지: 90, 추분: 180, 동지: 270, 소한: 285, 경칩: 345, 청명: 15, 입하: 45, 망종: 75, 소서: 105, 입추: 135, 백로: 165, 한로: 195, 입동: 225, 대설: 255 };
for (const [name, str] of Object.entries(REF.solarTerms2024)) {
  const t = termKST(2024, termLon[name]);
  near(`절기 2024 ${name}`, toMin(t), refMin(str), 2);
}
for (const [name, str] of Object.entries(REF.solarTerms2023)) {
  const t = termKST(2023, termLon[name]);
  near(`절기 2023 ${name}`, toMin(t), refMin(str), 2);
}
near('절기 2025 입춘', toMin(termKST(2025, 315)), refMin(REF.solarTerms2025.입춘), 2);

// ── 3) 음력→양력 ──────────────────────────────────────────
for (const p of REF.lunarToSolarPairs) {
  const [ly, lm, leap, ld] = p.lunar;
  const s = lunarToSolar(ly, lm, leap, ld);
  const got = s ? `${s.year}-${String(s.month).padStart(2, '0')}-${String(s.day).padStart(2, '0')}` : 'null';
  check(`음→양 ${ly}-${leap ? '윤' : ''}${lm}-${ld}`, got, p.solar);
}
// 설날 (음력 1/1)
for (const [year, solar] of Object.entries(REF.lunarNewYears)) {
  const s = lunarToSolar(Number(year), 1, false, 1);
  const got = s ? `${s.year}-${String(s.month).padStart(2, '0')}-${String(s.day).padStart(2, '0')}` : 'null';
  check(`설날 ${year}`, got, solar);
}
// 윤달 번호
for (const [year, lm] of Object.entries(REF.leapMonths)) {
  check(`윤달 ${year}`, leapMonthOf(Number(year)), lm);
}
// 음력 월 길이 (소월 29 / 대월 30) — KASI 노트: 2020·2023·2025 윤달 모두 소월(29)
check('월길이 2020윤4', daysInLunarMonth(2020, 4, true), 29);
check('월길이 2023윤2', daysInLunarMonth(2023, 2, true), 29);
check('월길이 2025윤6', daysInLunarMonth(2025, 6, true), 29);

// ── 4) 양력→음력 ──────────────────────────────────────────
for (const p of REF.solarToLunarPairs) {
  const [y, m, d] = p.solar.split('-').map(Number);
  const l = solarToLunar(y, m, d);
  const got = l ? `${l.lunarYear}-${l.lunarMonth}-${l.lunarDay}-${l.isLeap}` : 'null';
  const want = `${p.lunar[0]}-${p.lunar[1]}-${p.lunar[2]}-${p.lunar[3]}`;
  check(`양→음 ${p.solar}`, got, want);
}

// ── 5) e2e 4기둥 ──────────────────────────────────────────
for (const v of REF.e2eVectors) {
  const [y, m, d] = v.solar.split('-').map(Number);
  const hasTime = !!v.time;
  const [h, mi] = hasTime ? v.time.split(':').map(Number) : [null, null];
  const r = computeSaju({
    calendar: 'solar', year: y, month: m, day: d, hour: h, minute: mi,
    gender: v.gender,
    options: { trueSolarTime: v.tst === true, useDST: v.dst === true, dayBoundary: '자시' },
  });
  const t = pillarsText(r, false);
  check(`${v.who} 년주`, t.year, v.year);
  check(`${v.who} 월주`, t.month, v.month);
  check(`${v.who} 일주`, t.day, v.day);
  if (v.hour) check(`${v.who} 시주`, t.hour, v.hour);
}

// ── 6) 대운·세운 ──────────────────────────────────────────
{
  const s1 = computeSaju({ calendar: 'solar', year: 1992, month: 7, day: 8, hour: 12, minute: 0, gender: '남' });
  const d1 = computeDaewoon(s1, { year: 2026, month: 6, day: 18 });
  check('대운 손흥민 방향', d1.direction, '순행');
  check('대운 손흥민 대운수', d1.startAge, 10);
  check('대운 손흥민 첫대운', d1.list[0].kor, '무신');
  const s2 = computeSaju({ calendar: 'solar', year: 1992, month: 7, day: 8, hour: 12, minute: 0, gender: '여' });
  const d2 = computeDaewoon(s2);
  check('대운 양녀 방향', d2.direction, '역행');
  check('대운 양녀 첫대운', d2.list[0].kor, '병오');
  const sw = computeSewoon(s1, 2026, 1);
  check('세운 2026 간지', sw[0].kor, '병오');
  check('세운 2026 십성', sw[0].sipseong, '상관');
}

// ── 7) 서머타임 경계 (IANA tzdb Rule ROK: 끝 시각 미포함) ──
function atClock(y, m, d, h, mi, useDST) {
  return computeSaju({
    calendar: 'solar', year: y, month: m, day: d, hour: h, minute: mi, gender: '남',
    options: { trueSolarTime: true, equationOfTime: true, longitude: 126.9784, useDST, dayBoundary: '자시' },
  });
}
function samePillars(a, b) {
  return ['year', 'month', 'day', 'hour'].every((k) => a.pillars[k]?.kor === b.pillars[k]?.kor);
}
{
  const on = atClock(1948, 9, 13, 10, 30, true);
  const off = atClock(1948, 9, 13, 10, 30, false);
  check('DST 1948-09-13 00:00 이후 미적용', on.corrections.dstApplied, false);
  check('DST 1948-09-13 시주가 표준시와 같음', samePillars(on, off), true);
  check('DST 1948-09-12 마지막 날 적용', atClock(1948, 9, 12, 12, 0, true).corrections.dstApplied, true);
  const before = atClock(1987, 5, 10, 1, 30, true);
  check('DST 1987-05-10 02:00 전 미적용', before.corrections.dstApplied, false);
  check('DST 1987-05-10 01:30 시주', samePillars(before, atClock(1987, 5, 10, 1, 30, false)), true);
  check('DST 1987-05-10 12:00 적용', atClock(1987, 5, 10, 12, 0, true).corrections.dstApplied, true);
  check('DST 1987-10-11 02:30 아직 적용', atClock(1987, 10, 11, 2, 30, true).corrections.dstApplied, true);
  const after = atClock(1987, 10, 11, 12, 0, true);
  check('DST 1987-10-11 03:00 이후 해제', after.corrections.dstApplied, false);
  check('DST 1987-10-11 정오 시주', samePillars(after, atClock(1987, 10, 11, 12, 0, false)), true);
  check('DST 1988-05-08 01:00 미적용', atClock(1988, 5, 8, 1, 0, true).corrections.dstApplied, false);
  check('DST 1988-10-09 02:30 적용', atClock(1988, 10, 9, 2, 30, true).corrections.dstApplied, true);
  check('DST 1988-10-09 03:00 해제', atClock(1988, 10, 9, 3, 0, true).corrections.dstApplied, false);
  check('DST 1960-09-17 23:00 적용', atClock(1960, 9, 17, 23, 0, true).corrections.dstApplied, true);
  check('DST 1960-09-18 00:00 해제', atClock(1960, 9, 18, 0, 0, true).corrections.dstApplied, false);
  const unknown = computeSaju({
    calendar: 'solar', year: 1987, month: 5, day: 10, hour: null, gender: '남',
    options: { trueSolarTime: false, useDST: true },
  });
  check('시간 미상은 정오 기준 서머타임', unknown.corrections.dstApplied, true);
  check('표준시 1954-03-20 +9h', atClock(1954, 3, 20, 12, 0, false).corrections.legalOffsetMin, 540);
  check('표준시 1954-03-21 +8.5h', atClock(1954, 3, 21, 12, 0, false).corrections.legalOffsetMin, 510);
  check('표준시 1961-08-09 +8.5h', atClock(1961, 8, 9, 12, 0, false).corrections.legalOffsetMin, 510);
  check('표준시 1961-08-10 +9h', atClock(1961, 8, 10, 12, 0, false).corrections.legalOffsetMin, 540);
}

// ── 8) 없는 양력·시각, 자정 반올림 ─────────────────────────
{
  const bad = computeSaju({ calendar: 'solar', year: 2000, month: 2, day: 31, hour: 12, minute: 0 });
  check('양력 2000-02-31 거부', typeof bad.error === 'string' && bad.error.includes('없는 날짜'), true);
  const leapDay = computeSaju({ calendar: 'solar', year: 2000, month: 2, day: 29, hour: 12, minute: 0, options: { trueSolarTime: false, useDST: false } });
  check('양력 2000-02-29 허용', leapDay.error, undefined);
  const notLeap = computeSaju({ calendar: 'solar', year: 1900, month: 2, day: 29, hour: 12, minute: 0 });
  check('양력 1900-02-29 거부', typeof notLeap.error === 'string' && notLeap.error.includes('없는 날짜'), true);
  const badTime = computeSaju({ calendar: 'solar', year: 1992, month: 7, day: 8, hour: 25, minute: 0 });
  check('시각 25시 거부', typeof badTime.error === 'string', true);
  const fmt = (t) => `${t.year}-${t.month}-${t.day} ${t.hour}:${t.min}:${t.sec}`;
  check('JD 23:59:59.6 → 다음날 00:00', fmt(fromJD(toJD(2000, 1, 31, 23, 59, 59.6))), '2000-2-1 0:0:0');
  check('JD 연말 자정 반올림', fmt(fromJD(toJD(2000, 12, 31, 23, 59, 59.6))), '2001-1-1 0:0:0');
  check('JD 정오는 그대로', fmt(fromJD(toJD(2000, 1, 1, 12, 0, 0))), '2000-1-1 12:0:0');
}

// ── 9) 윤달 1900–2050 (한국천문연구원 계열 공개 연표) ─────
const LEAP = {
  1900: 8, 1903: 5, 1906: 4, 1909: 2, 1911: 6, 1914: 5, 1917: 2, 1919: 7,
  1922: 5, 1925: 4, 1928: 2, 1930: 6, 1933: 5, 1936: 3, 1938: 7, 1941: 6,
  1944: 4, 1947: 2, 1949: 7, 1952: 5, 1955: 3, 1957: 8, 1960: 6, 1963: 4,
  1966: 3, 1968: 7, 1971: 5, 1974: 4, 1976: 8, 1979: 6, 1982: 4, 1984: 10,
  1987: 6, 1990: 5, 1993: 3, 1995: 8, 1998: 5, 2001: 4, 2004: 2, 2006: 7,
  2009: 5, 2012: 3, 2014: 9, 2017: 5, 2020: 4, 2023: 2, 2025: 6, 2028: 5,
  2031: 3, 2033: 11, 2036: 6, 2039: 5, 2042: 2, 2044: 7, 2047: 5, 2050: 3,
};
for (let y = 1900; y <= 2050; y++) check(`윤달표 ${y}`, leapMonthOf(y), LEAP[y] || 0);
{
  const s1 = lunarToSolar(2033, 11, true, 1);
  const s29 = lunarToSolar(2033, 11, true, 29);
  const iso = (s) => s ? `${s.year}-${String(s.month).padStart(2, '0')}-${String(s.day).padStart(2, '0')}` : 'null';
  check('2033 윤11월 초하루', iso(s1), '2033-12-22');
  check('2033 윤11월 그믐', iso(s29), '2034-01-19');
  check('2033 윤11월 길이', daysInLunarMonth(2033, 11, true), 29);
  const back = solarToLunar(2034, 1, 20);
  check('2034-01-20 은 윤11월이 아님', back && `${back.lunarYear}-${back.lunarMonth}-${back.lunarDay}-${back.isLeap}`, '2033-12-1-false');
  check('설날 1900', iso(lunarToSolar(1900, 1, false, 1)), '1900-01-31');
  check('설날 2033', iso(lunarToSolar(2033, 1, false, 1)), '2033-01-31');
}

// ── 결과 ──────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`);
console.log(`  통과 ${pass} / 실패 ${fail}`);
console.log(`${'═'.repeat(50)}`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
else console.log('  ✓ 모든 만세력 검증 통과');
