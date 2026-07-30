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
