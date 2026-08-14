// 타로 엔진(engine/tarot.js) + 덱 데이터 무결성 검증.
// 실행: node tests/tarot.test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SUITS, TOPIC_KEYS, buildDeck, indexDeck, shuffle, drawSpread,
  readSpread, encodeDraw, decodeDraw, suitOfId, defaultRng,
} from '../engine/tarot.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

let pass = 0, fail = 0;
const fails = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; fails.push(`✗ ${name}\n    기대: ${w}\n    실제: ${g}`); }
}
function ok(name, cond, extra = '') {
  if (cond) pass++;
  else { fail++; fails.push(`✗ ${name}${extra ? `\n    ${extra}` : ''}`); }
}
function throws(name, fn) {
  try { fn(); fail++; fails.push(`✗ ${name} — 예외가 나야 하는데 안 났음`); }
  catch { pass++; }
}

// ── 데이터 로드 ───────────────────────────────────────────
const parts = {
  major: readJson('data/tarot/major.json'),
  wands: readJson('data/tarot/wands.json'),
  cups: readJson('data/tarot/cups.json'),
  swords: readJson('data/tarot/swords.json'),
  pents: readJson('data/tarot/pents.json'),
};
const TOPICS = readJson('data/tarot-topics.json').topics;
const deck = buildDeck(parts);
const byId = indexDeck(deck);

// ── 1) 덱 구성 ────────────────────────────────────────────
check('덱 총 장수', deck.length, 78);
check('메이저 장수', deck.filter((c) => c.suit === 'major').length, 22);
for (const suit of ['wands', 'cups', 'swords', 'pents']) {
  check(`${suit} 장수`, deck.filter((c) => c.suit === suit).length, 14);
}
check('ID 유니크', new Set(deck.map((c) => c.id)).size, 78);
check('이름 유니크', new Set(deck.map((c) => c.name)).size, 78);
check('영문명 유니크', new Set(deck.map((c) => c.en)).size, 78);

// ID 규칙 — 접두사와 번호가 수트·no 와 일치해야 한다.
for (const c of deck) {
  const want = `${SUITS[c.suit].id}${String(c.no).padStart(2, '0')}`;
  check(`ID 규칙 ${c.name}`, c.id, want);
  check(`suitOfId(${c.id})`, suitOfId(c.id), c.suit);
}

// 번호 연속성 — 메이저 0~21, 마이너 1~14
check('메이저 번호', deck.filter((c) => c.suit === 'major').map((c) => c.no),
  Array.from({ length: 22 }, (_, i) => i));
for (const suit of ['wands', 'cups', 'swords', 'pents']) {
  check(`${suit} 번호`, deck.filter((c) => c.suit === suit).map((c) => c.no),
    Array.from({ length: 14 }, (_, i) => i + 1));
}

// ── 2) 이미지 실존 ────────────────────────────────────────
for (const c of deck) {
  ok(`이미지 존재 ${c.id} ${c.name}`, existsSync(join(ROOT, c.img)), c.img);
}

// ── 3) 해석 데이터 완전성 (78장 × 9주제 × 정/역 = 1,404) ──
const MIN_LEN = 20; // 너무 짧은 문장은 채워 넣다 만 것으로 본다
let topicLines = 0;
for (const c of deck) {
  for (const o of ['u', 'r']) {
    ok(`키워드 ${c.id}/${o}`, Array.isArray(c.kw?.[o]) && c.kw[o].length >= 3,
      `${c.name} ${o} 키워드는 3개 이상이어야 함`);
    ok(`코어 해석 ${c.id}/${o}`, typeof c.core?.[o] === 'string' && c.core[o].length >= MIN_LEN,
      `${c.name} ${o} 코어 해석 누락/짧음`);
  }
  check(`주제 키 집합 ${c.id}`, Object.keys(c.t ?? {}).sort(), [...TOPIC_KEYS].sort());
  for (const t of TOPIC_KEYS) {
    for (const o of ['u', 'r']) {
      const s = c.t?.[t]?.[o];
      ok(`해석 ${c.id}/${t}/${o}`, typeof s === 'string' && s.length >= MIN_LEN,
        `${c.name}(${c.id}) ${t} ${o} — 누락이거나 ${MIN_LEN}자 미만`);
      if (typeof s === 'string') topicLines++;
    }
  }
  // 정방향과 역방향이 같은 문장이면 복붙 사고다.
  for (const t of TOPIC_KEYS) {
    ok(`정/역 구분 ${c.id}/${t}`, c.t?.[t]?.u !== c.t?.[t]?.r, `${c.name} ${t} 정·역 문장이 동일`);
  }
}
check('주제 해석 총 줄 수', topicLines, 78 * 9 * 2);

