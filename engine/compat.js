// ============================================================
//  saju · engine/compat.js
//  두 사람의 원국을 함께 펼쳐 보는 궁합(宮合) 분석.
//
//  판정 축(가중 합계 100):
//    ① 일간(日干) 관계        25  — 두 사람 '자신'끼리의 결
//    ② 일지(日支) 배우자궁    25  — 궁합에서 가장 비중이 큰 자리
//    ③ 오행 상호보완          20  — 서로의 빈자리를 채우는가(용신 포함)
//    ④ 년지(띠) 관계          10  — 집안·사회적 결
//    ⑤ 월지 + 조후 보완       10  — 가치관·환경, 한난조습 중화
//    ⑥ 신강·신약 보완         10  — 힘의 균형
//
//  톤 규약(기존 reading.js 와 동일): 숙명론·공포·우열 표현 금지.
//  낮은 점수는 '나쁨'이 아니라 '결이 다름 → 조율이 필요함'으로 서술한다.
// ============================================================

import {
  STEMS, STEM_ELEMENT, STEM_YANG, ELEMENTS, ELEMENTS_HANJA, STEMS_HANJA,
  BRANCHES, BRANCHES_HANJA, STEM_HAP, STEM_CHUNG, SAENG, GEUK,
  sipseongOf,
} from './constants.js';
import { branchRelation } from './theory.js';

// ── 십성으로 본 '상대는 나에게 어떤 사람인가' ────────────────
const SIPSEONG_PERSON = {
  비견: { tag: '나란히 걷는 동료', desc: '결이 비슷해 말이 잘 통하고, 같은 눈높이에서 함께 갈 수 있어요.' },
  겁재: { tag: '함께 겨루며 크는 사이', desc: '자극을 주고받으며 서로를 키우지만, 같은 것을 원할 땐 조율이 필요해요.' },
  식신: { tag: '내가 편안히 풀어놓는 사람', desc: '곁에 있으면 마음이 놓이고, 하고 싶은 말이 자연스레 나와요.' },
  상관: { tag: '내 재능을 끌어내는 사람', desc: '표현하고 싶어지게 만들지만, 때로 내가 너무 앞서 나갈 수 있어요.' },
  편재: { tag: '내가 넓게 펼치게 되는 사람', desc: '세상으로 눈을 넓혀 주고 활동 반경을 키워 줘요.' },
  정재: { tag: '내가 아끼고 가꾸는 사람', desc: '차곡차곡 쌓아 가는 안정된 관계를 만들기 좋아요.' },
  편관: { tag: '나를 긴장시키고 깨우는 사람', desc: '느슨해질 때 자극이 되지만, 압박으로 느껴질 땐 거리 조절이 필요해요.' },
  정관: { tag: '나를 바르게 세워 주는 사람', desc: '기준과 신뢰를 주고, 관계에 안정된 틀을 만들어 줘요.' },
  편인: { tag: '나를 다른 눈으로 깨우는 사람', desc: '평소 안 하던 생각을 하게 만들고, 내면을 깊게 해 줘요.' },
  정인: { tag: '나를 품어 주는 사람', desc: '기댈 수 있는 언덕이 되어 주고, 지친 마음을 회복시켜 줘요.' },
};

// ── 등급 ──────────────────────────────────────────────────────
const GRADES = [
  { min: 85, label: '결이 아주 잘 통하는 사이', emoji: '💞', desc: '서로의 기운이 자연스럽게 맞물려요. 애써 맞추지 않아도 편안한 자리가 많아요.' },
  { min: 72, label: '잘 어울리는 인연', emoji: '💚', desc: '통하는 지점이 많고, 다른 부분도 서로에게 도움이 되는 방향이에요.' },
  { min: 60, label: '무난하게 어울리는 사이', emoji: '🙂', desc: '크게 부딪히는 자리는 적어요. 서로를 알아 갈수록 편해지는 결이에요.' },
  { min: 48, label: '서로 배우며 맞춰 가는 사이', emoji: '🌗', desc: '저절로 맞물리는 자리는 적은 편이에요. 서로의 결을 알고 맞춰 갈수록 관계가 단단해지는 조합이에요.' },
  { min: 0, label: '많이 다른 결 — 이해가 열쇠인 사이', emoji: '🌓', desc: '기운의 방향이 서로 달라요. 사주가 관계를 정하지는 않아요 — 알고 맞춰 가면 충분히 좋은 사이가 될 수 있어요.' },
];
function gradeOf(score) { return GRADES.find((g) => score >= g.min); }

