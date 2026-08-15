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

/**
 * 텍스트 줄바꿈 렌더. 마지막 줄의 y를 돌려준다(이어서 그릴 때 쓴다).
 * @param {number} [maxLines] 넘치면 마지막 줄 끝을 …로 자른다. 생략하면 제한 없음.
 */
function wrap(ctx, text, x, y, maxW, lh, maxLines = Infinity) {
  const words = String(text).split(' ');
  let line = ''; let yy = y; let n = 1;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) {
      if (n >= maxLines) { ctx.fillText(line.replace(/.$/, '…'), x, yy); return yy; }
      ctx.fillText(line, x, yy); line = w; yy += lh; n++;
    } else line = t;
  }
  if (line) ctx.fillText(line, x, yy);
  return yy;
}

/** canvas → PNG Blob. toBlob 이 없거나 null 을 주는 환경(구형 iOS)은 dataURL 로 우회한다. */
export function canvasToBlob(cv) {
  return new Promise((res, rej) => {
    const viaDataUrl = () => {
      try { res(dataUrlToBlob(cv.toDataURL('image/png'))); }
      catch (e) { rej(e); }
    };
    if (!cv.toBlob) { viaDataUrl(); return; }
    cv.toBlob((b) => { if (b) res(b); else viaDataUrl(); }, 'image/png');
  });
}

function dataUrlToBlob(url) {
  const [head, b64] = url.split(',');
  const mime = (/:(.*?);/.exec(head) || [])[1] || 'image/png';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ============================================================
//  이미지 전달 (라운드 8)
//
//  "이미지 저장을 눌러도 모바일에서 아무 일이 없다"는 신고를 받고 경로를 다시 짰다.
//  원인은 둘이었다.
//   1) iOS Safari 의 share() 는 **사용자 제스처 직후**여야 한다. 캔버스를 그리고
//      폰트·카드 이미지를 기다린 뒤에 부르면 활성화가 만료돼 NotAllowedError 로 죽는다.
//      → 호출부가 결과 화면에서 blob 을 미리 만들어 두고(프리워밍), 클릭 시엔 바로 넘긴다.
//   2) iOS 는 a[download] 를 자주 무시한다. 그래서 마지막 폴백으로 이미지를 띄우고
//      길게 눌러 저장하도록 안내한다(이 경로는 아이폰에서 항상 통한다).
// ============================================================

/** iOS(아이패드OS 13+ 포함) 판별 — download 속성이 잘 듣지 않아 폴백 경로가 다르다. */
export function isIOS() {
  const ua = navigator.userAgent || '';
  if (/iP(hone|od|ad)/.test(ua)) return true;
  // 아이패드OS 13+ 는 데스크톱 사파리로 위장한다.
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
}

/**
 * 만들어 둔 PNG Blob 을 기기에 맞는 방법으로 사용자에게 넘긴다.
 * @returns {Promise<'shared'|'downloaded'|'longpress'|'canceled'>}
 */
export async function deliverImage(blob, { fileName = 'image.png', title = '', text = '' } = {}) {
  let file = null;
  try { file = new File([blob], fileName, { type: 'image/png' }); } catch { /* File 미지원 */ }

  // ① 공유 시트 — 아이폰·갤럭시 모두 여기서 '이미지 저장'을 고를 수 있다.
  if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'canceled';
      // NotAllowedError(제스처 만료)·DataError 등은 아래 폴백으로 내려간다.
    }
  }

  const url = URL.createObjectURL(blob);

  // ② a[download] — 데스크톱과 대부분의 안드로이드 브라우저의 표준 경로.
  if (!isIOS()) {
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.rel = 'noopener';
    document.body.appendChild(a);   // 파이어폭스·일부 안드로이드는 DOM 에 붙어 있어야 클릭이 먹는다
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'downloaded';
  }

  // ③ iOS 최후 폴백 — 길게 눌러 사진에 추가.
  showLongPressSheet(url);
  return 'longpress';
}

/** 아이폰에서 이미지를 길게 눌러 저장하도록 띄우는 시트. */
function showLongPressSheet(url) {
  document.getElementById('img-sheet')?.remove();

  const wrap = document.createElement('div');
  wrap.id = 'img-sheet';
  wrap.className = 'img-sheet';
  wrap.innerHTML = `
    <div class="img-sheet-panel" role="dialog" aria-modal="true" aria-label="이미지 저장">
      <p class="img-sheet-tip">이미지를 <b>길게 눌러</b> ‘사진에 추가’를 선택하면 저장돼요.</p>
      <img class="img-sheet-img" alt="저장할 결과 이미지" />
      <button type="button" class="img-sheet-close">닫기</button>
    </div>`;
  wrap.querySelector('.img-sheet-img').src = url;
  document.body.appendChild(wrap);

  const close = () => { wrap.remove(); URL.revokeObjectURL(url); };
  wrap.querySelector('.img-sheet-close').addEventListener('click', close);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
}

// ============================================================
//  타로 스프레드 카드뉴스 (라운드 7)
//  사주 카드와 같은 1080×1350 규격. 다크 테마 + 골드 액센트.
// ============================================================

