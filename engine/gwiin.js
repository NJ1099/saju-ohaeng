// ============================================================
//  gwiin.js — 귀인 지도의 관계 유형 판정
//
//  "이 사람은 나에게 어떤 사람인가"를 다섯 유형 중 하나로 잡는다.
//  두 사람의 궁합 점수(compat.js)와는 목적이 다르다.
//   · compat.js  = 둘이 얼마나 잘 맞는가 (점수)
//   · gwiin.js   = 나에게 **어떤 역할**로 오는 사람인가 (유형)
//
//  판정 근거는 전부 기존 명리 테이블이다.
//   ① 십성(十星) — 상대 일간이 내 일간에게 무엇인가(비겁·식상·재관·인성)
//   ② 일지 관계 — 육합·삼합·방합 / 충·형·해·원진 (engine/theory.js)
//   ③ 오행 보완 — 상대가 내 부족한 오행을 얼마나 채워 주는가 (초과분 기준)
//   ④ 천을귀인(天乙貴人) — 상대의 지지가 내 일간의 귀인 자리인가
//
//  ⚠️ 방향이 있는 판정이다. analyzeGwiin(host, guest) 는 **host 입장에서**
//     guest 가 어떤 사람인지를 말한다. 뒤집으면 결과가 달라질 수 있다
//     (내가 챙기는 사람 ↔ 나를 북돋는 사람은 서로 반대 자리다).
//
//  ⚠️ 톤 규약(THEORY.md 계승): 어떤 유형도 좋고 나쁨이 아니다.
//     '호랑이 선생'은 나쁜 인연이 아니라 자극이 큰 관계이고,
//     낮은 궁합은 "안 맞는다"가 아니라 "결이 달라 조율이 필요하다"로 쓴다.
// ============================================================
import { STEMS, BRANCHES, STEM_ELEMENT, CHEONEUL, sipseongOf } from './constants.js';
import { branchRelation } from './theory.js';
import { buildPersona } from './persona.js';

/** 다섯 관계 유형. 순서가 곧 동점일 때의 우선순위다. */
export const GWIIN_TYPES = {
  gwiin: {
    key: 'gwiin', emoji: '🌟', label: '귀인',
    line: '내게 없는 기운을 채워 주는 사람',
    desc: '내 사주에서 비어 있던 자리를 자연스럽게 메워 주는 관계예요. 이 사람과 있을 때 평소 잘 안 되던 일이 수월해지는 경험을 하기 쉬워요.',
    tip: '고마움을 표현으로 남겨 두세요. 귀인은 붙잡는 관계가 아니라 오래 이어 두는 관계예요.',
  },
  soulmate: {
    key: 'soulmate', emoji: '🤝', label: '단짝',
    line: '말하지 않아도 결이 통하는 사람',
    desc: '일지와 일간이 서로 묶이는 자리라, 설명을 길게 하지 않아도 통하는 편이에요. 함께 있는 시간이 편안합니다.',
    tip: '편안함에 기대어 표현을 줄이지 않는 게 이 관계의 과제예요.',
  },
  mine: {
    key: 'mine', emoji: '🌱', label: '내 사람',
    line: '내가 자꾸 챙기게 되는 사람',
    desc: '내 기운이 이 사람에게 흘러가는 자리(식상)예요. 돌봐 주고 싶고, 잘되면 내 일처럼 기쁜 관계입니다.',
    tip: '주는 쪽에 서기 쉬운 자리라, 내 몫이 비지 않는지 가끔 확인해 주세요.',
  },
  righthand: {
    key: 'righthand', emoji: '🧭', label: '오른팔',
    line: '일에서 나를 움직이게 하는 사람',
    desc: '재(財)·관(官)의 자리로 오는 관계예요. 함께 일을 벌이거나 나를 다잡아 주는 쪽으로 힘이 됩니다.',
    tip: '역할과 기대치를 말로 정해 두면 오래 갑니다. 애매하게 두면 서운함이 먼저 쌓여요.',
  },
  tiger: {
    key: 'tiger', emoji: '⚡', label: '호랑이 선생',
    line: '부딪히며 크게 배우게 하는 사람',
    desc: '일지가 서로를 흔드는 자리(충·형)예요. 편하지만은 않지만, 이 관계에서 배운 것은 오래 남습니다. 나쁜 인연이라는 뜻이 아니라 자극이 큰 인연이라는 뜻이에요.',
    tip: '그 자리에서 결론 내지 말고 하루 두고 다시 이야기해 보세요. 충의 힘은 시간을 두면 추진력이 돼요.',
  },
};

