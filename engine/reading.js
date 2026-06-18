// ============================================================
//  saju · engine/reading.js
//  내장 자동풀이 — 프롬프트(사주풀이 프롬포트.txt)의 Output Format 7섹션을
//  계산된 원국·오행·지표에 적응적으로 반응하는 한국어 내러티브로 생성.
//  Style Guide 준수: 따뜻하되 단정 않음, "경향이 있다" 화법, 실천 지향.
//  Prohibited 준수: 숙명론·공포·시기단정·생년월일 임의계산 없음.
// ============================================================

import { pillarsText } from './saju.js';

const has = (a, k) => !!a.indicators.find((i) => i.key === k)?.present;

// 일간(천간)별 쉬운 비유 — 한자를 모르는 사람도 이해할 수 있게
const ILGAN_EASY = {
  갑: { img: '곧게 뻗는 큰 나무', desc: '곧고 진취적이며 리더십이 있어요. 한번 정하면 밀고 나가는 우직함이 강점이에요.' },
  을: { img: '바람에 휘는 풀·덩굴', desc: '부드럽고 유연하지만 끈질겨요. 환경에 잘 적응하고 사람을 편안하게 해요.' },
  병: { img: '세상을 비추는 태양', desc: '밝고 열정적이며 표현력이 좋아요. 주변을 환하게 만드는 에너지가 있어요.' },
  정: { img: '어둠을 밝히는 촛불', desc: '따뜻하고 섬세하며 직관이 예민해요. 은근하지만 깊은 빛을 내요.' },
  무: { img: '듬직한 큰 산', desc: '안정적이고 포용력이 커요. 믿음직해서 사람들이 기대요.' },
  기: { img: '곡식을 기르는 기름진 흙', desc: '섬세하고 실속 있으며 잘 길러내요. 조용히 자기 것을 가꿔요.' },
  경: { img: '큰 쇠·도끼', desc: '결단력 있고 강직해요. 불의를 잘 못 참고 추진력이 강해요.' },
  신: { img: '잘 벼려진 보석·칼', desc: '예리하고 세련됐으며 자존심이 있어요. 완성도를 중시해요.' },
  임: { img: '넓은 강·바다', desc: '지혜롭고 포용력이 크며 흐름을 읽어요. 생각이 깊고 멀리 봐요.' },
  계: { img: '촉촉한 빗물·이슬', desc: '섬세한 직관과 감수성이 풍부해요. 조용히 스며들어 적셔요.' },
};
const EL_TRAIT = { 목: '성장과 시작', 화: '열정과 표현', 토: '안정과 신뢰', 금: '결단과 원칙', 수: '지혜와 사색' };

/**
 * 쉬운 요약 — 한자·전문용어 없이 한눈에 이해하는 풀이.
 * @returns {{headline, lines: string[], chips: string[]}}
 */
export function buildSimpleSummary(saju, a, luck) {
  const name = saju.input.name || '당신';
  const el = a.elements.ilganElement;
  const ig = ILGAN_EASY[saju.ilgan];
  const strong = a.elements.strong[0];
  const missing = a.elements.missing;

  const headline = `${name}님은 “${saju.ilgan}(${saju.ilganHanja}) ${el}” — ${ig.img} 같은 사람이에요.`;
  const lines = [];
  lines.push(`🌱 **타고난 성향** — ${ig.desc}`);

  let bal = `⚖️ **오행 균형** — ${strong} 기운이 가장 두터워 ‘${EL_TRAIT[strong]}’의 면이 잘 드러나요.`;
  if (missing.length) bal += ` 다만 ${missing.join('·')} 기운이 비어 있어, 그쪽은 의식적으로 채워가면 균형이 좋아져요.`;
  else bal += ' 오행이 비교적 고르게 갖춰져 두루 잘 어울려요.';
  lines.push(bal);

  const sr = a.strength.label;
  let trait = sr.includes('신강') ? '주관이 뚜렷하고 추진력이 있어, 스스로 정하고 끌고 가는 힘이 강해요.'
    : sr.includes('신약') ? '섬세하고 조화를 잘 이뤄, 좋은 사람·환경과 함께할 때 더 빛나요.'
      : '한쪽으로 치우치지 않아 균형 감각이 좋고 상황에 유연하게 맞춰요.';
  if (a.spiritScore >= 55) trait += ' 직관과 내면을 들여다보는 힘도 발달한 편이에요.';
  lines.push(`🧭 **나라는 사람** — ${trait}`);

  if (luck && luck.daewoon && luck.daewoon.currentIndex >= 0) {
    const cur = luck.daewoon.list[luck.daewoon.currentIndex];
    lines.push(`📅 **요즘 흐름** — 지금은 ${cur.age}세부터의 ‘${cur.kor}(${cur.hanja})’ 대운을 지나며, ${cur.sipseong}의 기운이 흐르는 시기예요. (참고일 뿐, 정해진 운명은 아니에요.)`);
  }

  const adviceEl = missing[0] || strong;
  const adviceMap = {
    목: '새로운 시도를 하나 시작해보기', 화: '마음을 말로 꺼내고 사람과 온기 나누기',
    토: '규칙적인 루틴으로 중심 잡기', 금: '끊을 것을 적어 분명히 매듭짓기', 수: '혼자만의 사색·휴식 시간 갖기',
  };
  lines.push(`💡 **오늘의 한 걸음** — ${adviceMap[adviceEl] || '잠시 멈춰 지금의 감정을 적어보기'}.`);

  const chips = [
    `일간 ${saju.ilgan}·${el}`,
    `${strong} 강`,
    ...(missing.length ? [`${missing.join('·')} 부족`] : ['오행 균형']),
    a.strength.label.replace(' 경향', ''),
    `영성 ${a.spiritScore}점`,
  ];
  return { headline, lines, chips };
}

