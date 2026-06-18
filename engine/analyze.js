// ============================================================
//  saju · engine/analyze.js
//  원국(4기둥) → 오행 분포·십성·7대 영성 지표 분석.
//  프롬프트(사주풀이 프롬포트.txt)의 Knowledge Base 7지표를 그대로 구현.
// ============================================================

import {
  STEMS, BRANCHES, STEM_ELEMENT, BRANCH_ELEMENT, STEM_YANG, BRANCH_YANG,
  ELEMENTS, HIDDEN_STEMS, HIDDEN_WEIGHTS, GONGMANG_BY_SUN, SAMHAP, SAGO,
  SAGO_MEANING, SAJEONG, TAEGEUK, sipseongOf, SIPSEONG,
} from './constants.js';

/** 십성 → 분류군 (비겁/식상/재성/관성/인성) */
const SIPSEONG_GROUP = {
  비견: '비겁', 겁재: '비겁', 식신: '식상', 상관: '식상',
  편재: '재성', 정재: '재성', 편관: '관성', 정관: '관성', 편인: '인성', 정인: '인성',
};

export function analyze(saju) {
  const p = saju.pillars;
  const ilgan = saju.ilgan; // 일간 천간(한글)
  const pillarList = [
    { pos: '년', pillar: p.year },
    { pos: '월', pillar: p.month },
    { pos: '일', pillar: p.day },
    ...(p.hour ? [{ pos: '시', pillar: p.hour }] : []),
  ];
  const stems = pillarList.map((x) => STEMS[x.pillar.stemIdx]);
  const branches = pillarList.map((x) => BRANCHES[x.pillar.branchIdx]);

  // ── 오행 분포 ──────────────────────────────────────────
  // (1) 단순 글자수: 천간 + 지지(본기 오행)
  const countByElement = Object.fromEntries(ELEMENTS.map((e) => [e, 0]));
  for (const s of stems) countByElement[STEM_ELEMENT[STEMS.indexOf(s)]]++;
  for (const b of branches) countByElement[BRANCH_ELEMENT[BRANCHES.indexOf(b)]]++;

  // (2) 지장간 가중 분포(%) — 천간 가중 10, 지지는 지장간 일수 가중
  const weighted = Object.fromEntries(ELEMENTS.map((e) => [e, 0]));
  for (const s of stems) weighted[STEM_ELEMENT[STEMS.indexOf(s)]] += 10;
  for (const b of branches) {
    const hid = HIDDEN_STEMS[b], w = HIDDEN_WEIGHTS[b];
    hid.forEach((h, i) => { weighted[STEM_ELEMENT[STEMS.indexOf(h)]] += w[i]; });
  }
  const wTotal = Object.values(weighted).reduce((a, b) => a + b, 0) || 1;
  const weightedPct = Object.fromEntries(
    ELEMENTS.map((e) => [e, Math.round((weighted[e] / wTotal) * 1000) / 10]),
  );

  const ilganElement = STEM_ELEMENT[STEMS.indexOf(ilgan)];
  const sorted = [...ELEMENTS].sort((a, b) => countByElement[b] - countByElement[a]);
  const strongElements = sorted.filter((e) => countByElement[e] === countByElement[sorted[0]]);
  const missingElements = ELEMENTS.filter((e) => countByElement[e] === 0);
  const weakElements = [...ELEMENTS].sort((a, b) => countByElement[a] - countByElement[b])
    .filter((e) => countByElement[e] <= 1);

  // ── 십성 분포 ──────────────────────────────────────────
  // 천간(일간 제외) + 지지 정기 기준 십성 카운트
  const sipseongCount = Object.fromEntries(Object.keys(SIPSEONG_GROUP).map((k) => [k, 0]));
  const sipseongDetail = [];
  pillarList.forEach((x) => {
    const s = STEMS[x.pillar.stemIdx];
    if (!(x.pos === '일')) { // 일간 자신은 제외
      const ss = sipseongOf(ilgan, s);
      sipseongCount[ss]++;
      sipseongDetail.push({ pos: `${x.pos}간`, char: s, sipseong: ss });
    }
    // 지지 정기(본기)
    const b = BRANCHES[x.pillar.branchIdx];
    const mainHidden = HIDDEN_STEMS[b][HIDDEN_STEMS[b].length - 1];
    const ssb = sipseongOf(ilgan, mainHidden);
    sipseongCount[ssb]++;
    sipseongDetail.push({ pos: `${x.pos}지`, char: b, hidden: mainHidden, sipseong: ssb });
  });
  const groupCount = { 비겁: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 };
  for (const [k, v] of Object.entries(sipseongCount)) groupCount[SIPSEONG_GROUP[k]] += v;

  // ── 7대 영성 지표 ──────────────────────────────────────
  const indicators = [];

  // 1. 화개성 — 년지/일지 삼합국의 墓 글자가 원국 지지에 있나
  const hwagaeRefs = [];
  for (const ref of [{ pos: '일지', b: BRANCHES[p.day.branchIdx] }, { pos: '년지', b: BRANCHES[p.year.branchIdx] }]) {
    const grp = SAMHAP.find((g) => g.branches.includes(ref.b));
    if (grp) hwagaeRefs.push({ ...ref, hwagae: grp.hwagae });
  }
  const hwagaeChars = [...new Set(hwagaeRefs.map((r) => r.hwagae))];
  const hwagaePresent = hwagaeChars.filter((c) => branches.includes(c));
  indicators.push({
    key: 'hwagae', name: '화개성(華蓋星)',
    present: hwagaePresent.length > 0,
    evidence: hwagaeRefs.map((r) => `${r.pos} ${r.b} → 화개 ${r.hwagae}`).join(', ')
      + (hwagaePresent.length ? ` / 원국 지지에 ${hwagaePresent.join('·')} 존재` : ' / 원국에 해당 글자 없음'),
    meaning: '고독·지혜·종교적 인연·예술성·내면 탐구. 고립이 아니라 깊이 들어가 지혜를 얻는 힘.',
  });

  // 2. 태극귀인 — 일간 기준 특정 지지
  const taegeukTargets = TAEGEUK[ilgan] || [];
  const taegeukPresent = taegeukTargets.filter((t) => branches.includes(t));
  indicators.push({
    key: 'taegeuk', name: '태극귀인(太極貴人)',
    present: taegeukPresent.length > 0,
    evidence: `일간 ${ilgan} → ${taegeukTargets.join('·')} 중 `
      + (taegeukPresent.length ? `${taegeukPresent.join('·')} 존재` : '해당 없음'),
    meaning: '신비학·수행·역학 인연·우주적 질서에 대한 감각. 삶의 이치를 탐구하는 깊은 영적 성향.',
  });

  // 3. 공망 — 프롬프트 규약대로 일주·시주 旬 양쪽 기준
  const dayGongmang = GONGMANG_BY_SUN[Math.floor(p.day.ganjiIndex / 10)];
  const hourGongmang = p.hour ? GONGMANG_BY_SUN[Math.floor(p.hour.ganjiIndex / 10)] : null;
  const allGm = new Set([...dayGongmang, ...(hourGongmang || [])]);
  const gongmangHit = branches
    .map((b, i) => ({ b, pos: pillarList[i].pos })).filter((x) => allGm.has(x.b));
  indicators.push({
    key: 'gongmang', name: '공망(空亡)',
    present: gongmangHit.length > 0,
    uncertain: true,
    evidence: `일주 ${p.day.kor} → 공망 ${dayGongmang.join('·')}`
      + (hourGongmang ? ` / 시주 ${p.hour.kor} → 공망 ${hourGongmang.join('·')}` : '')
      + (gongmangHit.length ? ` / 원국 ${gongmangHit.map((x) => `${x.pos}지(${x.b})`).join(', ')} 공망` : ' / 원국 지지에 공망 없음')
      + ' (학파차로 추가 확인 권장)',
    meaning: '세속적 욕망에 대한 담담함·공성(空性)·삶의 본질에 대한 질문. 집착을 내려놓고 본질을 찾는 내면의 문.',
  });

  // 4. 편인 발달
  const pyeoninCount = sipseongCount.편인;
  const monthMain = HIDDEN_STEMS[BRANCHES[p.month.branchIdx]];
  const monthMainSip = sipseongOf(ilgan, monthMain[monthMain.length - 1]);
  const pyeoninDev = pyeoninCount >= 2 || monthMainSip === '편인';
  indicators.push({
    key: 'pyeonin', name: '편인(偏印) 발달',
    present: pyeoninDev,
    evidence: `편인 ${pyeoninCount}개${monthMainSip === '편인' ? ' / 월지 본기가 편인(월령 득)' : ''}`,
    meaning: '비주류 지혜·예리한 직관·신비학 적성·심리 분석력. 바르게 쓰면 상담·연구·치유의 재능.',
  });

  // 5. 사고(辰戌丑未) 발달
  const sagoHit = branches.map((b, i) => ({ b, pos: pillarList[i].pos })).filter((x) => SAGO.includes(x.b));
  indicators.push({
    key: 'sago', name: '사고(四庫·辰戌丑未) 발달',
    present: sagoHit.length >= 2,
    count: sagoHit.length,
    evidence: sagoHit.length
      ? sagoHit.map((x) => `${x.pos}지 ${x.b}(${SAGO_MEANING[x.b].split(' — ')[0]})`).join(', ')
      : '원국에 사고 없음',
    meaning: '특별한 업력·깊은 저장 에너지·수행 인연. 내면에 오래 축적된 감정과 기억, 후반부에 열리는 지혜.',
  });

  // 6. 칠살/상관 강세
  const chilsalCount = sipseongCount.편관; // 편관=칠살
  const sanggwanCount = sipseongCount.상관;
  const monthIsChilSang = monthMainSip === '편관' || monthMainSip === '상관';
  const chilSangStrong = (chilsalCount + sanggwanCount) >= 2 || monthIsChilSang;
  indicators.push({
    key: 'chilsang', name: '칠살(七殺)/상관(傷官) 강세',
    present: chilSangStrong,
    evidence: `칠살(편관) ${chilsalCount}개, 상관 ${sanggwanCount}개${monthIsChilSang ? ' / 월령이 칠살·상관' : ''}`,
    meaning: '삶의 굴곡·강한 압박감·기존 질서에 대한 저항·해탈과 자유에 대한 욕구. 상처를 지혜로 전환할 가능성.',
  });

  // 7. 특정 천간(壬癸丁)/지지(子午卯酉) 발달
  const specialStems = stems.filter((s) => ['임', '계', '정'].includes(s));
  const specialBranches = branches.filter((b) => SAJEONG.includes(b));
  indicators.push({
    key: 'special', name: '壬癸丁 · 子午卯酉 발달',
    present: specialStems.length > 0 || specialBranches.length >= 2,
    evidence: `천간 중 ${specialStems.length ? specialStems.join('·') : '없음'}`
      + ` / 사정성(子午卯酉) ${specialBranches.length ? specialBranches.join('·') : '없음'}`,
    meaning: '壬=깊은 지혜·통찰, 癸=섬세한 직관·영적 감수성, 丁=영감·내면의 빛. 자오묘유=영적 각성·변화의 문.',
  });

  // ── 스페셜 조합 (프롬프트 Special Combination) ────────
  const presentKeys = new Set(indicators.filter((i) => i.present).map((i) => i.key));
  const specialCombos = [];
  if (presentKeys.has('hwagae') && presentKeys.has('taegeuk') && presentKeys.has('gongmang') && presentKeys.has('pyeonin'))
    specialCombos.push('화개 + 태극귀인 + 공망 + 편인 — 영적 인연이 깊은 구조');
  if (presentKeys.has('sago') && presentKeys.has('chilsang'))
    specialCombos.push('사고 발달 + 칠살/상관 강세 — 내면의 압력이 수행으로 전환되는 구조');
  if (specialBranches.length >= 2 && specialStems.length > 0)
    specialCombos.push('子午卯酉 발달 + 丁/壬/癸 투출 — 감각의 예민함과 영적 각성');
  if (presentKeys.has('pyeonin') && (countByElement['수'] >= 3 || groupCount.인성 >= 2))
    specialCombos.push('편인 강세 + 고독한 원국 구조 — 탐구자형 기질');
  if (sagoHit.length >= 2 && specialStems.length > 0)
    specialCombos.push('사고 다중 + 丁/壬/癸 발달 — 깊은 저장 에너지와 영적 감수성');
  if (presentKeys.has('gongmang') && presentKeys.has('hwagae'))
    specialCombos.push('공망 + 화개 — 세속적 허무감 너머 본질을 향하는 구조');
  if (presentKeys.has('chilsang') && groupCount.관성 + groupCount.식상 >= 4)
    specialCombos.push('상관·칠살 강세 + 깊은 내면 갈등 구조 — 압력을 변화의 동력으로');

  // ── 신강/신약 근사 (참고용) ───────────────────────────
  // 일간 편: 비겁 + 인성, 반대: 식상 + 재성 + 관성 (가중 분포 기반 근사)
  let supportScore = 0, drainScore = 0;
  const isSupport = (el) => el === ilganElement || generates(el, ilganElement);
  pillarList.forEach((x) => {
    if (x.pos !== '일') { // 일간 자신은 기준점 — 세력 산입에서 제외
      const sEl = STEM_ELEMENT[x.pillar.stemIdx];
      if (isSupport(sEl)) supportScore += 1; else drainScore += 1;
    }
    const bEl = BRANCH_ELEMENT[x.pillar.branchIdx];
    const w = x.pos === '월' ? 2 : 1; // 월지 가중
    if (isSupport(bEl)) supportScore += w; else drainScore += w;
  });
  const totalSD = supportScore + drainScore;
  const supportRatio = supportScore / totalSD;
  let strength;
  if (supportRatio >= 0.62) strength = '신강(身强) 경향';
  else if (supportRatio <= 0.38) strength = '신약(身弱) 경향';
  else strength = '중화(中和)에 가까움';

  // ── 영성 잠재력 점수 (휴리스틱 요약, 0~100) ───────────
  const presentCount = indicators.filter((i) => i.present).length;
  let spiritScore = Math.round((presentCount / 7) * 70)
    + Math.min(specialCombos.length * 8, 20)
    + (specialStems.length ? 10 : 0);
  spiritScore = Math.min(100, spiritScore);

  return {
    elements: {
      count: countByElement, weightedPct, ilganElement,
      strong: strongElements, missing: missingElements, weak: weakElements,
    },
    sipseong: { count: sipseongCount, group: groupCount, detail: sipseongDetail, monthGod: monthMainSip },
    indicators,
    specialCombos,
    strength: { label: strength, supportRatio: Math.round(supportRatio * 100), note: '신강/신약은 통근·투간 등 정밀 판단이 필요하여 참고용입니다(추가 확인 권장).' },
    spiritScore,
    presentCount,
  };
}

/** a 오행이 b 오행을 생(生)하는가 */
function generates(a, b) {
  const SAENG = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' };
  return SAENG[a] === b;
}
