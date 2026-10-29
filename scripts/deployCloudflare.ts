/** `npm run deploy:cf` — Cloudflare 무료 플랜에 배포(고정 주소). 사전 1회: `npx wrangler login` (본인 계정 로그인은 대신할 수 없다).
 *  하는 일: 로그인 확인 → D1 생성(이미 있으면 재사용) → wrangler.toml 의 database_id 기입 → 빌드 → 배포 → 가입/로그인 CPU 점검 안내 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const WIN = process.platform === 'win32'; // Windows 에서는 npx/npm 이 .cmd 라서 shell 이 필요하다
const run = (args: string[], inherit = false) => spawnSync('npx', ['--yes', 'wrangler@4', ...args], { encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe', shell: WIN });
const who = run(['whoami']);
if (who.status !== 0 || /not authenticated|You are not/i.test(who.stdout + who.stderr)) {
  console.error('Cloudflare 로그인이 필요합니다.\n  1) https://dash.cloudflare.com/sign-up 에서 무료 계정을 만든 뒤\n  2) 터미널에서 `npx wrangler login` 실행(브라우저가 열립니다) → 허용\n  3) 다시 `npm run deploy:cf`');
  process.exit(2);
}
let toml = readFileSync('wrangler.toml', 'utf8');
if (toml.includes('REPLACE_WITH_D1_ID_AFTER_CREATE')) {
  let id: string | null = null;
  const created = run(['d1', 'create', 'poker-arena']);
  const m = /database_id\s*=\s*"([0-9a-f-]{36})"/i.exec(created.stdout + created.stderr);
  if (m) id = m[1];
  else {
    const list = run(['d1', 'list', '--json']);
    try { id = (JSON.parse(list.stdout) as { name: string; uuid: string }[]).find((d) => d.name === 'poker-arena')?.uuid ?? null; } catch { /* 아래에서 처리 */ }
  }
  if (!id) { console.error('D1 데이터베이스 생성/조회에 실패했습니다:\n' + created.stdout + created.stderr); process.exit(3); }
  toml = toml.replace('REPLACE_WITH_D1_ID_AFTER_CREATE', id);
  writeFileSync('wrangler.toml', toml);
  console.log(`D1 준비 완료 (id ${id}) → wrangler.toml 에 기록했습니다.`);
}
const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: WIN });
if (build.status !== 0) process.exit(4);
const dep = spawnSync('npx', ['--yes', 'wrangler@4', 'deploy'], { encoding: 'utf8', shell: WIN });
process.stdout.write(dep.stdout ?? ''); process.stderr.write(dep.stderr ?? '');
if (dep.status !== 0) {
  if (/workers\.dev subdomain/i.test((dep.stdout ?? '') + (dep.stderr ?? ''))) console.error('\n[안내] 처음 한 번만 workers.dev 주소 이름을 정해야 합니다. 위 dash.cloudflare.com/.../workers/onboarding 링크를 브라우저로 열어 이름(영문 소문자·숫자·-)을 정하고 저장한 뒤, 이 배포를 다시 실행하세요.');
  process.exit(5);
}
const url = /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i.exec((dep.stdout ?? '') + (dep.stderr ?? ''))?.[0];
if (url) {
  // 스모크 테스트(계정을 만들지 않는다): 서버와 D1 연결 확인
  try {
    const h = await fetch(`${url}/api/health`); const j = await h.json().catch(() => ({}));
    console.log(`\n[스모크] ${url}/api/health → HTTP ${h.status} ${JSON.stringify(j)}`);
    const r = await fetch(`${url}/api/ranking?scope=season&limit=3`); console.log(`[스모크] 랭킹 API → HTTP ${r.status}`);
  } catch (e) { console.log('[스모크] 접속 확인 실패(배포 직후 몇 초 걸릴 수 있음):', (e as Error).message); }
  console.log(`\n✅ 고정 주소: ${url}`);
}
console.log('\n배포가 끝났습니다. 위에 나온 https://poker-arena.<계정>.workers.dev 주소를 가족에게 공유하세요.\n가입/로그인이 "오류"로 실패하면 무료 CPU(10ms) 한도 때문일 수 있습니다 → docs/DEPLOY_FREE.md 「알려진 위험」 참고(자가 호스팅 `npm run share` 로 즉시 대체 가능).');