// ── 유틸 ──────────────────────────────────────────────────────
const stemEl = (s) => STEM_ELEMENT[STEMS.indexOf(s)];
const stemYang = (s) => STEM_YANG[STEMS.indexOf(s)];
const hanjaOf = (s) => STEMS_HANJA[STEMS.indexOf(s)] || s;
const bHanja = (b) => BRANCHES_HANJA[BRANCHES.indexOf(b)] || b;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const nameOf = (saju, fallback) => saju.input.name || fallback;

// 관계 강도 계수 — 축의 점수 폭(base↔max, base↔min)에 비례해 가감한다.
// (고정 점수를 쓰면 배점이 작은 축에서 한 번의 관계가 과도하게 반영된다.)
const GOOD_WEIGHT = { 육합: 1.0, '삼합(반합)': 0.8, '방합(반방합)': 0.5 };
const TENSE_WEIGHT = { 충: 1.0, 원진: 0.85, 형: 0.7, 자형: 0.7, 해: 0.55, 파: 0.5 };

/** 지지 한 쌍의 관계를 '좋은 결 / 조율이 필요한 결'로 요약하고 점수화. */
function branchPairScore(b1, b2, { base = 15, max = 25, min = 6 } = {}) {
  const rels = branchRelation(b1, b2);
  const upRange = max - base, downRange = base - min;
  let score = base;
  const goods = [], tenses = [];
  for (const r of rels) {
    if (r.tone === 'good') {
      score += (GOOD_WEIGHT[r.kind] ?? 0.5) * upRange; goods.push(r);
    } else {
      score -= (TENSE_WEIGHT[r.kind] ?? 0.5) * downRange; tenses.push(r);
    }
  }
  if (!rels.length && b1 === b2) score += upRange * 0.2; // 같은 글자 — 닮은 결
  return { score: +clamp(score, min, max).toFixed(1), rels, goods, tenses };
}

/** 관계 종류를 한자 병기로 (예: '해(害)') */
const kindLabel = (r) => (r.hanja ? `${r.kind}(${r.hanja})` : r.kind);

/** 오행 분포(가중%)에서 특정 오행들의 비중 합 */
function supplyOf(analyzeObj, els) {
  if (!els.length) return 0;
  return els.reduce((sum, e) => sum + (analyzeObj.elements.weightedPct[e] || 0), 0);
}

/**
 * '채워 주는 양' — 상대가 나보다 그 오행을 얼마나 더 갖고 있는지(초과분 합).
 * 절대 보유량으로 재면 같은 사주끼리도 서로를 채워 주는 것으로 잘못 나온다.
 */
function excessOf(fromA, toB, els) {
  if (!els.length) return 0;
  return els.reduce((sum, e) => {
    const gap = (toB.elements.weightedPct[e] || 0) - (fromA.elements.weightedPct[e] || 0);
    return sum + Math.max(0, gap);
  }, 0);
}

// ── 한글 조사 처리 ────────────────────────────────────────────
function hasJong(word) {
  const w = String(word || '');
  const ch = w.charCodeAt(w.length - 1);
  if (ch < 0xAC00 || ch > 0xD7A3) return false; // 한글이 아니면 받침 없음으로 취급
  return (ch - 0xAC00) % 28 !== 0;
}
const josaIGa = (w) => `${w}${hasJong(w) ? '이' : '가'}`;
const josaEulReul = (w) => `${w}${hasJong(w) ? '을' : '를'}`;
const josaEunNeun = (w) => `${w}${hasJong(w) ? '은' : '는'}`;
const josaEge = (w) => `${w}에게`;

