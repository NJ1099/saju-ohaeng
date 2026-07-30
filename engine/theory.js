// ============================================================
//  saju · engine/theory.js
//  명리 이론 계층 — 원국 위에서 한 단계 더 들어가는 판정들.
//    · 통근(通根)·투간(透干) 기반 신강/신약 정밀 판정
//    · 십이운성(十二運星)
//    · 신살(神殺) — 천을귀인·문창·역마·도화·양인·홍염·괴강·백호
//    · 조후(調候) — 한난조습
//    · 격국(格局) — 월지 본기 십성
//    · 용신(用神) 후보 — 억부 + 조후
//    · 원국 내부 형충회합(刑沖會合)
//  모든 판정은 '통설(通說)'을 기본값으로 하고, 학파차가 있는 항목은
//  결과 객체에 note 로 명시한다. 근거는 THEORY.md 참조.
// ============================================================

import {
  STEMS, BRANCHES, STEM_ELEMENT, BRANCH_ELEMENT, STEM_YANG,
  HIDDEN_STEMS, HIDDEN_WEIGHTS, SAENG, GEUK, ELEMENTS_HANJA,
  SAMHAP, BANGHAP, BRANCH_YUKHAP, YUKHAP_ELEMENT, BRANCH_CHUNG, STEM_CHUNG,
  SAMHYEONG, SANGHYEONG, JAHYEONG, BRANCH_HAE, BRANCH_PA, BRANCH_WONJIN,
  CHEONEUL, MUNCHANG, YANGIN, HONGYEOM, SAMHAP_SINSAL, GWAEGANG, BAEKHO,
  JOHU_BY_BRANCH, GYEOKGUK_NAME, GYEOKGUK_DESC, unseongOf, sipseongOf,
} from './constants.js';

/** 원국을 다루기 쉬운 형태로 편다. */
export function spread(saju) {
  const p = saju.pillars;
  const list = [
    { pos: '년', pillar: p.year },
    { pos: '월', pillar: p.month },
    { pos: '일', pillar: p.day },
    ...(p.hour ? [{ pos: '시', pillar: p.hour }] : []),
  ];
  return {
    list,
    stems: list.map((x) => STEMS[x.pillar.stemIdx]),
    branches: list.map((x) => BRANCHES[x.pillar.branchIdx]),
    positions: list.map((x) => x.pos),
    ilgan: saju.ilgan,
    ilganEl: STEM_ELEMENT[STEMS.indexOf(saju.ilgan)],
    monthBranch: BRANCHES[p.month.branchIdx],
    dayBranch: BRANCHES[p.day.branchIdx],
    yearBranch: BRANCHES[p.year.branchIdx],
    hourBranch: p.hour ? BRANCHES[p.hour.branchIdx] : null,
    dayPillarKor: p.day.kor,
  };
}

// ── 1. 통근(通根)·투간(透干) → 신강/신약 정밀 판정 ─────────────

/** 일간을 돕는 오행인가 — 같은 오행(비겁) 또는 나를 생하는 오행(인성) */
function helps(el, ilganEl) {
  return el === ilganEl || SAENG[el] === ilganEl;
}

/**
 * 통근 판정 — 지지 지장간 중 일간을 돕는 글자가 있는지, 얼마나 깊은지.
 * 정기(본기)에 뿌리내리면 깊고, 여기(餘氣)면 얕다.
 * @returns {{pos, branch, depth:'정기'|'중기'|'여기', stem, element, score}[]}
 */
