// ============================================================
//  타로 엔진 — 덱 구성 · 셔플 · 드로우 · 스프레드 해석 · 공유 인코딩
//
//  이 모듈은 **순수 로직만** 담는다. DOM·fetch·이미지에 의존하지 않는다.
//  카드 데이터와 주제 데이터는 호출자가 읽어서 넘긴다
//  (기존 promptBuilder.js 가 templateText 를 인자로 받는 것과 같은 규약).
//
//  카드 ID 규칙 — 공유 URL 에 그대로 실리므로 짧게 잡았다.
//    메이저: m00~m21 / 완드: w01~w14 / 컵: c01~c14 / 소드: s01~s14 / 펜타클: p01~p14
//    방향 접미사: u = 정방향(upright), r = 역방향(reversed)
// ============================================================

/** 수트 메타 — 원소·상징 영역·ID 접두사·이미지 파일 접두사. */
export const SUITS = {
  major: { id: 'm', file: 'major', label: '메이저 아르카나', element: null, domain: '삶의 큰 전환' },
  wands: { id: 'w', file: 'wands', label: '완드(지팡이)', element: '불', domain: '행동과 열정' },
  cups: { id: 'c', file: 'cups', label: '컵(성배)', element: '물', domain: '감정과 관계' },
  swords: { id: 's', file: 'swords', label: '소드(검)', element: '공기', domain: '생각과 말' },
  pents: { id: 'p', file: 'pents', label: '펜타클(동전)', element: '흙', domain: '현실과 물질' },
};

/** ID 접두사 → 수트 키 (디코딩용 역인덱스). */
const SUIT_BY_PREFIX = Object.fromEntries(
  Object.entries(SUITS).map(([key, v]) => [v.id, key]),
);

export const ORIENTATIONS = { u: '정방향', r: '역방향' };

/** 주제 키 9종 — 데이터 무결성 검사와 UI 순서의 단일 출처. */
export const TOPIC_KEYS = [
  'love', 'future', 'relation', 'reunion', 'job', 'business', 'money', 'career', 'exam',
];

// ── 덱 구성 ───────────────────────────────────────────────

/**
 * 수트별 카드 배열을 하나의 덱으로 합치고 파생 필드를 채운다.
 * @param {Object<string, Array>} parts { major:[...], wands:[...], cups:[...], swords:[...], pents:[...] }
 * @returns {Array} 78장 덱 (메이저 → 완드 → 컵 → 소드 → 펜타클 순)
 */
export function buildDeck(parts) {
  const deck = [];
  for (const suit of Object.keys(SUITS)) {
    const list = parts[suit];
    if (!Array.isArray(list)) throw new Error(`덱 데이터 누락: ${suit}`);
    for (const raw of list) {
      const suitMeta = SUITS[suit];
      deck.push({
        ...raw,
        suit,
        suitLabel: suitMeta.label,
        // 마이너는 수트 원소를 물려받고, 메이저는 카드마다 자기 원소를 갖는다.
        element: raw.element ?? suitMeta.element,
        domain: suitMeta.domain,
        img: `assets/tarot/${suitMeta.file}-${String(raw.no).padStart(2, '0')}.jpg`,
      });
    }
  }
  return deck;
}

/** ID → 카드 인덱스. 반복 조회가 잦아 한 번만 만들어 쓴다. */
export function indexDeck(deck) {
  return new Map(deck.map((c) => [c.id, c]));
}

// ── 난수 ──────────────────────────────────────────────────

/**
 * 암호학적 난수 기반 [0,1) 실수.
 * 브라우저·Node 18+ 모두 globalThis.crypto 를 갖는다. 없으면 Math.random 으로 물러선다.
 */
export function defaultRng() {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0] / 2 ** 32;
  }
  return Math.random();
}

/** [0, n) 정수. 나머지 연산의 모듈로 편향을 피하려고 실수 구간을 쓴다. */
const randInt = (n, rng) => Math.floor(rng() * n);

// ── 셔플 · 드로우 ─────────────────────────────────────────

/**
 * Fisher–Yates 셔플. 원본 배열을 건드리지 않는다.
 * @param {Array} deck
 * @param {Function} [rng] 0 이상 1 미만 실수를 돌려주는 함수 (테스트에서 주입)
 */
export function shuffle(deck, rng = defaultRng) {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1, rng);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 스프레드에 쓸 카드를 뽑는다. 같은 카드가 두 번 나오지 않는다.
 * @param {Array} deck 78장 덱
 * @param {Object} [opts]
 * @param {number} [opts.count=3] 뽑을 장수
 * @param {boolean} [opts.allowReversed=true] 역방향 허용 여부
 * @param {Function} [opts.rng]
 * @returns {Array<{id:string, o:'u'|'r'}>} 뽑힌 순서대로
 */
export function drawSpread(deck, opts = {}) {
  const { count = 3, allowReversed = true, rng = defaultRng } = opts;
  if (count > deck.length) throw new Error(`덱(${deck.length}장)보다 많이 뽑을 수 없습니다.`);
  return shuffle(deck, rng)
    .slice(0, count)
    .map((card) => ({
      id: card.id,
      // 실물 덱을 섞으면 절반 가까이가 뒤집힌다. 확률 0.5 로 그대로 재현한다.
      o: allowReversed && rng() < 0.5 ? 'r' : 'u',
    }));
}

// ── 해석 조립 ─────────────────────────────────────────────

/**
 * 뽑은 카드 + 주제 → 화면에 그릴 리딩 객체.
 * @param {Array<{id:string,o:string}>} draw drawSpread 결과 (또는 decodeDraw 결과)
 * @param {string} topicKey 9종 주제 키
 * @param {Array} topics data/tarot-topics.json 의 topics 배열
 * @param {Map} byId indexDeck 결과
 */