// ── 4) 주제 데이터 ────────────────────────────────────────
check('주제 개수', TOPICS.length, 9);
check('주제 키 집합', TOPICS.map((t) => t.key).sort(), [...TOPIC_KEYS].sort());
for (const t of TOPICS) {
  check(`${t.key} 자리 수`, t.positions.length, 3);
  ok(`${t.key} 자리 라벨 유니크`, new Set(t.positions.map((p) => p.label)).size === 3);
  for (const p of t.positions) {
    ok(`${t.key}/${p.key} 라벨·힌트`, !!p.label && !!p.hint);
  }
}
// 자리 라벨이 주제마다 실제로 달라야 한다 (주제별 맞춤 스프레드의 핵심).
const allLabels = TOPICS.flatMap((t) => t.positions.map((p) => `${t.key}:${p.label}`));
check('전체 자리 라벨 유니크', new Set(allLabels).size, 27);

// ── 5) 셔플 ───────────────────────────────────────────────
{
  const seq = [0.9, 0.1, 0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.05];
  let i = 0;
  const rng = () => seq[i++ % seq.length];
  const s = shuffle(deck, rng);
  check('셔플 후 장수 보존', s.length, 78);
  check('셔플 후 카드 집합 보존', new Set(s.map((c) => c.id)).size, 78);
  ok('셔플이 원본을 건드리지 않음', deck[0].id === 'm00');
  ok('셔플이 실제로 순서를 바꿈', s.map((c) => c.id).join() !== deck.map((c) => c.id).join());
}

// ── 6) 드로우 ─────────────────────────────────────────────
{
  const d = drawSpread(deck, { count: 3 });
  check('기본 드로우 장수', d.length, 3);
  check('드로우 중복 없음', new Set(d.map((x) => x.id)).size, 3);
  ok('드로우 방향 값이 u/r', d.every((x) => x.o === 'u' || x.o === 'r'));
  ok('드로우 카드가 덱에 존재', d.every((x) => byId.has(x.id)));
}
{
  // 1,000회 반복 — 78장이 전부 한 번은 나와야 하고, 역방향 비율은 절반 언저리여야 한다.
  const seen = new Set();
  let rev = 0, total = 0;
  for (let i = 0; i < 1000; i++) {
    for (const x of drawSpread(deck, { count: 3 })) {
      seen.add(x.id); total++; if (x.o === 'r') rev++;
    }
  }
  check('1,000회 반복 시 전 카드 등장', seen.size, 78);
  const ratio = rev / total;
  ok('역방향 비율 45~55%', ratio > 0.45 && ratio < 0.55, `실제 ${(ratio * 100).toFixed(1)}%`);
}
{
  // 역방향 토글을 끄면 한 장도 뒤집히지 않아야 한다.
  let rev = 0;
  for (let i = 0; i < 300; i++) {
    for (const x of drawSpread(deck, { count: 3, allowReversed: false })) if (x.o === 'r') rev++;
  }
  check('역방향 끄면 0장', rev, 0);
}
throws('덱보다 많이 뽑으면 예외', () => drawSpread(deck, { count: 79 }));
ok('defaultRng 범위', (() => {
  for (let i = 0; i < 200; i++) { const v = defaultRng(); if (v < 0 || v >= 1) return false; }
  return true;
})());