export function findRoots(s) {
  const roots = [];
  s.list.forEach((x, i) => {
    const b = s.branches[i];
    const hid = HIDDEN_STEMS[b], w = HIDDEN_WEIGHTS[b];
    hid.forEach((h, hi) => {
      const el = STEM_ELEMENT[STEMS.indexOf(h)];
      if (!helps(el, s.ilganEl)) return;
      const isMain = hi === hid.length - 1;
      const depth = isMain ? '정기' : (hid.length === 3 && hi === 1 ? '중기' : '여기');
      // 자리 가중: 월지가 가장 세고(득령), 일지(득지)가 다음
      const posW = x.pos === '월' ? 2.0 : x.pos === '일' ? 1.5 : 1.0;
      // 같은 오행(비겁) 뿌리가 인성 뿌리보다 직접적
      const kindW = el === s.ilganEl ? 1.0 : 0.7;
      roots.push({
        pos: x.pos, branch: b, depth, stem: h, element: el,
        score: +((w[hi] / 30) * posW * kindW).toFixed(3),
      });
    });
  });
  return roots;
}

/**
 * 신강/신약 정밀 판정.
 *  득령(得令) — 월지가 일간을 돕는가 (가장 큰 비중)
 *  득지(得地) — 일지가 돕는가
 *  득세(得勢) — 나머지 지지·천간이 돕는가
 * @returns {{label, score, ratio, deukryeong, deukji, deukse, roots, rootCount, detail:string[], note}}
 */
export function judgeStrength(s) {
  const roots = findRoots(s);
  const monthRoots = roots.filter((r) => r.pos === '월');
  const dayRoots = roots.filter((r) => r.pos === '일');
  // 득령은 월지 '본기(정기)'가 비겁·인성일 때만 성립. 중기·여기 통근은 득령이 아니라 뿌리로만 본다.
  const deukryeong = monthRoots.some((r) => r.depth === '정기');
  const monthRootOnly = !deukryeong && monthRoots.length > 0;
  const deukji = dayRoots.length > 0;

  let support = 0, drain = 0;
  const detail = [];

  // (1) 지지 — 지장간 가중으로 아군/적군 세력 산정
  s.list.forEach((x, i) => {
    const b = s.branches[i];
    const hid = HIDDEN_STEMS[b], w = HIDDEN_WEIGHTS[b];
    const posW = x.pos === '월' ? 2.4 : x.pos === '일' ? 1.4 : 1.0;
    hid.forEach((h, hi) => {
      const el = STEM_ELEMENT[STEMS.indexOf(h)];
      const unit = (w[hi] / 30) * posW;
      if (helps(el, s.ilganEl)) support += unit; else drain += unit;
    });
  });

  // (2) 천간 — 일간 자신은 기준점이므로 제외. 투간은 뿌리 있을 때 힘이 실린다.
  s.list.forEach((x, i) => {
    if (x.pos === '일') return;
    const el = STEM_ELEMENT[x.pillar.stemIdx];
    const rooted = s.branches.some((b) => HIDDEN_STEMS[b].some((h) => STEM_ELEMENT[STEMS.indexOf(h)] === el));
    const unit = rooted ? 1.0 : 0.6; // 무근(無根) 천간은 힘이 약하다
    if (helps(el, s.ilganEl)) support += unit; else drain += unit;
  });

  const total = support + drain || 1;
  const ratio = support / total;

  if (deukryeong) detail.push(`월지 ${s.monthBranch}의 본기가 일간 편이라 득령(得令)했어요 — 계절의 힘을 받는 자리예요.`);
  else if (monthRootOnly) detail.push(`월지 ${s.monthBranch}의 본기는 일간 편이 아니라 실령(失令)이지만, 지장간 속에 얕은 뿌리가 남아 있어요.`);
  else detail.push(`월지 ${s.monthBranch}는 일간을 돕지 않아 실령(失令)이에요 — 계절의 힘을 못 받아요.`);
  if (deukji) detail.push(`일지 ${s.dayBranch}에 뿌리가 있어 득지(得地)했어요 — 스스로 딛고 설 자리가 있어요.`);
  else detail.push(`일지 ${s.dayBranch}에는 뿌리가 없어요 — 발밑의 지지대가 약한 편이에요.`);
  const otherRoots = roots.filter((r) => r.pos !== '월' && r.pos !== '일');
  if (otherRoots.length) detail.push(`${[...new Set(otherRoots.map((r) => `${r.pos}지 ${r.branch}`))].join('·')}에도 뿌리가 있어요.`);

  let label;
  if (ratio >= 0.60) label = '신강(身强)';
  else if (ratio >= 0.50) label = '중화신강(中和身强)';
  else if (ratio > 0.40) label = '중화신약(中和身弱)';
  else label = '신약(身弱)';
  // 득령·득지를 모두 못 하면 세력이 있어도 한 단계 낮춰 본다(통설)
  if (!deukryeong && !deukji && label === '신강(身强)') label = '중화신강(中和身强)';

  return {
    label, ratio: Math.round(ratio * 100), score: +support.toFixed(2),
    deukryeong, deukji, deukse: otherRoots.length > 0,
    roots, rootCount: roots.length, detail,
    note: '통근(지장간 뿌리)·투간·월령을 함께 본 판정입니다. 유파에 따라 결론이 한 단계 달라질 수 있어요.',
  };
}

