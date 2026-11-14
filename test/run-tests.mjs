/**
 * test/run-tests.mjs
 * ─────────────────────────────────────────────────────────────
 * 소스(src)는 ESM + react-native import 를 쓰기 때문에 node 로 바로 돌릴 수 없습니다.
 * esbuild 로 react-native 를 테스트 스텁(또는 react-native-web)으로 치환해 번들한 뒤 실행합니다.
 *
 *   npm test            … 추출기·딥링크 테스트 + 화면 렌더 스모크 테스트
 *   npm run test:extract  … 추출기 테스트만
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'test', '.tmp');
const only = process.argv[2] || '';

fs.mkdirSync(outDir, { recursive: true });

const STUBS = {
  'expo-status-bar': './test/stubs/expo-status-bar.js',
  'expo-clipboard': './test/stubs/expo-clipboard.js',
  '@react-native-async-storage/async-storage': './test/stubs/async-storage.js',
  '@expo/vector-icons': './test/stubs/vector-icons.js',
};

async function runSuite({ name, entry, out, format, alias }) {
  const outFile = path.join(outDir, out);
  await build({
    absWorkingDir: root,
    entryPoints: [path.join(here, entry)],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format,
    alias,
    loader: { '.js': 'jsx' },
    logLevel: 'silent',
  });
  console.log('\n── ' + name + ' ──');
  const res = spawnSync(process.execPath, [outFile], { cwd: root, stdio: 'inherit' });
  return res.status === null ? 1 : res.status;
}

let failed = 0;

if (!only || only === 'extract') {
  // src/utils/links.js 가 react-native 를 import 하므로 node 용 최소 스텁으로 바꿔 줍니다.
  failed += await runSuite({
    name: '추출기·딥링크 테스트',
    entry: 'extractor-test.mjs',
    out: 'extractor-test.bundle.mjs',
    format: 'esm',
    alias: { 'react-native': './test/stubs/react-native.js' },
  });
}

if (!only || only === 'ssr') {
  failed += await runSuite({
    name: '화면 렌더 스모크 테스트',
    entry: 'ssr-smoke.jsx',
    out: 'ssr-smoke.cjs',
    format: 'cjs',
    alias: { 'react-native': 'react-native-web', ...STUBS },
  });
}

fs.rmSync(outDir, { recursive: true, force: true });
if (failed) {
  console.log('\nTEST_FAILED (exit ' + failed + ')');
  process.exit(1);
}
console.log('\nALL_TESTS_OK');
