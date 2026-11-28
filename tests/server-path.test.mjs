// 로컬 정적 서버의 경로 해석 — 디렉터리 탈출과 점(.) 파일 노출을 막는지.
// 실행: node tests/server-path.test.mjs
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveStaticPath } from '../server.js';

const root = mkdtempSync(join(tmpdir(), 'saju-static-'));
mkdirSync(join(root, 'styles'));
mkdirSync(join(root, '.git'));
writeFileSync(join(root, 'index.html'), 'ok');
writeFileSync(join(root, 'styles', 'app.css'), 'css');
writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');

let pass = 0, fail = 0;
const fails = [];
function check(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; fails.push(`✗ ${name}\n    기대: ${want}\n    실제: ${got}`); }
}

check('인덱스', resolveStaticPath(root, '/'), join(root, 'index.html'));
check('쿼리 무시', resolveStaticPath(root, '/index.html?y=1'), join(root, 'index.html'));
check('하위 파일', resolveStaticPath(root, '/styles/app.css'), join(root, 'styles', 'app.css'));
check('점 파일', resolveStaticPath(root, '/.git/HEAD'), null);
check('인코딩된 점 파일', resolveStaticPath(root, '/%2egit/HEAD'), null);
check('상위 탈출', resolveStaticPath(root, '/../../../etc/passwd') === '/etc/passwd' ? '/etc/passwd' : null, null);
check('인코딩된 상위 탈출', resolveStaticPath(root, '/%2e%2e/%2e%2e/etc/passwd') === '/etc/passwd' ? '/etc/passwd' : null, null);
check('깨진 퍼센트', resolveStaticPath(root, '/%'), null);
check('널 바이트', resolveStaticPath(root, '/%00index.html'), null);

const sibling = resolveStaticPath('/tmp/saju-root', '/tmp/saju-root-secret/x');
const escapedSibling = sibling && (sibling === '/tmp/saju-root-secret/x' || sibling.startsWith('/tmp/saju-root-secret/'));
check('접두사로 옆 디렉터리 읽기', escapedSibling ? 'escaped' : 'contained', 'contained');
check('상대 해석은 루트 안', sibling && sibling.startsWith(resolve('/tmp/saju-root') + '/') ? 'inside' : 'outside', 'inside');

console.log(`\n${'═'.repeat(50)}`);
console.log(`  통과 ${pass} / 실패 ${fail}`);
console.log(`${'═'.repeat(50)}`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
else console.log('  ✓ 정적 경로 검증 통과');