/** 영성 유형 선택 (Section 3) */
function pickType(saju, a) {
  const el = a.elements.ilganElement;
  if (has(a, 'chilsang') && (has(a, 'sago') || has(a, 'gongmang')))
    return {
      label: '상처를 통찰로 바꾸는 치유자형',
      desc: '당신의 원국에는 안으로 눌리는 압력과 오래 저장된 감정의 무게가 함께 보입니다. 이 압력은 당신을 무너뜨리려는 것이 아니라, 같은 자리에서 아파본 사람만이 줄 수 있는 깊은 이해를 길러냅니다. 자신의 상처를 먼저 들여다본 만큼, 타인의 상처를 읽어내는 힘이 자라기 쉽습니다.',
    };
  if (has(a, 'hwagae') && has(a, 'pyeonin'))
    return {
      label: '고독을 통해 지혜가 열리는 수행자형',
      desc: '혼자 있는 시간에 오히려 또렷해지는 사람입니다. 화개와 편인의 기운은 군중 속의 외로움을 만들기도 하지만, 그 고독을 피하지 않고 안으로 들어갈 때 남들이 못 보는 결을 읽어냅니다. 고독은 당신에게 결핍이 아니라 작업실입니다.',
    };
  if (has(a, 'pyeonin') && a.sipseong.group.인성 >= 2)
    return {
      label: '세속과 영성 사이에서 자기 철학을 세워야 하는 탐구자형',
      desc: '현실의 성취와 내면의 의미, 두 세계 사이에서 자주 갈등하는 구조입니다. 어느 한쪽을 버리라는 신호가 아니라, 당신만의 기준으로 둘을 잇는 철학을 세우라는 초대에 가깝습니다. 정답을 찾기보다 질문을 오래 품는 데 강점이 있습니다.',
    };
  if (has(a, 'special'))
    return {
      label: '강한 직관을 현실적 실천으로 내려야 하는 영감형',
      desc: '느낌이 먼저 도착하는 사람입니다. 임·계·정(壬癸丁)이나 자오묘유(子午卯酉)의 기운은 예민한 감각과 번뜩이는 직관을 주지만, 그 직관이 현실의 행동으로 착지하지 못하면 공상에 머물기 쉽습니다. 떠오른 것을 작게라도 실행으로 옮기는 습관이 당신의 재능을 완성합니다.',
    };
  if (has(a, 'chilsang'))
    return {
      label: '내면의 압박을 삶의 사명으로 바꾸는 변환자형',
      desc: '편안함보다 긴장 속에서 더 살아있다고 느끼는 사람입니다. 그 추진력은 자신을 몰아붙이는 데 쓰면 소진이 되지만, 분명한 방향을 만나면 누구보다 멀리 가는 동력이 됩니다.',
    };
  const byEl = {
    목: '뻗어 나가려는 성장 지향형 — 새로 시작하고 키우는 데 강점이 있습니다.',
    화: '드러내고 밝히는 표현형 — 열정과 직관으로 사람을 끌어당깁니다.',
    토: '품고 중재하는 안정형 — 사람과 일을 받쳐주는 신뢰의 자리에 섭니다.',
    금: '벼리고 결단하는 정련형 — 기준이 분명하고 끝맺음이 단단합니다.',
    수: '흐르고 사유하는 통찰형 — 깊이 생각하고 멀리 내다봅니다.',
  };
  return {
    label: `${el}의 기운을 중심으로 자기 길을 찾는 ${{ 목: '성장', 화: '표현', 토: '안정', 금: '정련', 수: '통찰' }[el]}형`,
    desc: byEl[el],
  };
}