const T = {
  bg: '#0B0B10', bg2: '#14131C', line: '#2A2836',
  ink: '#F4F1E8', ink2: '#C7C1B4', ink3: '#9A9486',
  gold: '#E8B84B', gold2: '#C79A33', rev: '#C77DFF',
};

/** 카드 앞면 이미지를 로드한다. 실패해도 전체 렌더는 계속되도록 null 을 돌려준다. */
function loadImage(src) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

/**
 * 타로 리딩 → 공유 카드 canvas(1080×1350).
 * @param {object} reading engine/tarot.js readSpread() 결과
 */
export async function drawTarotCard(reading) {
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch { /* noop */ } }
  const W = 1080, H = 1350, P = 76;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // 배경
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W * 0.9);
  glow.addColorStop(0, 'rgba(232,184,75,.10)');
  glow.addColorStop(1, 'rgba(232,184,75,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H * 0.6);

  // 브랜드
  ctx.textBaseline = 'alphabetic';
  rr(ctx, P, 70, 54, 54, 15); ctx.fillStyle = T.gold; ctx.fill();
  ctx.fillStyle = T.bg2; ctx.font = `800 28px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText('☾', P + 27, 108);
  ctx.textAlign = 'left'; ctx.fillStyle = T.ink; ctx.font = `800 31px ${FONT}`;
  ctx.fillText('오행', P + 70, 108);
  ctx.fillStyle = T.ink3; ctx.font = `600 21px ${FONT}`;
  ctx.fillText('타로 3장 리딩', P + 134, 108);

  // 주제
  const { topic, cards, summary } = reading;
  ctx.fillStyle = T.gold; ctx.font = `700 24px ${FONT}`;
  ctx.fillText(topic.label, P, 186);
  ctx.fillStyle = T.ink; ctx.font = `800 40px ${FONT}`;
  wrap(ctx, topic.question, P, 236, W - P * 2, 52);

  // 카드 3장 — 원본 비율 100:168 유지
  const gap = 28;
  const cw = (W - P * 2 - gap * 2) / 3;
  const ch = Math.round(cw * 1.68);
  const cy = 300;

  const imgs = await Promise.all(cards.map((c) => loadImage(`./${c.card.img}`)));

  cards.forEach((c, i) => {
    const x = P + i * (cw + gap);

    // 카드 액자
    ctx.save();
    rr(ctx, x, cy, cw, ch, 12);
    ctx.fillStyle = T.bg2; ctx.fill();
    ctx.clip();
    const img = imgs[i];
    if (img) {
      if (c.reversed) {
        // 역방향은 실제로 180° 돌려 그린다
        ctx.translate(x + cw / 2, cy + ch / 2);
        ctx.rotate(Math.PI);
        ctx.drawImage(img, -cw / 2, -ch / 2, cw, ch);
      } else {
        ctx.drawImage(img, x, cy, cw, ch);
      }
    } else {
      // 이미지를 못 받았을 때의 대체 — 카드명만이라도 보이게 한다
      ctx.fillStyle = T.ink3; ctx.font = `700 20px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(c.card.name, x + cw / 2, cy + ch / 2);
    }
    ctx.restore();
    ctx.lineWidth = 1.5; ctx.strokeStyle = T.line;
    rr(ctx, x, cy, cw, ch, 12); ctx.stroke();

    // 자리 이름 · 카드명 · 방향
    let ty = cy + ch + 38;
    ctx.textAlign = 'center';
    ctx.fillStyle = T.gold; ctx.font = `700 20px ${FONT}`;
    ctx.fillText(c.position.label, x + cw / 2, ty);
    ty += 32;
    ctx.fillStyle = T.ink; ctx.font = `800 24px ${FONT}`;
    ty = wrap(ctx, c.card.name, x + cw / 2, ty, cw, 30);
    ty += 28;
    ctx.fillStyle = c.reversed ? T.rev : T.ink3; ctx.font = `700 18px ${FONT}`;
    ctx.fillText(c.reversed ? '역방향' : '정방향', x + cw / 2, ty);
  });

  // 스프레드 관찰 한 줄
  ctx.textAlign = 'left';
  const noteY = H - 210;
  ctx.fillStyle = T.ink3; ctx.font = `600 22px ${FONT}`;
  const metaLine = [
    `메이저 ${summary.majorCount}장`,
    `역방향 ${summary.reversedCount}장`,
    summary.dominantSuit ? `${cards.find((c) => c.card.suit === summary.dominantSuit).card.suitLabel} 쏠림` : null,
  ].filter(Boolean).join('  ·  ');
  ctx.fillText(metaLine, P, noteY);

  ctx.fillStyle = T.ink2; ctx.font = `600 24px ${FONT}`;
  const firstNote = summary.notes[0];
  if (firstNote) {
    wrap(ctx, firstNote.text.replace(/\*\*/g, ''), P, noteY + 44, W - P * 2, 34, 2);
  }

  // 푸터
  ctx.fillStyle = '#6E6A61'; ctx.font = `600 21px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText('타로는 미래를 정해 주지 않습니다 · 지금을 비추는 거울입니다', W / 2, H - 58);

  return cv;
}
