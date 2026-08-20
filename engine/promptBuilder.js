// ============================================================
//  saju · engine/promptBuilder.js
//  계산된 원국을 사주풀이 프롬프트(템플릿)에 채워 LLM 입력 문자열 생성.
//  브런치 글의 워크플로 그대로 — GPT/Claude에 붙여넣으면 상담 결과 생성.
// ============================================================

import { pillarsText } from './saju.js';

/**
 * @param {object} saju computeSaju 결과
 * @param {string} templateText data/prompt-template.txt 내용
 * @param {object} [luck] {daewoon, sewoon} — 있으면 대운·세운 참고정보 추가
 * @returns {string} 전체 프롬프트 (템플릿 + 원국 입력)
 */
export function buildPrompt(saju, templateText, luck = null) {
  const t = pillarsText(saju, true); // 한자 포함
  const gender = saju.input.gender || '미입력';
  const name = saju.input.name ? `\n(참고: 상담자 이름 ${saju.input.name})` : '';

  let luckBlock = [];
  if (luck && luck.daewoon) {
    const dw = luck.daewoon.list.map((x) => `${x.age}세 ${x.kor}(${x.hanja})`).join(', ');
    luckBlock = [
      '',
      `(참고: 대운 ${luck.daewoon.direction}, ${luck.daewoon.startAge}세 시작 — ${dw})`,
    ];
    if (luck.sewoon && luck.sewoon.length) {
      const cur = luck.sewoon.find((s) => s.isCurrent) || luck.sewoon[0];
      luckBlock.push(`(참고: 올해 세운 ${cur.year}년 ${cur.kor})`);
    }
    luckBlock.push('대운·세운은 참고용이며, 요청하지 않는 한 특정 시기를 단정하지 마세요.');
  }

  const input = [
    '',
    '---',
    '',
    '# 입력 (앱이 만세력으로 자동 산출한 사주 원국)',
    '',
    `성별: ${gender}`,
    `년주: ${t.year}`,
    `월주: ${t.month}`,
    `일주: ${t.day}`,
    `시주: ${t.hour}`,
    name,
    ...luckBlock,
    '',
    '위 4기둥(원국)을 기준으로, 위 출력 형식(1~7)에 따라 상담 결과를 작성해 주세요.',
  ].filter((x) => x !== null).join('\n');

  return `${templateText.trim()}\n${input}\n`;
}

/**
 * 궁합 프롬프트 — 두 사람의 원국 + 앱이 계산한 관계 판정을 함께 넘긴다.
 * @param {object} sajuA 첫 번째 사람 computeSaju 결과
 * @param {object} sajuB 두 번째 사람 computeSaju 결과
 * @param {string} templateText data/compat-prompt-template.txt 내용
 * @param {object} compat analyzeCompatibility 결과
 */
export function buildCompatPrompt(sajuA, sajuB, templateText, compat) {
  const person = (saju, label) => {
    const t = pillarsText(saju, true);
    return [
      `## ${label}`,
      `이름: ${saju.input.name || '(미입력)'}`,
      `성별: ${saju.input.gender || '미입력'}`,
      `년주: ${t.year}`,
      `월주: ${t.month}`,
      `일주: ${t.day}`,
      `시주: ${t.hour}`,
    ].join('\n');
  };

  const rel = [];
  if (compat) {
    rel.push('## 앱이 계산한 관계 판정 (참고 — 재계산 금지)');
    for (const ax of compat.axes) rel.push(`- ${ax.title}: ${ax.headline} (${ax.score}/${ax.weight})`);
    rel.push(`- 종합: ${compat.score}점 · ${compat.grade.label}`);
    const m = compat.matrix.filter((x) => !x.unknown && x.rels.length);
    if (m.length) rel.push(`- 기둥 대조: ${m.map((x) => `${x.pos}주 ${x.rels.map((r) => r.label).join('/')}`).join(', ')}`);
    rel.push(`- 십성 관계: ${compat.names.a}→${compat.names.b} ${compat.lens.aSees.sipseong} / ${compat.names.b}→${compat.names.a} ${compat.lens.bSees.sipseong}`);
  }

  const input = [
    '',
    '---',
    '',
    '# 입력 (앱이 만세력으로 자동 산출한 두 사람의 사주 원국)',
    '',
    person(sajuA, `첫 번째 사람${sajuA.input.name ? ` — ${sajuA.input.name}` : ''}`),
    '',
    person(sajuB, `두 번째 사람${sajuB.input.name ? ` — ${sajuB.input.name}` : ''}`),
    ...(rel.length ? ['', ...rel] : []),
    '',
    '위 두 원국을 기준으로, 위 출력 형식(1~6)에 따라 궁합 상담 결과를 작성해 주세요.',
  ].join('\n');

  return `${templateText.trim()}\n${input}\n`;
}