/** 십성을 네 갈래로 묶는다. */
function sipseongGroup(name) {
  if (['비견', '겁재'].includes(name)) return 'peer';        // 나와 같은 자리
  if (['식신', '상관'].includes(name)) return 'output';      // 내가 생하는 자리
  if (['편재', '정재', '정관'].includes(name)) return 'work';  // 재·정관
  if (name === '편관') return 'pressure';                     // 칠살 — 나를 눌러 단련시키는 자리
  return 'resource';                                          // 편인·정인 — 나를 생하는 자리
}

/**
 * 상대가 내 일간의 천을귀인 자리를 갖고 있는가.
 * ⚠️ 일지(日支)만 본다. 연·월·일 세 자리를 모두 보면 넷 중 하나꼴로 걸려
 *    유형 판정을 통째로 흔든다(실측 42%). 사람 자체를 가리키는 일지로 좁혔다.
 */
function hasCheoneul(hostIlgan, guestSaju) {
  const targets = CHEONEUL[hostIlgan] || [];
  const p = guestSaju.pillars.day;
  if (!targets.length || !p) return null;
  const b = BRANCHES[p.branchIdx];
  return targets.includes(b) ? [`일지 ${b}`] : null;
}

/** 오행 초과분 — 상대가 나보다 그 오행을 얼마나 '더' 갖고 있는가. */
function excessOf(guestA, hostA, el) {
  return Math.max(0, (guestA.elements.weightedPct[el] || 0) - (hostA.elements.weightedPct[el] || 0));
}

/**
 * 귀인 지도 관계 판정.
 * @param {{saju:object, a:object}} host  지도의 주인 (나)
 * @param {{saju:object, a:object}} guest 지도에 올라오는 사람
 * @returns {{type:object, scores:object, reasons:string[], detail:object}}
 */
