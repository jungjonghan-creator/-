/** `npm run share` — 서버를 켜고, 가입 없는 무료 터널(cloudflared quick tunnel)로 가족·친구 폰에서 접속 가능한 주소를 만든다.
 *  cloudflared 가 없으면 같은 Wi-Fi 에서 쓸 수 있는 LAN 주소만 안내한다. 이 PC 가 켜져 있는 동안만 접속된다. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

const PORT = process.env.PORT ?? '8787';
if (!existsSync('dist/index.html')) { console.log('앱을 빌드합니다…'); const b = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' }); if (b.status !== 0) process.exit(1); }
const srv = spawn('npx', ['tsx', 'server/node.ts'], { stdio: 'inherit', env: { ...process.env, PORT, TRUST_PROXY: '1' } });
const lan = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i!.address}:${PORT}`);
console.log(`\n이 PC: http://localhost:${PORT}\n같은 Wi-Fi 의 폰: ${lan.join('  ') || '(LAN 주소 없음)'}`);

const has = spawnSync('cloudflared', ['--version'], { stdio: 'ignore' }).status === 0;
let tunnel: ReturnType<typeof spawn> | null = null;
if (!has) {
  console.log('\n[인터넷 공유] cloudflared 가 없습니다. 설치(무료, 계정 불필요) 후 다시 `npm run share`:\n  Windows: winget install Cloudflare.cloudflared\n  Mac: brew install cloudflared\n  Linux: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
} else {
  tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let shown = false;
  const scan = (d: Buffer) => { const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(d.toString()); if (m && !shown) { shown = true; console.log(`\n✅ 가족·친구에게 이 주소를 보내세요 (이 창을 닫으면 끊깁니다):\n   ${m[0]}\n   초대 링크는 앱의 랭킹 → 친구에서 「초대 링크 보내기」로 만들면 이 주소로 만들어집니다.\n   ※ 터널 주소는 실행할 때마다 바뀝니다. 고정 주소가 필요하면 docs/DEPLOY_FREE.md 의 Cloudflare 배포를 쓰세요.`); } };
  tunnel.stdout?.on('data', scan); tunnel.stderr?.on('data', scan);
}
const stop = () => { tunnel?.kill(); srv.kill(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