// ── 2. 십이운성 ───────────────────────────────────────────────

/** 4기둥 각 지지에서 일간이 갖는 십이운성. */
export function twelveStages(s) {
  return s.list.map((x, i) => ({
    pos: x.pos, branch: s.branches[i], unseong: unseongOf(s.ilgan, s.branches[i]),
  }));
}

// ── 3. 신살(神殺) ─────────────────────────────────────────────

/**
 * 원국의 주요 신살.
 * 삼합 기준 신살(역마·도화·화개)은 년지·일지 둘 다를 기준으로 본다(통설).
 * @returns {{key,name,hanja,present,where:string[],meaning}[]}
 */
export function findSinsal(s) {
  const out = [];
  const bset = s.branches;
  const at = (target) => s.list.map((x, i) => (bset[i] === target ? `${x.pos}지` : null)).filter(Boolean);

  // 천을귀인
  const cheoneul = CHEONEUL[s.ilgan] || [];
  const cWhere = cheoneul.flatMap(at);
  out.push({
    key: 'cheoneul', name: '천을귀인', hanja: '天乙貴人', present: cWhere.length > 0,
    where: cWhere, target: cheoneul,
    meaning: '어려울 때 도와주는 사람이 나타나는 결. 귀인·인복·위기에서의 활로를 뜻해요.',
  });

  // 문창귀인
  const mWhere = at(MUNCHANG[s.ilgan]);
  out.push({
    key: 'munchang', name: '문창귀인', hanja: '文昌貴人', present: mWhere.length > 0,
    where: mWhere, target: [MUNCHANG[s.ilgan]],
    meaning: '글·공부·표현의 별. 배우고 정리해 풀어내는 재주와 인연이 있어요.',
  });

  // 역마 / 도화 — 년지·일지 삼합국 기준
  const refs = [...new Set([s.yearBranch, s.dayBranch])];
  const groups = SAMHAP_SINSAL.filter((g) => refs.some((r) => g.group.includes(r)));
  const yeokmaChars = [...new Set(groups.map((g) => g.yeokma))];
  const dohwaChars = [...new Set(groups.map((g) => g.dohwa))];
  const yWhere = yeokmaChars.flatMap(at);
  const dWhere = dohwaChars.flatMap(at);
  out.push({
    key: 'yeokma', name: '역마살', hanja: '驛馬', present: yWhere.length > 0,
    where: yWhere, target: yeokmaChars,
    meaning: '움직이는 기운. 이동·여행·이사·해외·변화가 잦고, 한자리에 오래 머물기 답답해할 수 있어요.',
  });
  out.push({
    key: 'dohwa', name: '도화살', hanja: '桃花', present: dWhere.length > 0,
    where: dWhere, target: dohwaChars,
    meaning: '사람을 끄는 매력의 기운. 현대에는 인기·표현력·예술 감각으로 읽는 것이 통설이에요.',
  });

  // 양인 (양간만)
  const yangin = YANGIN[s.ilgan];
  const yiWhere = yangin ? at(yangin) : [];
  out.push({
    key: 'yangin', name: '양인살', hanja: '羊刃', present: yiWhere.length > 0,
    where: yiWhere, target: yangin ? [yangin] : [],
    meaning: '칼처럼 날 선 추진력. 결단과 돌파에 강하지만 과하면 자기도 상하게 하니 방향이 중요해요.',
    note: yangin ? '' : '음간(乙丁己辛癸)의 양인은 학파차가 커서 판정에서 제외했어요.',
  });

  // 홍염
  const hWhere = at(HONGYEOM[s.ilgan]);
  out.push({
    key: 'hongyeom', name: '홍염살', hanja: '紅艶', present: hWhere.length > 0,
    where: hWhere, target: [HONGYEOM[s.ilgan]],
    meaning: '은은하게 사람을 끌어당기는 매력. 예술·미적 감각과 이어지기도 해요.',
  });

  // 괴강 / 백호 — 일주 기준
  out.push({
    key: 'gwaegang', name: '괴강', hanja: '魁罡', present: GWAEGANG.includes(s.dayPillarKor),
    where: GWAEGANG.includes(s.dayPillarKor) ? ['일주'] : [], target: [],
    meaning: '극단적으로 강한 리더십의 결. 카리스마가 뚜렷하고 중간이 적은 편이에요.',
    note: '무진·무술 포함 여부는 학파차가 있어요.',
  });
  out.push({
    key: 'baekho', name: '백호', hanja: '白虎', present: BAEKHO.includes(s.dayPillarKor),
    where: BAEKHO.includes(s.dayPillarKor) ? ['일주'] : [], target: [],
    meaning: '에너지가 강렬하게 몰리는 결. 옛 해석은 흉살이지만, 현대에는 강도(强度)와 집중력으로 읽어요.',
  });

  return out;
}