/** 원국만 간단히 (성별/년/월/일/시) — 짧은 복사용 */
export function buildPillarsOnly(saju) {
  const t = pillarsText(saju, true);
  return [
    `성별: ${saju.input.gender || '미입력'}`,
    `년주: ${t.year}`,
    `월주: ${t.month}`,
    `일주: ${t.day}`,
    `시주: ${t.hour}`,
  ].join('\n');
}

// ============================================================
//  타로 (라운드 7)
// ============================================================

/**
 * 뽑은 3장 + 주제를 타로 프롬프트 템플릿에 채운다.
 * @param {string} templateText data/tarot-prompt-template.txt 내용
 * @param {object} reading engine/tarot.js readSpread() 결과
 * @returns {string} 전체 프롬프트 (템플릿 + 뽑힌 카드 입력)
 */
export function buildTarotPrompt(templateText, reading) {
  const { topic, cards, summary } = reading;

  const lines = cards.map((c, i) => {
    const ori = c.reversed ? '역방향' : '정방향';
    const suit = c.card.suit === 'major' ? '메이저 아르카나' : c.card.suitLabel;
    return [
      `${i + 1}. [${c.position.label}] ${c.card.name} (${c.card.en}) — ${ori}`,
      `   · 자리의 뜻: ${c.position.hint}`,
      `   · 계열: ${suit}${c.card.element ? ` · 원소 ${c.card.element}` : ''}`,
      `   · 키워드: ${c.keywords.join(', ')}`,
    ].join('\n');
  });

  const meta = [
    `· 메이저 아르카나 ${summary.majorCount}장 / 역방향 ${summary.reversedCount}장`,
    summary.dominantSuit ? `· 수트 쏠림: ${cards.find((c) => c.card.suit === summary.dominantSuit).card.suitLabel}` : null,
  ].filter(Boolean);

  const input = [
    '',
    '# 입력 (앱이 라이더-웨이트 78장에서 무작위로 뽑은 결과)',
    '',
    `상담 주제: ${topic.label} — "${topic.question}"`,
    `보는 렌즈: ${topic.lens}`,
    '',
    '뽑힌 카드 3장:',
    ...lines,
    '',
    '스프레드 전체 관찰:',
    ...meta,
    '',
    '위 세 장을 기준으로, 위 출력 형식(1~5)에 따라 타로 리딩 결과를 작성해 주세요.',
    '카드를 바꾸거나 새로 뽑지 말고 위에 주어진 3장만 사용하세요.',
  ].join('\n');

  return `${templateText.trim()}\n${input}\n`;
}

/**
 * 명리 정통 관법 비교 프롬프트 (라운드 10).
 * 앱이 이미 산출한 원국·이론 판정을 **계산 결과로 넘겨** LLM 이 만세력을 다시 뽑다가
 * 틀리는 것을 원천 차단한다. LLM 은 해석에만 집중하면 된다.
 * @param {object} saju computeSaju 결과
 * @param {string} templateText data/theory-prompt-template.txt 내용
 * @param {object} a analyze 결과 (theory · strength 포함)
 * @param {object} [luck] {daewoon, sewoon}
 */
