// ============================================================
//  오행 · server.js — 의존성 0 정적 서버 (Node 코어 http만 사용).
//  실행: node server.js   →   http://localhost:4476/
// ============================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, normalize, extname, resolve, relative, isAbsolute, sep } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4476;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  // 타로 카드 이미지(assets/tarot/*.jpg) — 없으면 octet-stream 으로 나간다
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * 요청 경로를 ROOT 안의 파일로만 해석한다.
 * `..` 탈출, 절대경로로 베이스를 갈아끼우는 경우, `.git` 같은 점(.) 파일은 null.
 * @returns {string | null}
 */
export function resolveStaticPath(root, rawUrl) {
  let urlPath;
  try { urlPath = decodeURIComponent(String(rawUrl ?? '/').split('?')[0]); }
  catch { return null; }
  if (urlPath.includes('\0')) return null;
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const rel = normalize(urlPath).replace(/^[/\\]+/, '');
  if (!rel || rel.split(/[/\\]/).some((seg) => seg.startsWith('.'))) return null;
  const rootResolved = resolve(root);
  const filePath = resolve(rootResolved, rel);
  const relToRoot = relative(rootResolved, filePath);
  if (!relToRoot || relToRoot.startsWith('..') || isAbsolute(relToRoot)) return null;
  if (relToRoot.split(sep).some((seg) => seg.startsWith('.'))) return null;
  return filePath;
}

const server = createServer(async (req, res) => {
  try {
    const filePath = resolveStaticPath(ROOT, req.url || '/');
    if (!filePath) { res.writeHead(403); return res.end('Forbidden'); }
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

const entry = process.argv[1];
const launchedDirectly = !!entry && import.meta.url === pathToFileURL(resolve(entry)).href;
if (launchedDirectly) {
  server.listen(PORT, () => {
    console.log(`\n  오행 사주 분석 → http://localhost:${PORT}/\n`);
  });
}
