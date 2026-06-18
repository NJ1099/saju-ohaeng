// ============================================================
//  오행 · share.js — 결과를 공유용 이미지(사주 카드)로 그린다.
//  외부 의존성 없이 Canvas 2D로 직접 렌더 → 디자인 완전 제어, PNG 다운로드 + Web Share.
// ============================================================
import { STEMS, BRANCHES, STEM_ELEMENT, BRANCH_ELEMENT, ELEMENTS } from './engine/constants.js';

// 오행 색 (배경 soft / 글자 dark) — UI와 일관
const EL = {
  목: ['#DEF7EC', '#057a4a', '#0AC17B'],
  화: ['#FFE9EC', '#cf2a3a', '#F04452'],
  토: ['#F8EFE0', '#8a5e16', '#C7903F'],
  금: ['#EEF1F4', '#515c6b', '#8B97A6'],
  수: ['#E8F3FF', '#1f63c4', '#3182F6'],
};
const FONT = '"Pretendard Variable", Pretendard, sans-serif';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 결과 → 공유 카드 canvas(1080×1350). 반드시 폰트 로드 후 호출. */
export async function drawShareCard(saju, a) {
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch { /* noop */ } }
  const W = 1080, H = 1350, P = 84;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // 배경 — 부드러운 그라데이션
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#F2F4F6');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // 브랜드
  ctx.textBaseline = 'alphabetic';
  rr(ctx, P, 76, 56, 56, 16); ctx.fillStyle = '#191F28'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `800 30px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText('五', P + 28, 116);
  ctx.textAlign = 'left'; ctx.fillStyle = '#191F28'; ctx.font = `800 32px ${FONT}`;
  ctx.fillText('오행', P + 72, 116);
  ctx.fillStyle = '#8B95A1'; ctx.font = `600 22px ${FONT}`;
  ctx.fillText('사주 오행 분석', P + 138, 116);

  // 이름·생년
  const i = saju.input, sol = saju.solar;
  const cal = i.calendar === 'lunar' ? `음력 ${i.year}.${i.month}.${i.day}${i.isLeapMonth ? '윤' : ''} · ` : '';
  const time = sol.hour === null ? '시간미상' : `${String(sol.hour).padStart(2, '0')}:${String(sol.minute).padStart(2, '0')}`;
  ctx.fillStyle = '#6B7480'; ctx.font = `600 26px ${FONT}`;
  ctx.fillText(`${i.name ? i.name + ' · ' : ''}${cal}양력 ${sol.year}.${String(sol.month).padStart(2, '0')}.${String(sol.day).padStart(2, '0')} · ${time} · ${i.gender}`, P, 192);

  // 유형 (줄바꿈)
  ctx.fillStyle = '#191F28'; ctx.font = `800 46px ${FONT}`;
  wrap(ctx, label2(saju, a), P, 256, W - P * 2, 58);

  // 만세력 4기둥
  const py = 400, cw = (W - P * 2 - 24) / 4, gap = 8;
  const order = [['년', saju.pillars.year], ['월', saju.pillars.month], ['일', saju.pillars.day], ['시', saju.pillars.hour]];
  order.forEach(([lab, pil], idx) => {
    const x = P + idx * (cw + 8);
    ctx.fillStyle = idx === 2 ? '#3182F6' : '#8B95A1'; ctx.font = `700 24px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(lab + '주', x + cw / 2, py - 14);
    if (!pil) { drawBox(ctx, x, py, cw, 130, '#EEF1F4', '?', '미상', '#8B97A6'); drawBox(ctx, x, py + 142, cw, 130, '#EEF1F4', '?', '', '#8B97A6'); return; }
    const se = STEM_ELEMENT[pil.stemIdx], be = BRANCH_ELEMENT[pil.branchIdx];
    drawBox(ctx, x, py, cw, 130, EL[se][0], pil.hanja[0], pil.kor[0] + '·' + se, EL[se][1], idx === 2);
    drawBox(ctx, x, py + 142, cw, 130, EL[be][0], pil.hanja[1], pil.kor[1] + '·' + be, EL[be][1]);
  });

  // 오행 분포 바
  let by = py + 360;
  ctx.textAlign = 'left'; ctx.fillStyle = '#8B95A1'; ctx.font = `800 22px ${FONT}`;
  ctx.fillText('오행 분포', P, by); by += 34;
  const max = Math.max(...Object.values(a.elements.count), 1);
  ELEMENTS.forEach((e) => {
    ctx.fillStyle = EL[e][1]; ctx.font = `800 26px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(e, P, by + 24);
    rr(ctx, P + 50, by + 6, W - P * 2 - 180, 22, 11); ctx.fillStyle = '#EAEDF0'; ctx.fill();
    const bw = (a.elements.count[e] / max) * (W - P * 2 - 180);
    if (bw > 0) { rr(ctx, P + 50, by + 6, Math.max(bw, 22), 22, 11); ctx.fillStyle = EL[e][2]; ctx.fill(); }
    ctx.fillStyle = '#6B7480'; ctx.font = `700 22px ${FONT}`; ctx.textAlign = 'right';
    ctx.fillText(`${a.elements.count[e]}자 · ${a.elements.weightedPct[e]}%`, W - P, by + 24);
    by += 44;
  });

  // 영성 점수
  by += 18;
  ctx.textAlign = 'left'; ctx.fillStyle = '#6B7480'; ctx.font = `600 24px ${FONT}`;
  ctx.fillText(`영성 잠재력 ${a.spiritScore}점 · 7대 지표 중 ${a.presentCount}개 발현`, P, by + 10);

  // 푸터
  ctx.fillStyle = '#B0B8C1'; ctx.font = `600 22px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText('오행 · 사주는 정답이 아니라 방향을 보는 지도입니다', W / 2, H - 64);

  return cv;
}

function drawBox(ctx, x, y, w, h, bg, han, sub, color, me = false) {
  rr(ctx, x, y, w, h, 18); ctx.fillStyle = bg; ctx.fill();
  if (me) { ctx.lineWidth = 3; ctx.strokeStyle = '#3182F6'; rr(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 17); ctx.stroke(); }
  ctx.fillStyle = color; ctx.textAlign = 'center';
  ctx.font = `800 60px ${FONT}`; ctx.fillText(han, x + w / 2, y + 78);
  if (sub) { ctx.font = `600 22px ${FONT}`; ctx.fillText(sub, x + w / 2, y + 110); }
}

function label2(saju, a) {
  return saju.input.name ? `${saju.input.name} 님 — ${a.spiritScore >= 60 ? '영성이 깊은' : ''} ${typeShort(saju)}`.trim() : typeShort(saju);
}
function typeShort(saju) { return saju._typeLabel || `${saju.ilgan} 일간 사주`; }

function wrap(ctx, text, x, y, maxW, lh) {
  const words = text.split(' '); let line = ''; let yy = y;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; }
    else line = t;
  }
  if (line) ctx.fillText(line, x, yy);
}

/** canvas → PNG Blob */
export function canvasToBlob(cv) {
  return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
}