export function analyzeGwiin(host, guest) {
  const hIlgan = STEMS[host.saju.pillars.day.stemIdx];
  const gIlgan = STEMS[guest.saju.pillars.day.stemIdx];
  const hIlji = BRANCHES[host.saju.pillars.day.branchIdx];
  const gIlji = BRANCHES[guest.saju.pillars.day.branchIdx];

  // ① 십성 — 상대 일간이 나에게 무엇인가
  const sipseong = sipseongOf(hIlgan, gIlgan);
  const group = sipseongGroup(sipseong);

  // ② 일지 관계
  const rels = branchRelation(hIlji, gIlji);
  const has = (kind) => rels.some((r) => r.kind === kind);
  const goodRel = rels.find((r) => r.tone === 'good') || null;
  const tenseRel = rels.find((r) => r.tone === 'tense') || null;

  // ③ 오행 보완 — 내가 부족한 오행을 상대가 얼마나 채워 주는가
  const lack = (host.a.elements.missing.length ? host.a.elements.missing : host.a.elements.weak).slice(0, 2);
  const supply = lack.reduce((sum, el) => sum + excessOf(guest.a, host.a, el), 0);

  // ④ 천을귀인
  const cheoneul = hasCheoneul(hIlgan, guest.saju);

  // ── 유형별 점수 ────────────────────────────────────────
  // 설계: **십성이 기준선(base 14점)** 이고, 오행 보완·일지 합충·천을귀인은 보정치다.
  // 보정치만으로 기준선을 뒤집으려면 확실한 신호(충·천을귀인·강한 보완)가 필요하다.
  // 보완량을 그대로 점수로 쓰면 초과분이 흔히 커서 거의 전부가 '귀인'으로 몰린다 —
  // 실제로 그렇게 만들었다가 45%가 귀인으로 나와 이 구조로 바꿨다.
  const scores = { gwiin: 0, soulmate: 0, mine: 0, righthand: 0, tiger: 0 };
  const why = { gwiin: [], soulmate: [], mine: [], righthand: [], tiger: [] };

  const BASE_OF = { resource: 'gwiin', peer: 'soulmate', output: 'mine', work: 'righthand', pressure: 'tiger' };
  const base = BASE_OF[group];
  scores[base] += 14;
  why[base].push({
    gwiin: `상대의 일간 ${gIlgan}은 나에게 ${sipseong} — 나를 북돋고 받쳐 주는 자리예요.`,
    soulmate: `상대의 일간이 나와 같은 결(${sipseong})이라, 말이 짧아도 통하는 편이에요.`,
    mine: `상대의 일간은 나에게 ${sipseong} — 내 기운이 이 사람 쪽으로 흘러가는 자리예요.`,
    righthand: `상대의 일간은 나에게 ${sipseong} — 일과 책임 쪽에서 힘이 되는 자리예요.`,
    tiger: `상대의 일간은 나에게 ${sipseong}(칠살) — 나를 다잡고 단련시키는 자리예요.`,
  }[base]);

  // 귀인 보정 — 빈자리를 채워 주는가 / 천을귀인인가
  if (supply >= 24) {
    scores.gwiin += 9;
    why.gwiin.unshift(`내게 부족한 ${lack.join('·')} 기운을 이 사람이 아주 넉넉히 갖고 있어요.`);
  } else if (supply >= 12) {
    scores.gwiin += 5;
    why.gwiin.unshift(`내게 부족한 ${lack.join('·')} 기운을 이 사람이 채워 주는 편이에요.`);
  } else if (supply > 0) {
    scores.gwiin += 2;
    why.gwiin.unshift(`내게 옅은 ${lack.join('·')} 기운을 조금 보태 주는 결이에요.`);
  }
  if (cheoneul) {
    scores.gwiin += 9;
    why.gwiin.unshift(`내 일간 ${hIlgan}의 천을귀인(天乙貴人) 자리(${cheoneul.join(', ')})를 갖고 있어요.`);
  }

  // 단짝 보정 — 일지가 묶이는가
  if (goodRel) {
    scores.soulmate += { 육합: 11, 삼합: 9, 방합: 5 }[goodRel.kind] || 5;
    why.soulmate.unshift(`두 사람의 일지가 ${goodRel.label} — 서로를 끌어당기는 자리예요.`);
  }
  if (STEM_ELEMENT[STEMS.indexOf(hIlgan)] === STEM_ELEMENT[STEMS.indexOf(gIlgan)]) scores.soulmate += 3;

  // 내 사람 · 오른팔 보정 — 합이 있으면 결이 더 편해진다
  if (goodRel) {
    scores.mine += 4; why.mine.push(`일지도 ${goodRel.kind}으로 묶여 편안한 결이에요.`);
    scores.righthand += 4; why.righthand.push(`일지가 ${goodRel.kind}으로 맞물려 손발이 맞는 편이에요.`);
  }

  // 호랑이 선생 보정 — 흔드는 자리인가
  if (tenseRel) {
    scores.tiger += { 충: 16, 형: 11, 원진: 8, 해: 5, 파: 4 }[tenseRel.kind] || 5;
    why.tiger.unshift(`두 사람의 일지가 ${tenseRel.label} — 서로를 흔들어 변화를 만드는 자리예요.`);
  }

  // ── 최고점 유형 ────────────────────────────────────────
  // 동점이면 십성이 정한 기준선 유형이 이긴다 (보정치는 뒤집을 만큼 확실할 때만 이긴다).
  let best = base;
  for (const k of ['gwiin', 'soulmate', 'righthand', 'mine', 'tiger']) {
    if (scores[k] > scores[best]) best = k;
  }

  const reasons = why[best].slice(0, 3);
  if (!reasons.length) reasons.push(`상대의 일간 ${gIlgan}은 나에게 ${sipseong}의 자리예요.`);

  return {
    type: GWIIN_TYPES[best],
    scores,
    reasons,
    detail: {
      sipseong, group,
      hostIlgan: hIlgan, guestIlgan: gIlgan,
      hostIlji: hIlji, guestIlji: gIlji,
      rels: rels.map((r) => r.label),
      supply: Math.round(supply * 10) / 10,
      lack,
      cheoneul,
      guestPersona: buildPersona(guest.saju),
    },
  };
}

/** 지도에 쌓인 사람들을 유형별로 센다. */
export function tallyMap(entries) {
  const out = {};
  for (const k of Object.keys(GWIIN_TYPES)) out[k] = 0;
  for (const e of entries) if (out[e.type] !== undefined) out[e.type] += 1;
  return out;
}

/**
 * 지도 주인에게 주는 한 줄 — 어떤 기운의 사람이 특히 귀한지.
 * 부족한 오행을 그대로 알려 주면 "어떤 사람을 곁에 두면 좋은지"가 된다.
 */
export function hostHint(host) {
  const lack = (host.a.elements.missing.length ? host.a.elements.missing : host.a.elements.weak).slice(0, 2);
  const strong = host.a.elements.strong?.slice(0, 1) || [];
  const EMOJI = { 목: '🌳', 화: '🔥', 토: '⛰️', 금: '⚒️', 수: '💧' };
  if (!lack.length) {
    return '오행이 고르게 갖춰진 편이라, 어떤 결의 사람과도 무난하게 어울리는 구성이에요.';
  }
  const strongPart = strong.length ? `내 사주엔 ${strong[0]} 기운이 넉넉하고 ` : '';
  return `${strongPart}${lack.join('·')} 기운이 옅어요 — ${lack.map((e) => `${EMOJI[e] || ''} ${e}`).join(', ')} 기운을 가진 사람이 특히 귀한 구성이에요.`;
}