// ── ① 일간 관계 ───────────────────────────────────────────────
function axisIlgan(A, B) {
  const g1 = A.saju.ilgan, g2 = B.saju.ilgan;
  const e1 = stemEl(g1), e2 = stemEl(g2);
  const sameYY = stemYang(g1) === stemYang(g2);
  const isHap = STEM_HAP[g1] && STEM_HAP[g1][0] === g2;
  const isChung = STEM_CHUNG[g1] === g2;

  let score, tone, headline;
  const detail = [];

  if (isHap) {
    const resultEl = STEM_HAP[g1][1];
    score = 25; tone = 'good';
    headline = `일간이 서로 합(合)하는 사이예요 — ${g1}${g2}합${resultEl}(${hanjaOf(g1)}${hanjaOf(g2)}合${ELEMENTS_HANJA[resultEl]})`;
    detail.push(`두 사람의 일간이 천간합을 이뤄요. 명리에서 합은 '서로에게 끌리고 묶이는 결'로, 궁합에서 가장 자주 언급되는 인연의 형태예요.`);
    detail.push(`이 합이 만들어 내는 기운은 ${resultEl}(${ELEMENTS_HANJA[resultEl]})이에요 — 둘이 함께 있을 때 ${{ 목: '새로 시작하고 자라나는', 화: '따뜻하고 활기찬', 토: '든든하고 안정된', 금: '기준이 또렷하고 단단한', 수: '깊고 잔잔한' }[resultEl]} 결이 생기기 쉬워요.`);
  } else if (isChung) {
    score = 11; tone = 'tense';
    headline = `일간이 서로 충(沖)하는 사이예요 — ${g1}${g2}충(${hanjaOf(g1)}${hanjaOf(g2)}沖)`;
    detail.push(`정면으로 맞부딪히는 기운이라 자극이 강해요. 나쁘다는 뜻이 아니라, 서로를 흔들어 깨우는 힘이 세다는 뜻이에요.`);
    detail.push(`솔직한 대화는 잘 되는 대신 감정이 빨리 커질 수 있어요. 한 박자 쉬고 말하는 습관이 이 관계엔 특히 큰 도움이 돼요.`);
  } else if (e1 === e2) {
    score = sameYY ? 16 : 19; tone = 'good';
    headline = `일간이 같은 ${e1}(${ELEMENTS_HANJA[e1]}) 기운이에요 — 비화(比和)`;
    detail.push(`같은 오행이라 세상을 보는 눈이 비슷해요. 설명하지 않아도 통하는 지점이 많아요.`);
    detail.push(sameYY
      ? `음양까지 같아 결이 아주 닮았어요. 닮은 만큼 같은 것을 원할 때 부딪힐 수 있으니 역할을 나눠 두면 편해요.`
      : `음양이 달라 같은 기운이면서도 서로를 보완해요. 닮음과 다름의 균형이 좋은 편이에요.`);
  } else if (SAENG[e1] === e2) {
    score = 21; tone = 'good';
    headline = `${josaIGa(nameOf(A.saju, '첫 번째 분'))} 상대를 생(生)해 주는 결이에요 — ${e1}생${e2}`;
    detail.push(`${e1}(${ELEMENTS_HANJA[e1]})이 ${e2}(${ELEMENTS_HANJA[e2]})를 낳아 주는 관계라, 한쪽이 다른 쪽에게 힘을 실어 주는 흐름이에요.`);
    detail.push(`주는 쪽이 지치지 않도록, 받는 쪽이 고마움을 자주 표현하면 오래가는 관계가 돼요.`);
  } else if (SAENG[e2] === e1) {
    score = 21; tone = 'good';
    headline = `상대가 ${josaEulReul(nameOf(A.saju, '첫 번째 분'))} 생(生)해 주는 결이에요 — ${e2}생${e1}`;
    detail.push(`${e2}(${ELEMENTS_HANJA[e2]})가 ${e1}(${ELEMENTS_HANJA[e1]})을 낳아 주는 관계라, 상대가 기운을 채워 주는 흐름이에요.`);
    detail.push(`받는 쪽이 당연하게 여기지 않고 표현해 주면, 주는 쪽도 지치지 않아요.`);
  } else {
    // 상극 — 음양이 다르면 유정(정관·정재), 같으면 무정(편관·편재)
    score = sameYY ? 13 : 17;
    tone = sameYY ? 'tense' : 'mixed';
    const who = GEUK[e1] === e2 ? `${e1}극${e2}` : `${e2}극${e1}`;
    headline = `일간이 서로 극(剋)하는 결이에요 — ${who}`;
    detail.push(sameYY
      ? `음양이 같은 극이라 힘겨루기처럼 느껴질 수 있어요. 서로의 영역을 분명히 해 두면 마찰이 크게 줄어요.`
      : `음양이 다른 극이라 명리에서는 '유정(有情)한 극'이라고 봐요. 긴장이 있지만 그 긴장이 서로를 세워 주는 쪽으로 작동하기 쉬워요.`);
    detail.push(`극은 눌린다는 뜻만이 아니라 '기준을 만들어 준다'는 뜻이기도 해요. 규칙을 함께 정해 두는 관계에서 특히 잘 풀려요.`);
  }

  // 상대가 나에게 무슨 십성인가 (양방향)
  const aToB = sipseongOf(g1, g2); // A 일간 기준 B는 무엇인가
  const bToA = sipseongOf(g2, g1);
  const lens = {
    aSees: { sipseong: aToB, ...SIPSEONG_PERSON[aToB] },
    bSees: { sipseong: bToA, ...SIPSEONG_PERSON[bToA] },
  };

  return {
    key: 'ilgan', title: '일간(日干) — 두 사람 자신의 결', weight: 25,
    score, tone, headline, detail, lens,
    basis: `${nameOf(A.saju, 'A')} 일간 ${g1}(${hanjaOf(g1)})·${e1} / ${nameOf(B.saju, 'B')} 일간 ${g2}(${hanjaOf(g2)})·${e2}`,
  };
}