// ── 4. 조후(調候) ─────────────────────────────────────────────

/**
 * 한난조습 판정 — 월지를 기본 축으로, 나머지 지지·천간이 보조.
 * @returns {{temp, humid, tempLabel, humidLabel, need:string[], summary}}
 */
export function judgeJohu(s) {
  const m = JOHU_BY_BRANCH[s.monthBranch];
  let temp = m.temp * 2, humid = m.humid * 2; // 월지 가중 2배
  s.branches.forEach((b, i) => {
    if (s.positions[i] === '월') return;
    const j = JOHU_BY_BRANCH[b];
    temp += j.temp * 0.6; humid += j.humid * 0.6;
  });
  // 천간 화(火)는 온도를, 수(水)는 온도를 낮추고 습도를 올린다
  s.stems.forEach((st) => {
    const el = STEM_ELEMENT[STEMS.indexOf(st)];
    if (el === '화') { temp += 0.6; humid -= 0.4; }
    if (el === '수') { temp -= 0.6; humid += 0.4; }
  });
  temp = +temp.toFixed(2); humid = +humid.toFixed(2);

  const tempLabel = temp <= -2.5 ? '한(寒)' : temp < -0.8 ? '서늘함' : temp <= 0.8 ? '온화함' : temp < 2.5 ? '따뜻함' : '열(熱)';
  const humidLabel = humid <= -2.5 ? '조(燥)' : humid < -0.8 ? '건조한 편' : humid <= 0.8 ? '알맞음' : humid < 2.5 ? '축축한 편' : '습(濕)';

  const need = [];
  if (temp <= -2.5) need.push('화');
  if (temp >= 2.5) need.push('수');
  if (humid <= -2.5 && !need.includes('수')) need.push('수');
  if (humid >= 2.5 && !need.includes('화')) need.push('화');

  const summary = need.length
    ? `원국의 기후가 ${tempLabel}·${humidLabel} 쪽으로 기울어 ${need.map((e) => `${e}(${ELEMENTS_HANJA[e]})`).join('·')} 기운이 중화에 도움이 돼요.`
    : `원국의 기후가 ${tempLabel}·${humidLabel}으로 비교적 고른 편이에요.`;

  return { temp, humid, tempLabel, humidLabel, need, summary };
}

