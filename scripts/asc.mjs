/**
 * scripts/asc.mjs — App Store Connect API 헬퍼 (빌드 20 TestFlight 연결용)
 *
 *   node scripts/asc.mjs builds                 … 최근 빌드와 processingState
 *   node scripts/asc.mjs groups                 … TestFlight 그룹 목록
 *   node scripts/asc.mjs version                … 앱스토어 버전(2.40.0) 상태·연결된 빌드
 *   node scripts/asc.mjs attach <buildId> <groupId>  … 빌드를 TestFlight 그룹에 연결
 *
 * 자격 증명은 eas.json 의 submit.production.ios (ascApiKeyPath·ascApiKeyId·ascApiKeyIssuerId)를 씁니다.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
const cfg = eas.submit.production.ios;
const KEY_PATH = path.join(root, cfg.ascApiKeyPath);
const KEY_ID = cfg.ascApiKeyId;
const ISSUER = cfg.ascApiKeyIssuerId;
const APP_ID = cfg.ascAppId;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function token() {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }));
  const data = header + '.' + payload;
  const key = fs.readFileSync(KEY_PATH, 'utf8');
  const der = crypto.sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });
  return data + '.' + b64url(der);
}

async function api(pathname, options = {}) {
  const res = await fetch('https://api.appstoreconnect.apple.com' + pathname, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token(),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (e) {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

const cmd = process.argv[2] || 'builds';

if (cmd === 'builds') {
  const r = await api(
    '/v1/builds?filter[app]=' + APP_ID + '&sort=-uploadedDate&limit=5&fields[builds]=version,processingState,uploadedDate,expired'
  );
  if (!r.ok) {
    console.log('FAIL', r.status, JSON.stringify(r.body).slice(0, 600));
    process.exit(1);
  }
  for (const b of r.body.data || []) {
    console.log(
      'build', b.attributes.version,
      '| processingState:', b.attributes.processingState,
      '| uploaded:', b.attributes.uploadedDate,
      '| id:', b.id
    );
  }
} else if (cmd === 'groups') {
  const r = await api('/v1/betaGroups?filter[app]=' + APP_ID + '&limit=50&fields[betaGroups]=name,isInternalGroup,publicLinkEnabled,createdDate');
  if (!r.ok) {
    console.log('FAIL', r.status, JSON.stringify(r.body).slice(0, 600));
    process.exit(1);
  }
  for (const g of r.body.data || []) {
    console.log('group', JSON.stringify(g.attributes.name), '| internal:', g.attributes.isInternalGroup, '| id:', g.id);
  }
} else if (cmd === 'version') {
  const r = await api(
    '/v1/apps/' + APP_ID + '/appStoreVersions?limit=5&fields[appStoreVersions]=versionString,appStoreState,platform,createdDate'
  );
  if (!r.ok) {
    console.log('FAIL', r.status, JSON.stringify(r.body).slice(0, 600));
    process.exit(1);
  }
  for (const v of r.body.data || []) {
    let build = '';
    const rel = await api('/v1/appStoreVersions/' + v.id + '/build?fields[builds]=version,processingState');
    if (rel.ok && rel.body && rel.body.data) {
      build = ' | build ' + rel.body.data.attributes.version + ' (' + rel.body.data.attributes.processingState + ')';
    }
    console.log('version', v.attributes.versionString, '|', v.attributes.platform, '| state:', v.attributes.appStoreState, build, '| id:', v.id);
  }
} else if (cmd === 'attach') {
  const buildId = process.argv[3];
  const groupId = process.argv[4];
  if (!buildId || !groupId) {
    console.log('usage: node scripts/asc.mjs attach <buildId> <groupId>');
    process.exit(1);
  }
  const r = await api('/v1/betaGroups/' + groupId + '/relationships/builds', {
    method: 'POST',
    body: JSON.stringify({ data: [{ type: 'builds', id: buildId }] }),
  });
  console.log(r.status, JSON.stringify(r.body).slice(0, 400));
  process.exit(r.ok ? 0 : 1);
} else {
  console.log('unknown command: ' + cmd);
  process.exit(1);
}
