// ============================================================
//  타로 카드 이미지 1회 수집 스크립트 (라운드 7)
//
//  출처: 위키미디어 커먼즈 — Rider–Waite–Smith 타로 덱 (1909, Pamela Colman Smith 그림).
//        원판은 미국·영국 모두에서 퍼블릭 도메인.
//  실행: node scripts/fetch-tarot-images.mjs        (이미 받은 파일은 건너뜀)
//        node scripts/fetch-tarot-images.mjs --force (전부 다시 받음)
//
//  결과물은 저장소에 커밋되므로 평소에는 실행할 일이 없다.
//  카드가 깨졌거나 해상도를 바꿀 때만 다시 돌린다.
// ============================================================
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, 'assets', 'tarot');

// 카드 표시 폭이 최대 ~190px 이므로 2배 남짓이면 레티나까지 충분하다.
// ⚠️ upload.wikimedia.org 는 **미리 만들어 둔 버킷 크기**만 내려준다.
//    330·250 은 200, 300·320·400 은 400(Bad Request) 이다. 임의의 폭을 쓰면 안 된다.
const WIDTH = 330;
const FALLBACK_WIDTH = 250;
/** 이보다 작으면 받다 만 파일로 본다. */
const MIN_BYTES = 10 * 1024;

// ── 위키미디어 파일명 ─────────────────────────────────────
// 메이저 22장은 RWS_Tarot_NN_이름.jpg, 마이너 56장은 수트+두자리.jpg 규칙.
const MAJOR_FILES = [
  'RWS_Tarot_00_Fool.jpg',
  'RWS_Tarot_01_Magician.jpg',
  'RWS_Tarot_02_High_Priestess.jpg',
  'RWS_Tarot_03_Empress.jpg',
  'RWS_Tarot_04_Emperor.jpg',
  'RWS_Tarot_05_Hierophant.jpg',
  'RWS_Tarot_06_Lovers.jpg',
  'RWS_Tarot_07_Chariot.jpg',
  'RWS_Tarot_08_Strength.jpg',
  'RWS_Tarot_09_Hermit.jpg',
  'RWS_Tarot_10_Wheel_of_Fortune.jpg',
  'RWS_Tarot_11_Justice.jpg',
  'RWS_Tarot_12_Hanged_Man.jpg',
  'RWS_Tarot_13_Death.jpg',
  'RWS_Tarot_14_Temperance.jpg',
  'RWS_Tarot_15_Devil.jpg',
  'RWS_Tarot_16_Tower.jpg',
  'RWS_Tarot_17_Star.jpg',
  'RWS_Tarot_18_Moon.jpg',
  'RWS_Tarot_19_Sun.jpg',
  'RWS_Tarot_20_Judgement.jpg',
  'RWS_Tarot_21_World.jpg',
];

const SUIT_PREFIX = { wands: 'Wands', cups: 'Cups', swords: 'Swords', pents: 'Pents' };

/** [로컬 파일명, 위키미디어 파일명] 쌍 78개. */
function buildList() {
  const list = MAJOR_FILES.map((f, i) => [`major-${String(i).padStart(2, '0')}.jpg`, f]);
  for (const [suit, prefix] of Object.entries(SUIT_PREFIX)) {
    for (let n = 1; n <= 14; n++) {
      const nn = String(n).padStart(2, '0');
      list.push([`${suit}-${nn}.jpg`, `${prefix}${nn}.jpg`]);
    }
  }
  return list;
}

// 커먼즈 정식 경로(Special:FilePath)는 앱 서버를 거치므로 연속 요청 시 429 로 막힌다.
// 이미지 CDN 을 직접 친다 — 썸네일 경로는 파일명 MD5 로 결정된다:
//   thumb/<md5[0]>/<md5[0..1]>/<파일명>/<폭>px-<파일명>
const cdnUrl = (wikiName, width) => {
  const name = wikiName.replace(/ /g, '_');
  const md5 = createHash('md5').update(name, 'utf8').digest('hex');
  const enc = encodeURIComponent(name);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${md5[0]}/${md5.slice(0, 2)}/${enc}/${width}px-${enc}`;
};

/** 시도 순서: CDN 330 → CDN 250 → 커먼즈 정식 경로(느리지만 어떤 폭이든 만들어 준다). */
const urlCandidates = (wikiName) => [
  cdnUrl(wikiName, WIDTH),
  cdnUrl(wikiName, FALLBACK_WIDTH),
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(wikiName)}?width=${WIDTH}`,
];

async function exists(path) {
  try { return (await stat(path)).size >= MIN_BYTES; } catch { return false; }
}

async function fetchOne(wikiName) {
  let lastErr = 'no attempt';
  for (const url of urlCandidates(wikiName)) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'saju-ohaeng-tarot/1.0 (one-off asset fetch)' },
      });
      if (res.status === 429) {
        // 서버가 알려 준 대기 시간을 지킨다. 없으면 5초.
        const wait = Number(res.headers.get('retry-after')) || 5;
        await new Promise((r) => setTimeout(r, wait * 1000));
        lastErr = 'HTTP 429 (레이트 리밋)';
        continue;
      }
      if (!res.ok) { lastErr = `HTTP ${res.status}`; continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < MIN_BYTES) { lastErr = `너무 작음 (${buf.length}B)`; continue; }
      // JPEG 매직 넘버 확인 — 에러 페이지가 HTML 로 오면 여기서 걸린다.
      if (buf[0] !== 0xff || buf[1] !== 0xd8) { lastErr = 'JPEG 가 아님'; continue; }
      return buf;
    } catch (err) { lastErr = err.message; }
  }
  throw new Error(lastErr);
}

async function main() {
  const force = process.argv.includes('--force');
  await mkdir(OUT_DIR, { recursive: true });

  const list = buildList();
  console.log(`타로 카드 ${list.length}장 수집 시작 (width=${WIDTH})\n`);

  let done = 0, skipped = 0;
  const failed = [];

  for (const [localName, wikiName] of list) {
    const out = join(OUT_DIR, localName);
    if (!force && await exists(out)) { skipped++; continue; }

    let ok = false;
    for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
      try {
        const buf = await fetchOne(wikiName);
        await writeFile(out, buf);
        done++; ok = true;
        process.stdout.write(`  ✓ ${localName}  ←  ${wikiName}  (${Math.round(buf.length / 1024)}KB)\n`);
      } catch (err) {
        if (attempt === 4) failed.push([localName, wikiName, err.message]);
        else await new Promise((r) => setTimeout(r, 1000 * attempt)); // 1s → 2s → 3s
      }
    }
    // 커먼즈에 부담을 주지 않도록 약간 쉰다.
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`\n받음 ${done} · 건너뜀 ${skipped} · 실패 ${failed.length}`);
  if (failed.length) {
    console.error('\n실패 목록:');
    for (const [l, w, m] of failed) console.error(`  ✗ ${l}  ←  ${w}  — ${m}`);
    process.exit(1);
  }
  console.log(`\n저장 위치: ${OUT_DIR}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