// ── 5. 격국(格局) ─────────────────────────────────────────────

/** 월지 본기 십성 → 격국. (내격 기준. 종격·화격 등 외격은 판정하지 않음) */
export function judgeGyeokguk(s) {
  const hid = HIDDEN_STEMS[s.monthBranch];
  const main = hid[hid.length - 1];
  const sip = sipseongOf(s.ilgan, main);
  return {
    sipseong: sip,
    name: GYEOKGUK_NAME[sip] || `${sip}격`,
    desc: GYEOKGUK_DESC[sip] || '',
    basis: `월지 ${s.monthBranch}의 본기 ${main} → 일간 ${s.ilgan} 기준 ${sip}`,
    note: '월지 본기(정기)를 기준으로 잡은 내격(內格) 판정입니다. 투간 여부·외격(종격 등)까지 보면 달라질 수 있어요.',
  };
}

// ── 6. 용신(用神) 후보 ────────────────────────────────────────

/**
 * 억부(抑扶) + 조후(調候)를 함께 본 용신 후보.
 * 정통 용신 판정은 사주 전체 국(局)을 봐야 하므로 '후보'로만 제시한다.
 * @returns {{primary:string[], reason, johuNeed:string[], avoid:string[], note}}
 */
export function judgeYongsin(s, strength, johu) {
  const el = s.ilganEl;
  const strong = strength.label.startsWith('신강') || strength.label === '중화신강(中和身强)';

  let eokbu, reason, avoid;
  if (strong) {
    // 신강 → 덜어내는 기운: 식상(내가 생) · 재성(내가 극) · 관성(나를 극)
    eokbu = [SAENG[el], GEUK[el], Object.keys(GEUK).find((k) => GEUK[k] === el)].filter(Boolean);
    reason = `일간 ${s.ilgan}(${el})의 힘이 넉넉한 편이라, 기운을 풀어 쓰거나(식상) 성과로 바꾸고(재성) 절제해 주는(관성) 쪽이 균형에 맞아요.`;
    avoid = [el, Object.keys(SAENG).find((k) => SAENG[k] === el)].filter(Boolean);
  } else {
    // 신약 → 보태는 기운: 인성(나를 생) · 비겁(같은 오행)
    eokbu = [Object.keys(SAENG).find((k) => SAENG[k] === el), el].filter(Boolean);
    reason = `일간 ${s.ilgan}(${el})의 힘이 여유롭지 않은 편이라, 나를 길러 주는(인성) 기운과 같은 편(비겁)이 힘이 돼요.`;
    avoid = [GEUK[el], Object.keys(GEUK).find((k) => GEUK[k] === el)].filter(Boolean);
  }

  // 조후가 급하면 조후용신을 앞세우는 것이 통설
  const primary = [...new Set([...johu.need, ...eokbu])];
  return {
    primary, eokbu, johuNeed: johu.need, avoid, reason,
    johuFirst: johu.need.length > 0,
    note: '억부(신강·신약)와 조후(한난조습)를 함께 본 후보입니다. 정밀 용신은 원국 전체의 짜임을 봐야 하므로 참고로 봐 주세요.',
  };
}

// ── 7. 원국 내부 형충회합(刑沖會合) ───────────────────────────