/** 현재 영적 단계 추정 (Section 5) */
function pickStage(a) {
  const score = a.presentCount + a.specialCombos.length * 1.5
    + (has(a, 'chilsang') ? 1 : 0) + (has(a, 'sago') ? 1 : 0);
  const stages = [
    {
      n: 1, title: '군중 속의 고독 / 각성 초기',
      traits: ['사람들 속에서도 문득 찾아오는 외로움', '삶의 의미에 대한 막연한 질문', '일상이 가끔 공허하게 느껴짐', '아직 방향은 없지만 내면의 부름을 느낌'],
    },
    {
      n: 2, title: '근본 지혜 탐구 / 회의감과 전환기',
      traits: ['사주·철학·심리·영성에 대한 관심 증가', '기존 삶의 방식에 대한 회의', '인간관계를 정리하고 싶은 욕구', '혼란과 통찰이 함께 찾아옴'],
    },
    {
      n: 3, title: '세상을 위한 헌신 / 자기 재능의 나눔',
      traits: ['자신의 고통을 타인을 돕는 지혜로 전환', '상담·교육·예술·치유·글쓰기와 연결', '자기 삶의 철학이 형성됨', '인정 욕구보다 사명감으로 움직임'],
    },
  ];
  let cur = 1;
  if (score >= 4) cur = 2;
  if (score >= 6) cur = 3;
  return { current: cur, stages };
}

/** 오행 균형 기반 감정관리 가이드 (Section 6-3) */
function energyGuide(a) {
  const strong = a.elements.strong[0];
  const missing = a.elements.missing;
  const tips = [];
  const strongMap = {
    목: '생각과 계획이 앞서 나갈 때 — 머리로만 키우지 말고 몸을 움직여 땅에 뿌리내리세요(걷기·정원·운동).',
    화: '감정이 빠르게 타오를 때 — 표현하기 전 한 호흡 두기. 호흡 명상이 과열을 식혀줍니다.',
    토: '혼자 다 떠안으려 할 때 — 받쳐주는 역할을 잠시 내려놓고, 도움을 청하는 연습을 하세요.',
    금: '기준이 날카로워질 때 — 옳고 그름을 잠시 미루고, 자기 비난을 멈추고 감정을 그대로 기록하세요.',
    수: '사색이 끝없이 깊어질 때 — 생각의 물이 고이지 않도록 말보다 기록으로 흘려보내고, 자연 속에서 회복하세요.',
  };
  if (strong) tips.push(strongMap[strong]);
  const missMap = {
    목: '목(시작·성장)이 약합니다 — 아주 작은 새 시도를 주기적으로 만들어 추진의 근육을 키우세요.',
    화: '화(활력·표현)가 약합니다 — 마음을 말로 꺼내고, 햇빛과 사람의 온기를 의식적으로 쬐세요.',
    토: '토(안정·중심)가 약합니다 — 규칙적인 루틴과 몸을 쓰는 일과로 땅을 다지세요.',
    금: '금(결단·정리)이 약합니다 — 끊어야 할 것을 종이에 적어 분명히 매듭짓는 연습을 하세요.',
    수: '수(사유·휴식)가 약합니다 — 혼자 있는 시간과 충분한 수면으로 내면의 우물을 채우세요.',
  };
  for (const m of missing) if (missMap[m]) tips.push(missMap[m]);
  // 십성 분포 기반 보완 (프롬프트 6-3: 오행 + 십성 근거)
  const g = a.sipseong.group;
  if (g.식상 >= 3) tips.push('식상이 많습니다 — 표현·발산 욕구가 강해 과열되기 쉬우니, 쏟아내기 전 기록으로 한 번 거르는 습관이 도움이 됩니다.');
  else if (g.관성 >= 3) tips.push('관성이 많습니다 — 책임과 규범을 안으로 끌어안아 압박이 쌓이기 쉬우니, 짊어진 것을 주기적으로 내려놓는 의식을 만드세요.');
  else if (g.재성 >= 3) tips.push('재성이 많습니다 — 바깥의 일과 성과로 향하기 쉬우니, 의식적으로 내면을 돌보는 시간을 일정에 넣어두세요.');
  else if (g.인성 >= 3) tips.push('인성이 많습니다 — 받아들이고 사유하는 힘이 큰 만큼 생각이 행동으로 늦게 이어질 수 있으니, 작은 실행 하나를 먼저 붙여보세요.');
  if (!tips.length) tips.push('오행이 비교적 고른 편입니다 — 한쪽으로 치우칠 때 반대 기운의 활동(고요/활동, 사색/실행)을 의식적으로 보충하세요.');
  return tips;
}