// ── 7) 스프레드 해석 ──────────────────────────────────────
for (const t of TOPIC_KEYS) {
  const draw = drawSpread(deck, { count: 3 });
  const r = readSpread(draw, t, TOPICS, byId);
  check(`${t} 해석 카드 수`, r.cards.length, 3);
  check(`${t} 주제 키`, r.topic.key, t);
  const topic = TOPICS.find((x) => x.key === t);
  check(`${t} 자리 라벨 순서`, r.cards.map((c) => c.position.label),
    topic.positions.map((p) => p.label));
  ok(`${t} 해석 본문 존재`, r.cards.every((c) => c.text && c.text.length >= MIN_LEN));
  ok(`${t} 키워드 존재`, r.cards.every((c) => Array.isArray(c.keywords) && c.keywords.length >= 3));
  ok(`${t} 방향 라벨`, r.cards.every((c) => c.orientationLabel === (c.reversed ? '역방향' : '정방향')));
}
{
  // 같은 카드·같은 자리라면 주제가 다를 때 해석도 달라야 한다.
  const draw = [{ id: 'm00', o: 'u' }, { id: 'w01', o: 'u' }, { id: 'c01', o: 'u' }];
  const love = readSpread(draw, 'love', TOPICS, byId);
  const money = readSpread(draw, 'money', TOPICS, byId);
  ok('주제가 다르면 해석도 다름', love.cards[0].text !== money.cards[0].text);
  ok('주제가 다르면 자리 이름도 다름', love.cards[0].position.label !== money.cards[0].position.label);
}
{
  // 요약 관찰 — 메이저 3장이면 '큰 흐름', 전부 역방향이면 그 note 가 붙어야 한다.
  const allMajor = [{ id: 'm00', o: 'r' }, { id: 'm01', o: 'r' }, { id: 'm02', o: 'r' }];
  const r = readSpread(allMajor, 'future', TOPICS, byId);
  check('메이저 3장 카운트', r.summary.majorCount, 3);
  check('역방향 3장 카운트', r.summary.reversedCount, 3);
  ok('큰 흐름 note', r.summary.notes.some((n) => n.tag === '큰 흐름'));
  ok('전부 역방향 note', r.summary.notes.some((n) => n.tag === '전부 역방향'));

  const allWands = [{ id: 'w01', o: 'u' }, { id: 'w02', o: 'u' }, { id: 'w03', o: 'u' }];
  const r2 = readSpread(allWands, 'business', TOPICS, byId);
  check('수트 쏠림 감지', r2.summary.dominantSuit, 'wands');
  check('메이저 0장', r2.summary.majorCount, 0);
  ok('내 손 안 note', r2.summary.notes.some((n) => n.tag === '내 손 안'));
  ok('전부 정방향 note', r2.summary.notes.some((n) => n.tag === '전부 정방향'));
}
throws('없는 주제는 예외', () => readSpread([{ id: 'm00', o: 'u' }], 'nope', TOPICS, byId));
throws('장수가 안 맞으면 예외', () => readSpread([{ id: 'm00', o: 'u' }], 'love', TOPICS, byId));
throws('덱에 없는 카드는 예외', () =>
  readSpread([{ id: 'm99', o: 'u' }, { id: 'w01', o: 'u' }, { id: 'c01', o: 'u' }], 'love', TOPICS, byId));

// ── 8) 공유 URL 인코딩 왕복 ───────────────────────────────
{
  const draw = [{ id: 'm00', o: 'u' }, { id: 'w03', o: 'r' }, { id: 's10', o: 'u' }];
  check('인코딩 형식', encodeDraw(draw), 'm00u,w03r,s10u');
  check('왕복 무손실', decodeDraw(encodeDraw(draw), byId), draw);
}
{
  // 무작위 200회 왕복 — 어떤 조합도 손실 없이 돌아와야 한다.
  let bad = 0;
  for (let i = 0; i < 200; i++) {
    const d = drawSpread(deck, { count: 3 });
    if (JSON.stringify(decodeDraw(encodeDraw(d), byId)) !== JSON.stringify(d)) bad++;
  }
  check('무작위 200회 왕복', bad, 0);
}
// 손상된 입력은 예외가 아니라 null 이어야 한다 (링크로 앱이 죽으면 안 된다).
for (const [name, input] of [
  ['빈 문자열', ''], ['null', null], ['숫자', 123],
  ['형식 오류', 'm00'], ['잘못된 방향', 'm00x,w03r,s10u'],
  ['없는 접두사', 'z00u,w03r,s10u'], ['덱에 없는 번호', 'm99u,w03r,s10u'],
  ['같은 카드 두 번', 'm00u,m00r,s10u'], ['자리수 오류', 'm0u,w03r,s10u'],
  ['너무 많음', Array.from({ length: 11 }, (_, i) => `m${String(i).padStart(2, '0')}u`).join(',')],
]) {
  check(`디코딩 방어 — ${name}`, decodeDraw(input, byId), null);
}

// ── 결과 ──────────────────────────────────────────────────
console.log(`\n타로 엔진 테스트: ${pass} PASS / ${fail} FAIL`);
if (fails.length) {
  console.log('\n' + fails.slice(0, 40).join('\n'));
  if (fails.length > 40) console.log(`\n… 외 ${fails.length - 40}건`);
  process.exit(1);
}