// ── ② 일지(배우자궁) 관계 ─────────────────────────────────────
function axisIlji(A, B) {
  const b1 = BRANCHES[A.saju.pillars.day.branchIdx];
  const b2 = BRANCHES[B.saju.pillars.day.branchIdx];
  const r = branchPairScore(b1, b2, { base: 15, max: 25, min: 6 });

  const detail = [];
  let headline, tone;
  if (r.goods.length && !r.tenses.length) {
    tone = 'good';
    headline = `배우자 자리끼리 ${r.goods.map(kindLabel).join('·')}이에요 — ${r.goods[0].label}`;
    detail.push('일지는 명리에서 배우자·가장 가까운 사람이 앉는 자리예요. 이 자리끼리 합(合)이 되면 함께 지내는 일상의 결이 잘 맞는 편이에요.');
    if (r.goods[0].element) detail.push(`이 합이 만드는 기운은 ${r.goods[0].element}(${ELEMENTS_HANJA[r.goods[0].element]})예요 — 둘이 함께할 때 그 기운이 살아나요.`);
  } else if (r.tenses.length && !r.goods.length) {
    tone = 'tense';
    headline = `배우자 자리끼리 ${r.tenses.map(kindLabel).join('·')}의 결이에요 — ${r.tenses[0].label}`;
    detail.push('일지는 가장 가까이서 부대끼는 자리라, 이 자리의 긴장은 사소한 생활 습관에서 먼저 드러나요.');
    detail.push(r.tenses.some((t) => t.kind === '충')
      ? '충(沖)은 서로를 흔드는 힘이에요. 변화가 많은 대신 지루할 틈이 없고, 규칙과 각자의 공간을 정해 두면 그 힘이 추진력으로 바뀌어요.'
      : '작은 어긋남이 쌓이기 쉬운 결이에요. 불편한 건 작을 때 말하는 습관이 이 관계엔 특히 잘 맞아요.');
  } else if (r.goods.length && r.tenses.length) {
    tone = 'mixed';
    headline = `배우자 자리에 끌림과 긴장이 함께 있어요 — ${[...r.goods, ...r.tenses].map(kindLabel).join('·')}`;
    detail.push('가까워지는 힘과 부딪히는 힘이 같이 있는 자리예요. 감정의 진폭이 큰 대신, 서로에게 깊이 각인되는 관계가 되기 쉬워요.');
  } else {
    tone = 'neutral';
    headline = b1 === b2 ? `배우자 자리가 같은 글자예요 — ${b1}(${bHanja(b1)})` : '배우자 자리끼리 특별한 합충은 없어요';
    detail.push(b1 === b2
      ? '같은 글자라 생활 리듬과 취향이 닮기 쉬워요. 닮은 만큼 같은 약점도 공유하니, 서로 다른 시각을 일부러 들여 보는 게 도움이 돼요.'
      : '강하게 끌어당기지도, 부딪히지도 않는 담백한 자리예요. 관계의 색은 두 사람이 만들어 가는 몫이 커요.');
  }

  return {
    key: 'ilji', title: '일지(日支) — 배우자 자리', weight: 25,
    score: r.score, tone, headline, detail, rels: r.rels,
    basis: `${nameOf(A.saju, 'A')} 일지 ${b1}(${bHanja(b1)}) / ${nameOf(B.saju, 'B')} 일지 ${b2}(${bHanja(b2)})`,
  };
}