/** 자기성찰 질문 5개 (Section 6-2) — 지표에 맞춰 선택 */
function reflectQuestions(a) {
  const base = [
    '나는 지금 무엇을 피하고 있는가?',
    '이 감정은 나에게 무엇을 보게 하려는가?',
    '오늘 내가 바꿀 수 있는 가장 작은 행동은 무엇인가?',
  ];
  if (has(a, 'pyeonin') || has(a, 'hwagae')) base.push('내 직관은 이미 알고 있지만, 나는 무엇을 외면하고 있는가?');
  if (has(a, 'chilsang')) base.push('나는 누구를(무엇을) 이기려 애쓰며, 정작 무엇을 지키고 싶은가?');
  if (a.sipseong.group.인성 >= 2) base.push('나는 의미를 핑계로 현실의 어떤 매듭을 미루고 있는가?');
  base.push('내가 반복해서 선택하는 관계의 패턴은 무엇인가?');
  return base.slice(0, 5);
}

/**
 * 전체 자동풀이 생성.
 * @returns {{sections: {id,title,md}[], typeLabel, stage}}
 */
export function buildReading(saju, a) {
  const t = pillarsText(saju, true);
  const name = saju.input.name || '당신';
  const el = a.elements.ilganElement;
  const type = pickType(saju, a);
  const stageInfo = pickStage(a);
  const sections = [];

  // ── 1. 원국 요약 ──────────────────────────────────────
  const importantChars = [];
  for (const i of a.indicators) if (i.present) importantChars.push(i.name.split('(')[0]);
  sections.push({
    id: 'summary', title: '1. 원국 요약',
    md: [
      `**일간(日干)**은 **${saju.ilgan}(${saju.ilganHanja}) · ${el}**입니다. 사주에서 일간은 '나 자신'을 가리키는 글자로, 모든 해석의 중심이 됩니다.`,
      '',
      `| 기둥 | 천간·지지 |`,
      `|------|-----------|`,
      `| 년주 | ${t.year} |`,
      `| 월주 | ${t.month} |`,
      `| 일주 | ${t.day} |`,
      `| 시주 | ${t.hour} |`,
      '',
      `- **강하게 드러나는 오행**: ${a.elements.strong.join('·')} (${a.elements.count[a.elements.strong[0]]}자)`,
      a.elements.missing.length
        ? `- **약하거나 없는 오행**: ${a.elements.missing.join('·')} — 비어 있는 자리는 결핍이 아니라, 살면서 의식적으로 채워가는 과제로 봅니다.`
        : `- **오행 분포**: 비교적 고르게 갖춘 편입니다.`,
      `- **월령(月令) 십성**: ${a.sipseong.monthGod} — 타고난 기질의 큰 방향을 보여줍니다.`,
      importantChars.length
        ? `- **영성 분석에서 중요한 지표**: ${importantChars.join(', ')}`
        : `- **영성 지표**: 두드러진 지표는 적은 편이나, 그것이 영성의 부재를 뜻하지는 않습니다.`,
    ].join('\n'),
  });

  // ── 2. 선천적 영성 지표 분석 ──────────────────────────
  const indMd = a.indicators.map((i) => [
    `### ${i.present ? '● ' : '○ '}${i.name}`,
    `- **원국 근거**: ${i.evidence}`,
    `- **해석**: ${i.meaning}`,
    `- **상태**: ${i.present ? '원국에 드러납니다.' : '뚜렷이 드러나지는 않습니다.'}${i.uncertain ? ' (계산 정밀도상 추가 확인 권장)' : ''}`,
  ].join('\n')).join('\n\n');
  sections.push({
    id: 'indicators', title: '2. 선천적 영성 지표 분석',
    md: `아래 7가지 지표를 원국과 대조해 하나씩 살펴봅니다. ● 는 드러난 지표, ○ 는 약한 지표입니다.\n\n${indMd}`,
  });

  // ── 3. 핵심 영성 유형 ─────────────────────────────────
  sections.push({
    id: 'type', title: '3. 핵심 영성 유형',
    md: [
      `아래는 원국에서 가장 자연스럽게 드러나는 _경향_에 대한 추정입니다. 확정된 정체성이 아니라, 당신이 힘을 가장 편하게 쓸 수 있는 방향에 가깝습니다.`,
      '',
      `> **${type.label}**`,
      '',
      type.desc,
      '',
      a.specialCombos.length
        ? `원국에서 **${a.specialCombos.map((c) => c.split(' — ')[0]).join(', ')}** 같은 조합이 함께 보이는 점도 이 유형을 뒷받침합니다. 다만 이는 숙명이 아니라, 당신이 자기 철학과 내면의 힘을 세울 수 있는 잠재력으로 읽어야 합니다.`
        : `이 유형은 고정된 정체성이 아니라, 당신이 가장 자연스럽게 힘을 쓸 수 있는 방향에 대한 안내입니다.`,
    ].join('\n'),
  });

  // ── 4. 반복되기 쉬운 내면 과제 ────────────────────────
  const tasks = [];
  if (has(a, 'hwagae') || has(a, 'pyeonin') || el === '수') tasks.push('혼자 감당하려는 성향 — 깊이 들어가는 힘이 강한 만큼, 도움을 청하기보다 안으로 삭이기 쉽습니다.');
  if (a.sipseong.group.인성 >= 2) tasks.push('세속적 성공과 내면의 의미 사이의 갈등 — 둘 중 하나를 선택해야 한다는 압박을 자주 느낄 수 있습니다.');
  if (has(a, 'chilsang')) tasks.push('과도한 책임감 또는 자기 압박 — 스스로에게 엄격해 쉬어도 될 때 멈추지 못하는 경향이 있습니다.');
  if (has(a, 'special')) tasks.push('직관은 강하지만 현실화가 어려운 지점 — 느낌은 빠른데 실행으로 옮기는 데서 자주 머뭇거립니다.');
  tasks.push('인간관계에서의 피로감 — 사람들에게 맞춰주다 에너지를 소진하기 쉽습니다.');
  sections.push({
    id: 'tasks', title: '4. 반복되기 쉬운 내면 과제',
    md: [
      `현재의 고민을 입력받지 않았으므로, 아래는 **원국만을 근거로 한 경향**입니다. "반드시 그렇다"가 아니라 "이런 경향이 나타날 수 있다"로 읽어 주세요.`,
      '',
      ...tasks.map((x) => `- ${x}`),
      '',
      `이 과제들은 약점이 아니라, 알아차리는 순간 다르게 선택할 수 있는 지점들입니다.`,
    ].join('\n'),
  });

  // ── 5. 현재의 영적 단계 추정 ──────────────────────────
  const cur = stageInfo.stages[stageInfo.current - 1];
  sections.push({
    id: 'stage', title: '5. 현재의 영적 단계 추정',
    md: [
      `고민·대운·세운이 입력되지 않았으므로 단정할 수 없지만, 원국 구조로 보아 **${stageInfo.current}단계: ${cur.title}**를 지나고 있을 가능성이 있습니다.`,
      '',
      `- **추정 단계**: ${stageInfo.current}단계 — ${cur.title}`,
      `- **이 단계의 특징**: ${cur.traits.join(' · ')}`,
      `- **핵심 과제**: ${stageInfo.current === 1 ? '내면의 부름을 부정하지 않고 작은 탐색을 시작하는 것' : stageInfo.current === 2 ? '혼란을 견디며 자기만의 공부와 수행의 리듬을 만드는 것' : '자기 재능을 세상과 나누는 통로를 구체적으로 여는 것'}`,
      `- **다음 단계로 가기 위한 방향**: ${stageInfo.current === 1 ? '관심이 가는 분야를 가볍게 배워보며 방향의 윤곽을 잡기' : stageInfo.current === 2 ? '배운 것을 작게라도 실천·기록하며 통찰을 현실에 착지시키기' : '나눔을 지속 가능한 형태(일·활동·공동체)로 구조화하기'}`,
      '',
      `단계는 사다리가 아니라 나선입니다. 오갈 수 있고, 어느 단계에 있든 그 자리에서 할 수 있는 일이 있습니다.`,
    ].join('\n'),
  });

  // ── 6. 삶을 변화시키는 실천적 솔루션 ──────────────────
  const guide = energyGuide(a);
  const questions = reflectQuestions(a);
  sections.push({
    id: 'solution', title: '6. 삶을 변화시키는 실천적 솔루션',
    md: [
      `명리는 잠재력일 뿐이며, 실제 변화는 당신의 선택과 실천에 달려 있습니다.`,
      '',
      `**6-1. 마인드셋 전환**`,
      `- "나는 사주 때문에 이렇게 사는 것이 아니다. 나는 내 경향성을 이해하고 다르게 선택할 수 있다."`,
      `- "지금의 고독과 예민함은 잘못된 것이 아니다. 그것은 깊이 살아내기 위한 감각이다."`,
      `- "고통은 나를 무너뜨리기 위한 것이 아니라 깨우기 위한 압력이다."`,
      '',
      `**6-2. 매일 실천할 자기성찰 질문**`,
      ...questions.map((q, i) => `${i + 1}. ${q}`),
      '',
      `**6-3. 감정과 에너지 관리법** (당신의 오행 균형 기준)`,
      ...guide.map((g) => `- ${g}`),
      '',
      `**6-4. 인간관계 정리법**`,
      `- 에너지를 빼앗는 관계와, 진심으로 성장에 도움이 되는 관계를 종이에 나눠 적어보세요.`,
      `- 죄책감으로 유지하는 관계, 인정 욕구 때문에 끌려가는 관계, 내가 늘 구원자 역할을 하는 관계가 있는지 점검해 보세요.`,
      '',
      `**6-5. 영적 재능의 현실적 발현**`,
      `- ${has(a, 'pyeonin') || has(a, 'hwagae') ? '상담·심리·연구·글쓰기·명상처럼 깊이 들여다보는 일' : '교육·예술·치유·봉사처럼 사람의 마음을 돕는 일'}과 인연이 있습니다. 단, 영성을 특별함이나 우월감이 아니라 **자신을 맑게 하고 세상을 더 깊이 이해하는 힘**으로 쓰는 것이 핵심입니다.`,
    ].join('\n'),
  });

  // ── 7. 결론 ──────────────────────────────────────────
  const action = has(a, 'chilsang')
    ? '오늘, 끊어야 할 관계나 멈춰야 할 자기 비난 한 가지를 종이에 적어보세요.'
    : has(a, 'pyeonin') || has(a, 'hwagae')
      ? '오늘, 조용한 공간에서 지금의 감정을 5문장으로 적어보세요.'
      : a.elements.missing.includes('화')
        ? '오늘, 미뤄둔 현실 문제 하나를 작게라도 처리해 보세요.'
        : '오늘, 30분 걷기나 10분 호흡 명상으로 몸과 마음을 한 번 가라앉혀 보세요.';
  sections.push({
    id: 'conclusion', title: '7. 결론',
    md: [
      `**${name}**의 사주는 감옥이 아닙니다.`,
      '',
      `지금의 ${has(a, 'hwagae') || el === '수' ? '고독과 예민함' : '망설임과 압박'}은 잘못된 것이 아닙니다. 타고난 기질은 현실을 피하기 위한 것이 아니라, 현실을 더 깊이 살아내기 위한 힘입니다. 당신은 운명에 끌려가는 사람이 아니라, **방향을 선택할 수 있는 사람**입니다.`,
      '',
      `**오늘부터 바꿀 한 가지 행동**`,
      `> ${action}`,
      '',
      `_이 풀이는 원국(4기둥)만을 근거로 한 경향 분석입니다. 성별·고민·대운·세운에 따른 구체적 시기나 사건은 단정하지 않았습니다. 더 깊은 상담을 원하시면 위 ‘AI 상담 프롬프트 복사’로 GPT·Claude에 물어보세요._`,
    ].join('\n'),
  });

  return { sections, typeLabel: type.label, stage: stageInfo.current };
}