export function readSpread(draw, topicKey, topics, byId) {
  const topic = topics.find((t) => t.key === topicKey);
  if (!topic) throw new Error(`알 수 없는 주제: ${topicKey}`);
  if (draw.length !== topic.positions.length) {
    throw new Error(`${topic.label} 스프레드는 ${topic.positions.length}장이 필요합니다 (받은 값: ${draw.length}장).`);
  }

  const cards = draw.map((d, i) => {
    const card = byId.get(d.id);
    if (!card) throw new Error(`덱에 없는 카드: ${d.id}`);
    const o = d.o === 'r' ? 'r' : 'u';
    const topicText = card.t?.[topicKey]?.[o];
    if (!topicText) throw new Error(`해석 누락: ${card.id} / ${topicKey} / ${o}`);
    return {
      position: topic.positions[i],
      card,
      orientation: o,
      orientationLabel: ORIENTATIONS[o],
      reversed: o === 'r',
      keywords: card.kw[o],
      core: card.core[o],
      text: topicText,
    };
  });

  return { topic, cards, summary: summarize(cards, topic) };
}

/**
 * 스프레드 전체를 훑어 얻는 메타 관찰.
 * 카드 한 장씩의 뜻으로는 안 보이고 **세 장을 함께 놓아야** 보이는 것만 담는다.
 */
function summarize(cards, topic) {
  const majors = cards.filter((c) => c.card.suit === 'major');
  const reversed = cards.filter((c) => c.reversed);

  // 수트 쏠림 — 마이너 중 같은 수트가 2장 이상이면 그 영역이 판을 끌고 있다.
  const suitCount = {};
  for (const c of cards) {
    if (c.card.suit === 'major') continue;
    suitCount[c.card.suit] = (suitCount[c.card.suit] || 0) + 1;
  }
  const [domSuit, domN] = Object.entries(suitCount).sort((a, b) => b[1] - a[1])[0] || [null, 0];

  const notes = [];

  if (majors.length >= 2) {
    notes.push({
      tag: '큰 흐름',
      text: `메이저 아르카나가 ${majors.length}장 나왔어요. 내가 조절할 수 있는 범위를 넘어선 큰 흐름이 ${topic.label}을 밀고 있는 시기예요. 억지로 방향을 틀기보다 흐름의 성질을 읽고 올라타는 편이 낫습니다.`,
    });
  } else if (majors.length === 0) {
    notes.push({
      tag: '내 손 안',
      text: '메이저 아르카나가 한 장도 없어요. 지금 국면은 운명적인 사건보다 **일상의 선택과 습관**이 좌우합니다. 바꿀 수 있는 게 많다는 뜻이에요.',
    });
  }

  if (domN >= 2) {
    const s = SUITS[domSuit];
    notes.push({
      tag: s.label,
      text: `${s.label}이 ${domN}장이에요. 이번 국면의 무게중심은 **${s.domain}**에 실려 있습니다. 다른 쪽을 아무리 손봐도 여기가 풀리지 않으면 잘 움직이지 않아요.`,
    });
  }

  if (reversed.length === cards.length) {
    notes.push({
      tag: '전부 역방향',
      text: '세 장이 모두 역방향이에요. 나쁘다는 신호가 아니라 **에너지가 아직 바깥으로 나오지 않았다**는 뜻입니다. 지금은 펼치는 때가 아니라 안에서 고르고 다듬는 때예요.',
    });
  } else if (reversed.length === 0) {
    notes.push({
      tag: '전부 정방향',
      text: '세 장 모두 정방향이에요. 기운이 막힘 없이 바깥으로 향하고 있습니다. 미루던 일을 꺼내기 좋은 시기예요.',
    });
  }

  return {
    majorCount: majors.length,
    reversedCount: reversed.length,
    dominantSuit: domN >= 2 ? domSuit : null,
    notes,
  };
}

// ── 공유 URL 인코딩 ───────────────────────────────────────

/**
 * 뽑은 결과를 URL 파라미터 값으로 압축한다. 예: "m00u,w03r,s10u"
 * 시드가 아니라 **카드 자체**를 담으므로 셔플 구현이 바뀌어도 링크가 살아 있다.
 */
export function encodeDraw(draw) {
  return draw.map((d) => `${d.id}${d.o === 'r' ? 'r' : 'u'}`).join(',');
}

/**
 * encodeDraw 의 역함수. 형식이 조금이라도 어긋나면 null 을 돌려준다
 * (손상된 링크로 들어와도 앱이 죽지 않아야 한다).
 * @returns {Array<{id:string,o:string}>|null}
 */
export function decodeDraw(str, byId) {
  if (typeof str !== 'string' || !str) return null;
  const parts = str.split(',');
  if (parts.length < 1 || parts.length > 10) return null;

  const out = [];
  const seen = new Set();
  for (const p of parts) {
    const m = /^([mwcsp])(\d{2})([ur])$/.exec(p);
    if (!m) return null;
    const id = `${m[1]}${m[2]}`;
    if (seen.has(id)) return null;      // 같은 카드가 두 번 = 조작된 링크
    if (!byId.has(id)) return null;     // 덱에 없는 ID
    seen.add(id);
    out.push({ id, o: m[3] });
  }
  return out;
}

/** ID 로 수트를 되짚는다 (디코딩 결과를 검사할 때 쓴다). */
export function suitOfId(id) {
  return SUIT_BY_PREFIX[id?.[0]] ?? null;
}
