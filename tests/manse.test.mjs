// 만세력 엔진 검증 — 권위 레퍼런스(data/manse-reference.json) 대조.
// 실행: node tests/manse.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeSaju, pillarsText } from '../engine/saju.js';
import { lunarToSolar, solarToLunar, leapMonthOf, daysInLunarMonth } from '../engine/lunar.js';
import { solarTermJD, fromJD } from '../engine/astro.js';
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

// ── 결과 ──────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`);
console.log(`  통과 ${pass} / 실패 ${fail}`);
console.log(`${'═'.repeat(50)}`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
else console.log('  ✓ 모든 만세력 검증 통과');
