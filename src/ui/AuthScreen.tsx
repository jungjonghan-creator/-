import { useState } from 'react';
import { useAccount } from '../store/useAccount';

const NATIONS = ['대한민국', '일본', '대만', '중국', '미국', '캐나다', '영국', '프랑스', '독일', '스페인', '이탈리아', '호주', '베트남', '태국', '싱가포르', '필리핀', '인도', '기타'];

export function AuthScreen() {
  const { login, register, busy, error, useLocal, serverReachable } = useAccount();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [p2, setP2] = useState('');
  const [name, setName] = useState(''); const [nat, setNat] = useState('대한민국'); const [pub, setPub] = useState(true);
  const mismatch = tab === 'register' && p2.length > 0 && p !== p2;
  return (
    <div className="max-w-md mx-auto p-4 space-y-4 safe-pad overflow-y-auto h-full" data-testid="auth">
      <div>
        <h1 className="text-3xl font-extrabold">♠ POKER ARENA <span className="text-sky-400">5.0</span></h1>
        <p className="text-xs text-slate-400">WORLD POKER UNIVERSE 2035 · 가상 크레딧 전용 — 실제 돈·결제·환전·베팅 없음</p>
      </div>
      <div className="flex gap-2">
        <button className={`btn flex-1 ${tab === 'login' ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => setTab('login')} data-testid="auth-tab-login">로그인</button>
        <button className={`btn flex-1 ${tab === 'register' ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => setTab('register')} data-testid="auth-tab-register">가입</button>
      </div>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void (tab === 'login' ? login(u.trim(), p) : (!mismatch && register(u.trim(), p, name.trim() || u.trim(), nat, pub))); }}>
        <label className="block text-xs text-slate-300">아이디 (2~20자: 한글·영문·숫자·_)
          <input className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-3 text-base" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" autoCapitalize="none" data-testid="auth-user" />
        </label>
        <label className="block text-xs text-slate-300">비밀번호 (8자 이상)
          <input type="password" className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-3 text-base" value={p} onChange={(e) => setP(e.target.value)} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} data-testid="auth-pass" />
        </label>
        {tab === 'register' && (
          <>
            <label className="block text-xs text-slate-300">비밀번호 확인
              <input type="password" className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-3 text-base" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" data-testid="auth-pass2" />
            </label>
            {mismatch && <div className="text-xs text-rose-300">비밀번호가 일치하지 않습니다</div>}
            <label className="block text-xs text-slate-300">랭킹에 표시할 닉네임
              <input className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-3 text-base" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} data-testid="auth-name" />
            </label>
            <label className="block text-xs text-slate-300">국적 (자기 기재, 검증하지 않음)
              <select className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-3 text-base" value={nat} onChange={(e) => setNat(e.target.value)} data-testid="auth-nat">{NATIONS.map((n) => <option key={n}>{n}</option>)}</select>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" className="mt-1" checked={pub} onChange={(e) => setPub(e.target.checked)} data-testid="auth-public" /> 닉네임·국적·점수를 세계/국내 랭킹에 공개합니다. 해제하면 「비공개 선수」로 표시됩니다. (실명·가족관계는 어디에도 표시되지 않습니다)</label>
          </>
        )}
        {error && <div className="p-2 rounded bg-rose-900/60 text-sm" role="alert" data-testid="auth-error">{error}</div>}
        <button className="btn w-full bg-gradient-to-r from-emerald-700 to-emerald-600" disabled={busy || !u || !p || mismatch} data-testid="auth-submit">{busy ? '처리 중…' : tab === 'login' ? '로그인' : '가입하고 시작'}</button>
      </form>
      <div className="border-t border-slate-700 pt-3 space-y-1">
        <button className="btn w-full bg-slate-800 text-sm" onClick={useLocal} data-testid="auth-local">이 기기에서만 플레이 (로컬 모드)</button>
        <p className="text-[11px] text-slate-500">로컬 모드는 기존 기록을 그대로 쓰며, 다른 기기와 동기화되지 않고 가족·친구 랭킹에 참여하지 않습니다. 나중에 가입하면 이 기기의 플레이 기록(핸드·상대 관찰·전적)을 새 계정으로 복사해 올 수 있습니다 (원본은 보존).</p>
        {!serverReachable && <p className="text-[11px] text-amber-300">서버에 연결되지 않았습니다. 로컬 모드로 시작할 수 있습니다.</p>}
      </div>
    </div>
  );
}
