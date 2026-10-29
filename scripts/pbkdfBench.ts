import { hashPassword, randomB64 } from '../server/crypto';
(async () => { const salt = randomB64(16); const t = Date.now(); for (let i = 0; i < 5; i++) await hashPassword('passw0rd-test', salt); console.log('PBKDF2-SHA256 100k회 평균', (Date.now() - t) / 5, 'ms (Node)'); })();