// ── ③ 오행 상호보완 ───────────────────────────────────────────
function axisElements(A, B) {
  const lackA = (A.a.elements.missing.length ? A.a.elements.missing : A.a.elements.weak).slice(0, 2);
  const lackB = (B.a.elements.missing.length ? B.a.elements.missing : B.a.elements.weak).slice(0, 2);
  // 채움 = 상대가 나보다 그 오행을 얼마나 '더' 가졌는가 (초과분)
  const supA = excessOf(A.a, B.a, lackA); // B가 A의 빈자리를 채워 주는 정도(%p)
  const supB = excessOf(B.a, A.a, lackB);

  // 용신 교류 — 상대가 내 용신 오행을 나보다 얼마나 더 갖고 있는지(초과분 평균)
  const yongA = A.a.theory?.yongsin?.primary || [];
  const yongB = B.a.theory?.yongsin?.primary || [];
  const yA = yongA.length ? excessOf(A.a, B.a, yongA) / yongA.length : 0;
  const yB = yongB.length ? excessOf(B.a, A.a, yongB) / yongB.length : 0;

  // 둘 다 얇은 오행 — 함께 채워 가야 하는 자리
  const bothThin = ELEMENTS.filter((e) => (A.a.elements.weightedPct[e] || 0) < 8 && (B.a.elements.weightedPct[e] || 0) < 8);

  // 중립 10점에서 시작 — 보완이 있으면 가산, 둘 다 비어 있으면 감산.
  const NEUTRAL = 10;
  const fillScore = (sup, lack) => (lack.length ? clamp(sup / 2.6, 0, 7) : 3.5);
  const yongScore = (y) => clamp(y / 4, 0, 5);
  const penalty = Math.min(bothThin.length * 2, 6);
  const raw = NEUTRAL
    + (fillScore(supA, lackA) + fillScore(supB, lackB)) / 2
    + (yongScore(yA) + yongScore(yB)) / 2
    - penalty;
  const score = +clamp(raw, 3, 20).toFixed(1);

  const detail = [];
  const fmt = (els) => els.map((e) => `${e}(${ELEMENTS_HANJA[e]})`).join('·');
  const nA = nameOf(A.saju, '첫 번째 분'), nB = nameOf(B.saju, '두 번째 분');
  const pp = (v) => `${v.toFixed(0)}%p`;

  if (lackA.length) {
    detail.push(supA >= 12
      ? `${josaEge(nA)} 부족한 ${fmt(lackA)} 기운을 ${josaIGa(nB)} 넉넉히(+${pp(supA)}) 갖고 있어요 — 빈자리를 확실히 채워 주는 관계예요.`
      : supA >= 5
        ? `${josaEge(nA)} 부족한 ${fmt(lackA)} 기운을 ${josaIGa(nB)} 어느 정도(+${pp(supA)}) 더 갖고 있어요.`
        : `${josaEge(nA)} 부족한 ${fmt(lackA)} 기운은 ${josaEge(nB)}도 넉넉하지 않아요 — 그 부분은 둘이 함께 의식적으로 채워 가야 해요.`);
  } else detail.push(`${josaEunNeun(nA)} 오행이 비교적 고른 편이라 특정 기운에 크게 기대지 않아도 돼요.`);

  if (lackB.length) {
    detail.push(supB >= 12
      ? `${josaEge(nB)} 부족한 ${fmt(lackB)} 기운은 ${josaIGa(nA)} 넉넉히(+${pp(supB)}) 갖고 있어요.`
      : supB >= 5
        ? `${josaEge(nB)} 부족한 ${fmt(lackB)} 기운을 ${josaIGa(nA)} 어느 정도(+${pp(supB)}) 더 갖고 있어요.`
        : `${josaEge(nB)} 부족한 ${fmt(lackB)} 기운은 ${josaEge(nA)}도 넉넉하지 않아요.`);
  } else detail.push(`${josaEunNeun(nB)} 오행이 비교적 고른 편이에요.`);

  if (yongA.length && yA >= 8) detail.push(`${josaEge(nA)} 도움이 되는 ${fmt(yongA)} 기운을 ${josaIGa(nB)} 더 많이 갖고 있어요 — 곁에 있는 것만으로 균형이 잡히는 조합이에요.`);
  if (yongB.length && yB >= 8) detail.push(`${josaEge(nB)} 도움이 되는 ${fmt(yongB)} 기운은 ${josaIGa(nA)} 더 갖고 있어요.`);
  if (bothThin.length >= 2) detail.push(`${fmt(bothThin)} 기운은 두 사람 모두 얇은 편이에요 — 관계 안에서 서로 기대기보다, 각자 그 기운을 채우는 습관을 만드는 편이 좋아요.`);

  const tone = score >= 13 ? 'good' : score >= 8 ? 'mixed' : 'tense';
  const headline = score >= 13 ? '서로의 빈자리를 잘 채워 주는 조합이에요'
    : score >= 8 ? '부분적으로 서로를 채워 주는 조합이에요'
      : '비슷한 기운이 몰려 있어 함께 채워 가야 할 부분이 있어요';

  return {
    key: 'elements', title: '오행 상호보완 — 서로의 빈자리', weight: 20,
    score, tone, headline, detail,
    lackA, lackB, supplyToA: +supA.toFixed(1), supplyToB: +supB.toFixed(1),
    yongsinA: yongA, yongsinB: yongB,
    basis: `${nA} 부족 ${lackA.length ? fmt(lackA) : '없음'} / ${nB} 부족 ${lackB.length ? fmt(lackB) : '없음'}`,
  };
}