/** 두 지지 사이의 관계 하나를 판정 (합/충/형/해/파/원진). */
export function branchRelation(b1, b2) {
  const rels = [];
  if (BRANCH_YUKHAP[b1] === b2) {
    const key = [b1, b2].sort((x, y) => BRANCHES.indexOf(x) - BRANCHES.indexOf(y)).join('');
    rels.push({ kind: '육합', hanja: '六合', tone: 'good', element: YUKHAP_ELEMENT[key] || null, label: `${b1}${b2} 육합` });
  }
  const sam = SAMHAP.find((g) => g.branches.includes(b1) && g.branches.includes(b2) && b1 !== b2);
  if (sam) rels.push({ kind: '삼합(반합)', hanja: '半合', tone: 'good', element: sam.element, label: `${b1}${b2} ${sam.element}국 반합` });
  const bang = BANGHAP.find((g) => g.branches.includes(b1) && g.branches.includes(b2) && b1 !== b2);
  if (bang) rels.push({ kind: '방합(반방합)', hanja: '方合', tone: 'good', element: bang.element, label: `${b1}${b2} ${bang.name} 일부` });
  if (BRANCH_CHUNG[b1] === b2) rels.push({ kind: '충', hanja: '沖', tone: 'tense', label: `${b1}${b2} 충` });
  if (BRANCH_WONJIN[b1] === b2) rels.push({ kind: '원진', hanja: '怨嗔', tone: 'tense', label: `${b1}${b2} 원진` });
  if (BRANCH_HAE[b1] === b2) rels.push({ kind: '해', hanja: '害', tone: 'tense', label: `${b1}${b2} 해` });
  if (BRANCH_PA[b1] === b2) rels.push({ kind: '파', hanja: '破', tone: 'tense', label: `${b1}${b2} 파` });
  const sh = SANGHYEONG.find((g) => g.branches.includes(b1) && g.branches.includes(b2) && b1 !== b2);
  if (sh) rels.push({ kind: '형', hanja: '刑', tone: 'tense', label: `${b1}${b2} ${sh.name}` });
  if (b1 === b2 && JAHYEONG.includes(b1)) rels.push({ kind: '자형', hanja: '自刑', tone: 'tense', label: `${b1}${b2} 자형` });
  return rels;
}

/** 원국 8글자 안에서 일어나는 관계들 (기둥 쌍 전부 대조). */
export function findInternalRelations(s) {
  const out = [];
  for (let i = 0; i < s.branches.length; i++) {
    for (let j = i + 1; j < s.branches.length; j++) {
      for (const r of branchRelation(s.branches[i], s.branches[j])) {
        out.push({ ...r, from: `${s.positions[i]}지`, to: `${s.positions[j]}지` });
      }
    }
  }
  // 천간합·천간충
  for (let i = 0; i < s.stems.length; i++) {
    for (let j = i + 1; j < s.stems.length; j++) {
      if (STEM_CHUNG[s.stems[i]] === s.stems[j]) {
        out.push({ kind: '천간충', hanja: '天干沖', tone: 'tense', label: `${s.stems[i]}${s.stems[j]} 충`, from: `${s.positions[i]}간`, to: `${s.positions[j]}간` });
      }
    }
  }
  // 삼형 3자 완성 여부
  for (const g of SAMHYEONG) {
    if (g.branches.every((b) => s.branches.includes(b))) {
      out.push({ kind: '삼형', hanja: '三刑', tone: 'tense', label: `${g.branches.join('')} ${g.name}`, from: '원국', to: '전체', note: g.note });
    }
  }
  // 삼합·방합 완성 여부
  for (const g of SAMHAP) {
    if (g.branches.every((b) => s.branches.includes(b))) {
      out.push({ kind: '삼합 완성', hanja: '三合', tone: 'good', element: g.element, label: `${g.branches.join('')} ${g.element}국`, from: '원국', to: '전체' });
    }
  }
  for (const g of BANGHAP) {
    if (g.branches.every((b) => s.branches.includes(b))) {
      out.push({ kind: '방합 완성', hanja: '方合', tone: 'good', element: g.element, label: `${g.branches.join('')} ${g.name}`, from: '원국', to: '전체' });
    }
  }
  return out;
}

/**
 * 이론 계층 전체 실행.
 * @param {object} saju computeSaju 결과
 */
export function analyzeTheory(saju) {
  const s = spread(saju);
  const strength = judgeStrength(s);
  const johu = judgeJohu(s);
  const yongsin = judgeYongsin(s, strength, johu);
  return {
    spread: s,
    strength,
    stages: twelveStages(s),
    sinsal: findSinsal(s),
    johu,
    gyeokguk: judgeGyeokguk(s),
    yongsin,
    relations: findInternalRelations(s),
  };
}