export function buildTheoryPrompt(saju, templateText, a, luck = null) {
  const t = pillarsText(saju, true);
  const th = a.theory;
  const y = th.yongsin;
  const el = (list) => (list && list.length ? list.join('·') : '없음');

  const lines = [
    '',
    '---',
    '',
    '# 입력 — 앱이 천문 계산으로 산출한 값 (다시 계산하지 마십시오)',
    '',
    '## 1. 원국',
    `성별: ${saju.input.gender || '미입력'}`,
    saju.input.name ? `이름: ${saju.input.name}` : null,
    `년주: ${t.year}`,
    `월주: ${t.month}`,
    `일주: ${t.day}`,
    `시주: ${t.hour}`,
    `일간: ${saju.ilgan}(${saju.ilganHanja})`,
    saju.currentTerm ? `출생 절기: ${saju.currentTerm.name || saju.currentTerm}` : null,
    saju.input.hour === '' || saju.input.hour === null
      ? '⚠️ 출생 시간 미상 — 시주는 참고로만 쓰고, 시주에 기대는 판단은 피하십시오.' : null,
    '',
    '## 2. 앱이 판정한 이론 계층 (통설 기준)',
    `신강·신약: ${a.strength.label} (일간 세력 ${a.strength.supportRatio}%, 뿌리 ${a.strength.rootCount}곳 — 글자 수가 아니라 통근 기준)`,
    `격국: ${th.gyeokguk.name} — ${th.gyeokguk.basis}`,
    `조후: ${th.johu.tempLabel} · ${th.johu.humidLabel}`,
    '',
    '### 용신 — 세 관법을 각각 산출한 값',
    `· 억부용신: ${el(y.eokbu)}`,
    `· 조후용신: ${el(y.johuNeed)}`,
    y.gyeokguk ? `· 격국용신(상신): ${el(y.gyeokguk.need)} — 상신 십성 ${el(y.gyeokguk.sipseong)}, ${y.gyeokguk.kind === '길' ? '살려 쓰는 격' : '눌러 쓰는 격'}` : null,
    `· 세 관법의 공통분모: ${el(y.common)}`,
    '이 셋이 갈리면 갈린 채로 다루십시오. 하나로 합치지 마십시오.',
    '',
    `십이운성: ${th.stages.map((s) => `${s.pos}지 ${s.branch}=${s.unseong}`).join(', ')}`,
    `신살(보조자료): ${el(th.sinsal.filter((s) => s.present).map((s) => s.name))}`,
    `원국 내 형충회합: ${th.relations.length ? th.relations.map((r) => `${r.label}(${r.from}·${r.to})`).join(', ') : '두드러진 것 없음'}`,
  ];

  if (luck && luck.daewoon) {
    const dw = luck.daewoon.list.map((x) => `${x.age}세 ${x.kor}(${x.hanja})`).join(', ');
    lines.push('', '## 3. 대운 · 세운',
      `대운 방향: ${luck.daewoon.direction} / 시작 나이: ${luck.daewoon.startAge}세`,
      `대운: ${dw}`);
    if (luck.sewoon && luck.sewoon.length) {
      const cur = luck.sewoon.find((s) => s.isCurrent) || luck.sewoon[0];
      lines.push(`올해 세운: ${cur.year}년 ${cur.kor}`);
      lines.push(`세운 목록: ${luck.sewoon.map((s) => `${s.year} ${s.kor}`).join(', ')}`);
    }
  }

  lines.push('', '---', '',
    '위 값을 전제로, 앞의 분석 순서(①~⑮)에 따라 관법을 섞지 말고 각각 분석한 뒤 마지막에 비교해 주세요.',
    '각 항목은 쉬운 말 요약으로 시작하고, 전문 용어는 처음 쓸 때 괄호로 풀어 주세요.');

  return `${templateText.trim()}\n${lines.filter((x) => x !== null).join('\n')}\n`;
}