// ── ④ 년지(띠) 관계 ───────────────────────────────────────────
const ZODIAC = { 자: '쥐', 축: '소', 인: '호랑이', 묘: '토끼', 진: '용', 사: '뱀', 오: '말', 미: '양', 신: '원숭이', 유: '닭', 술: '개', 해: '돼지' };

function axisYear(A, B) {
  const b1 = BRANCHES[A.saju.pillars.year.branchIdx];
  const b2 = BRANCHES[B.saju.pillars.year.branchIdx];
  const r = branchPairScore(b1, b2, { base: 6, max: 10, min: 2 });
  const detail = [];
  let tone, headline;
  if (r.goods.length && !r.tenses.length) {
    tone = 'good';
    headline = `${ZODIAC[b1]}띠와 ${ZODIAC[b2]}띠 — 띠끼리 ${r.goods.map(kindLabel).join('·')}`;
    detail.push('년지는 뿌리·집안·사회적 배경을 보는 자리예요. 여기가 잘 맞으면 주변 사람들 앞에서의 호흡도 편한 편이에요.');
  } else if (r.tenses.length) {
    tone = r.goods.length ? 'mixed' : 'tense';
    headline = `${ZODIAC[b1]}띠와 ${ZODIAC[b2]}띠 — 띠끼리 ${r.tenses.map(kindLabel).join('·')}의 결`;
    detail.push('흔히 말하는 "띠 궁합"이 이 자리예요. 다만 년지 하나로 관계를 판단하지는 않아요 — 일간·일지가 훨씬 큰 비중을 가져요.');
    detail.push('배경이나 자라온 환경의 결이 달라 초반에 조율이 필요할 수 있어요. 서로의 가족·친구 문화를 미리 이야기해 두면 훨씬 수월해요.');
  } else {
    tone = 'neutral';
    headline = `${ZODIAC[b1]}띠와 ${ZODIAC[b2]}띠 — 특별한 합충은 없어요`;
    detail.push('년지는 담백한 편이에요. 흔히 말하는 띠 궁합에 크게 좌우되지 않는 조합이에요.');
  }
  return {
    key: 'year', title: '년지 — 띠·배경의 결', weight: 10,
    score: r.score, tone, headline, detail, rels: r.rels,
    basis: `${b1}(${bHanja(b1)}) ${ZODIAC[b1]}띠 / ${b2}(${bHanja(b2)}) ${ZODIAC[b2]}띠`,
  };
}

// ── ⑤ 월지 + 조후 보완 ───────────────────────────────────────
function axisMonth(A, B) {
  const b1 = BRANCHES[A.saju.pillars.month.branchIdx];
  const b2 = BRANCHES[B.saju.pillars.month.branchIdx];
  const r = branchPairScore(b1, b2, { base: 4.5, max: 7, min: 1.5 });

  const jA = A.a.theory?.johu, jB = B.a.theory?.johu;
  let johuScore = 1.5, johuLine = '';
  if (jA && jB) {
    const t1 = jA.temp, t2 = jB.temp;
    const sum = Math.abs(t1 + t2), each = Math.abs(t1) + Math.abs(t2);
    if (each >= 5 && sum <= 3) { johuScore = 3; johuLine = `한쪽은 ${jA.tempLabel}, 다른 쪽은 ${jB.tempLabel} 쪽으로 기울어 서로의 기후를 중화해 줘요 — 조후(調候)가 잘 맞는 조합이에요.`; }
    else if (each >= 6 && sum >= 5) { johuScore = 0.8; johuLine = `두 사람 모두 ${jA.tempLabel} 쪽으로 기울어 있어요. 같은 계절의 결이라 편하지만, 둘 다 부족한 기운은 함께 채워 가야 해요.`; }
    else { johuScore = 2; johuLine = `기후의 결은 무난하게 어울려요(${jA.tempLabel} · ${jB.tempLabel}).`; }
  }

  const score = +clamp(r.score + johuScore, 2, 10).toFixed(1);
  const detail = [];
  if (r.goods.length) detail.push(`월지끼리 ${r.goods.map(kindLabel).join('·')}이 되어, 살아가는 방식과 중요하게 여기는 가치가 통하는 편이에요.`);
  else if (r.tenses.length) detail.push(`월지끼리 ${r.tenses.map(kindLabel).join('·')}의 결이라, 우선순위가 달라 부딪힐 수 있어요. "무엇을 더 중요하게 보는지"를 서로 말로 확인해 두면 좋아요.`);
  else detail.push('월지는 살아가는 무대와 가치관을 보는 자리예요. 두 사람은 특별히 얽히지 않아 각자의 영역을 존중하기 좋은 결이에요.');
  if (johuLine) detail.push(johuLine);

  return {
    key: 'month', title: '월지 — 가치관·계절의 결', weight: 10,
    score, tone: score >= 7 ? 'good' : score >= 4.5 ? 'mixed' : 'tense',
    headline: r.goods.length ? '살아가는 결이 통하는 편이에요' : r.tenses.length ? '중요하게 여기는 것이 서로 달라요' : '각자의 영역을 존중하기 좋은 결이에요',
    detail, rels: r.rels,
    basis: `${nameOf(A.saju, 'A')} 월지 ${b1}(${bHanja(b1)}) / ${nameOf(B.saju, 'B')} 월지 ${b2}(${bHanja(b2)})`,
  };
}

