/**
 * test/live-e2e.mjs
 * ─────────────────────────────────────────────────────────────
 * 라이브 E2E: 실제 유튜브 URL → youtube.com/oembed(무인증) → 한국어 키워드 정제
 *            → .env 의 카카오 로컬 + 네이버 API HUB 실검색까지 그대로 호출합니다.
 *
 *   npm run test:live
 *
 * · 네트워크와 실제 키가 필요합니다. (`npm test` 는 네트워크를 타지 않습니다)
 * · 키 값은 화면에 찍지 않습니다. (앞 4자리 + 길이만 마스킹해 표시)
 * · 실패해도 키를 파일로 남기지 않습니다.
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'test', '.tmp');
fs.mkdirSync(outDir, { recursive: true });

// ── .env 로드 (없으면 환경변수만 사용)
function loadDotEnv() {
  const file = path.join(root, '.env');
  const vars = {};
  if (!fs.existsSync(file)) return vars;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    vars[m[1]] = v;
  }
  return vars;
}

const env = { ...process.env, ...loadDotEnv() };
const mask = (v) => (v ? String(v).slice(0, 4) + '…(' + String(v).length + '자)' : '(없음)');
console.log('── 키 확인 (값은 마스킹) ──');
['EXPO_PUBLIC_KAKAO_REST_API_KEY', 'EXPO_PUBLIC_NAVER_HUB_CLIENT_ID', 'EXPO_PUBLIC_NAVER_HUB_CLIENT_SECRET'].forEach(
  (k) => console.log('  ' + k + ' = ' + mask(env[k]))
);

const outFile = path.join(outDir, 'live-e2e.case.mjs');
await build({
  absWorkingDir: root,
  entryPoints: [path.join(here, 'live-e2e-case.mjs')],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  alias: { 'react-native': './test/stubs/react-native.js' },
  loader: { '.js': 'jsx' },
  logLevel: 'silent',
});

const res = spawnSync(process.execPath, [outFile], { cwd: root, stdio: 'inherit', env });
fs.rmSync(outDir, { recursive: true, force: true });
process.exit(res.status === null ? 1 : res.status);