// ── ⑥ 신강·신약 보완 ─────────────────────────────────────────
function axisStrength(A, B) {
  const lA = A.a.strength.label, lB = B.a.strength.label;
  const rA = A.a.strength.supportRatio, rB = B.a.strength.supportRatio;
  const gap = Math.abs(rA - rB);
  const bothStrong = rA >= 55 && rB >= 55;
  const bothWeak = rA <= 45 && rB <= 45;

  let score, tone, headline, detail = [];
  if (gap >= 18 && !bothStrong && !bothWeak) {
    score = 9; tone = 'good';
    headline = '힘의 균형이 서로를 보완해요';
    detail.push(`한쪽(${lA})과 다른 쪽(${lB})의 기세가 달라, 밀고 당기는 역할이 자연스럽게 나뉘어요.`);
    detail.push('앞장서는 사람과 받쳐 주는 사람이 정해지기 쉬워, 큰 결정에서 교착이 적은 편이에요.');
  } else if (bothStrong) {
    score = 5.5; tone = 'mixed';
    headline = '둘 다 주관이 뚜렷한 편이에요';
    detail.push(`두 사람 모두 일간의 힘이 넉넉한 편(${lA} · ${lB})이에요. 각자 중심이 확실해 서로를 존중하면 든든하지만, 같은 사안에서 물러서지 않을 때가 있어요.`);
    detail.push('결정권을 영역별로 나눠 두면(예: 이건 네가, 저건 내가) 부딪힘이 크게 줄어요.');
  } else if (bothWeak) {
    score = 6; tone = 'mixed';
    headline = '둘 다 섬세한 편이에요';
    detail.push(`두 사람 모두 일간의 힘이 여유롭지 않은 편(${lA} · ${lB})이에요. 서로의 감정을 잘 알아채는 대신, 둘 다 지쳤을 때 기댈 곳이 부족할 수 있어요.`);
    detail.push('바깥에서 에너지를 채워 오는 각자의 루틴(운동·모임·취미)을 만들어 두면 관계가 훨씬 가벼워져요.');
  } else {
    score = 7.5; tone = 'good';
    headline = '힘의 결이 비슷해 호흡이 맞아요';
    detail.push(`두 사람의 기세(${lA} · ${lB})가 비슷해 속도와 강도가 잘 맞는 편이에요.`);
  }

  return {
    key: 'strength', title: '신강·신약 — 힘의 균형', weight: 10,
    score, tone, headline, detail,
    basis: `${nameOf(A.saju, 'A')} ${lA} ${rA}% / ${nameOf(B.saju, 'B')} ${lB} ${rB}%`,
    note: '신강·신약은 유파에 따라 한 단계 달라질 수 있어 참고로 봐 주세요.',
  };
}

// ── 4기둥 대응 관계 매트릭스 ─────────────────────────────────
const PILLAR_MEANING = {
  년: '뿌리·집안·어린 시절',
  월: '가치관·사회 활동·부모 형제',
  일: '나 자신과 배우자 자리',
  시: '미래·자녀·노년의 결',
};
function pillarMatrix(A, B) {
  const keys = [['년', 'year'], ['월', 'month'], ['일', 'day'], ['시', 'hour']];
  const out = [];
  for (const [lab, k] of keys) {
    const p1 = A.saju.pillars[k], p2 = B.saju.pillars[k];
    if (!p1 || !p2) { out.push({ pos: lab, meaning: PILLAR_MEANING[lab], unknown: true }); continue; }
    const s1 = STEMS[p1.stemIdx], s2 = STEMS[p2.stemIdx];
    const b1 = BRANCHES[p1.branchIdx], b2 = BRANCHES[p2.branchIdx];
    const stemRels = [];
    if (STEM_HAP[s1] && STEM_HAP[s1][0] === s2) stemRels.push({ kind: '천간합', tone: 'good', label: `${s1}${s2}합${STEM_HAP[s1][1]}` });
    if (STEM_CHUNG[s1] === s2) stemRels.push({ kind: '천간충', tone: 'tense', label: `${s1}${s2}충` });
    const brRels = branchRelation(b1, b2);
    out.push({
      pos: lab, meaning: PILLAR_MEANING[lab],
      a: { kor: p1.kor, hanja: p1.hanja }, b: { kor: p2.kor, hanja: p2.hanja },
      rels: [...stemRels, ...brRels],
    });
  }
  return out;
}

// ── 종합 ─────────────────────────────────────────────────────
/**
 * 두 사람의 궁합 분석.
 * @param {{saju:object, a:object}} A 첫 번째 사람 (computeSaju 결과 + analyze 결과)
 * @param {{saju:object, a:object}} B 두 번째 사람
 */
export function analyzeCompatibility(A, B) {
  const axes = [axisIlgan(A, B), axisIlji(A, B), axisElements(A, B), axisYear(A, B), axisMonth(A, B), axisStrength(A, B)];
  const total = axes.reduce((sum, x) => sum + x.score, 0);
  const score = Math.round(clamp(total, 0, 100));
  const grade = gradeOf(score);

  const nA = nameOf(A.saju, '첫 번째 분'), nB = nameOf(B.saju, '두 번째 분');

  // 잘 맞는 점 / 조율이 필요한 점
  const strengths = axes.filter((x) => x.tone === 'good').map((x) => ({ title: x.title, line: x.headline }));
  const cautions = axes.filter((x) => x.tone === 'tense').map((x) => ({ title: x.title, line: x.headline }));
  const mixed = axes.filter((x) => x.tone === 'mixed').map((x) => ({ title: x.title, line: x.headline }));

  // 실천 제안 — 축의 결과에서 도출
  const advice = [];
  const ilji = axes.find((x) => x.key === 'ilji');
  const ilgan = axes.find((x) => x.key === 'ilgan');
  const elems = axes.find((x) => x.key === 'elements');
  if (ilji.tone === 'tense') advice.push('생활 규칙(집안일·돈·연락 주기)을 말로 정해 두세요. 일지의 긴장은 대개 사소한 일상에서 먼저 드러나요.');
  if (ilgan.tone === 'tense') advice.push('의견이 갈릴 땐 그 자리에서 결론 내지 말고 하루 두고 다시 이야기해 보세요. 충(沖)의 힘은 시간을 두면 추진력으로 바뀌어요.');
  if (elems.lackA.length && elems.supplyToA < 8) advice.push(`${josaEge(nA)} 부족한 ${elems.lackA.join('·')} 기운은 관계 밖에서도 채워 보세요 — 그 기운과 어울리는 활동을 일상에 넣는 것으로 충분해요.`);
  if (elems.lackB.length && elems.supplyToB < 8) advice.push(`${josaEge(nB)} 부족한 ${elems.lackB.join('·')} 기운도 마찬가지예요.`);
  advice.push(`서로가 상대에게 어떤 자리인지 알아 두세요 — ${josaEge(nA)} ${josaEunNeun(nB)} “${ilgan.lens.aSees.tag}”, ${josaEge(nB)} ${josaEunNeun(nA)} “${ilgan.lens.bSees.tag}”예요.`);
  if (score >= 72) advice.push('통하는 자리가 많은 만큼, 편안함에 기대어 표현을 줄이지 않는 게 이 관계의 과제예요.');

  const headline = `${nA} × ${nB} — ${grade.label}`;

  return {
    score, grade, headline, axes,
    matrix: pillarMatrix(A, B),
    lens: ilgan.lens,
    strengths, cautions, mixed, advice,
    names: { a: nA, b: nB },
    disclaimer: '궁합은 두 사람의 관계를 정해 주는 판정이 아니라, 서로의 결을 이해하는 지도예요. 점수가 높다고 저절로 좋아지지도, 낮다고 안 되는 것도 아니에요 — 알고 맞춰 가는 쪽이 훨씬 큰 몫을 차지해요.',
  };
}
