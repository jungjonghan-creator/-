import { useEffect, useState } from 'react';
import { useGame } from '../store/useGame';
import { useAccount } from '../store/useAccount';
import { api } from '../net/api';
import { exportBackup, loadKV } from '../persist/db';
import { legacyProfile } from '../analysis/legacy';

export function AccountScreen() {
  const { setScreen, online, attachAccount, archive, tourneys } = useGame();
  const prof = legacyProfile(archive.competitive, tourneys.length);
  const { user, mode, logout, check } = useAccount();
  const [name, setName] = useState(user?.displayName ?? '');
  const [nat, setNat] = useState(user?.nationality ?? '대한민국');
  const [pub, setPub] = useState(true);
  const [msg, setMsg] = useState('');
  const [legacy, setLegacy] = useState<{ found: boolean; copied: Record<string, number>; note: string; legacyWalletBalance?: number } | null>(null);
  const [pw, setPw] = useState('');
  const [backup, setBackup] = useState<{ sha: string; size: number } | null>(null);
  useEffect(() => { void loadKV<typeof legacy>('legacy_import').then((v) => setLegacy(v ?? null)); }, []);
  const download = async () => {
    const b = await exportBackup();
    const url = URL.createObjectURL(new Blob([b.text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `poker-arena-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
    setBackup({ sha: b.sha256, size: b.text.length });
  };
  return (
    <div className="max-w-xl mx-auto p-3 space-y-4 overflow-y-auto h-full safe-pad" data-testid="account">
      <div className="flex items-center gap-2"><button className="btn !min-h-[36px] bg-slate-700" onClick={() => setScreen('menu')} data-testid="account-back">← 뒤로</button><h1 className="text-xl font-bold">계정 · 저장 상태</h1></div>
      <section className="rounded-xl bg-slate-900 p-3 space-y-1 text-sm" data-testid="account-status">
        <div>모드: <b>{mode === 'online' ? `온라인 계정 (${user?.username})` : '로컬 모드 (이 기기만)'}</b></div>
        <div className="text-xs text-slate-400">{online ? '지갑·정산·랭킹 점수는 서버가 확정합니다. 진행 중인 경기는 클라우드에 자동 저장되어 다른 기기에서 이어할 수 있습니다.' : '서버에 연결하지 않은 상태입니다. 랭킹은 이 기기의 기록과 공식 AI 스냅샷으로만 계산되고 친구·가족과 공유되지 않습니다.'}</div>
        {mode !== 'online' && <button className="btn !min-h-[38px] bg-sky-700 text-sm mt-2" onClick={() => { try { localStorage.removeItem('pa_mode'); } catch { /* 무시 */ } useAccount.setState({ mode: 'needLogin' }); }} data-testid="account-login">로그인 / 가입하기</button>}
      </section>
      {online && (
        <section className="rounded-xl bg-slate-900 p-3 space-y-2" data-testid="profile-form">
          <h2 className="font-bold text-sm">프로필 (랭킹 표시)</h2>
          <input className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} data-testid="profile-name" aria-label="닉네임" />
          <input className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm" value={nat} maxLength={20} onChange={(e) => setNat(e.target.value)} aria-label="국적" />
          <label className="flex gap-2 text-xs text-slate-300"><input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} /> 랭킹에 공개</label>
          <button className="btn !min-h-[38px] bg-emerald-700 text-sm" onClick={async () => { const r = await api('POST', '/api/profile', { displayName: name, nationality: nat, publicProfile: pub }); setMsg(r.ok ? '저장했습니다 (닉네임을 바꿔도 랭킹·기록은 고정 계정 ID로 유지됩니다)' : (r.data as { error: string }).error); await check(); }} data-testid="profile-save">저장</button>
        </section>
      )}
      <section className="rounded-xl bg-slate-900 p-3 space-y-1" data-testid="profile-evidence">
        <h2 className="font-bold text-sm">내 플레이 성향 — 저장된 기록 기준</h2>
        <div className="text-xs text-slate-400">핸드 {prof.hands.toLocaleString()}개 · 대회 전적 {prof.tourneyRecords}개 · 일시 {prof.dateRange}</div>
        {prof.hands > 0 && <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-xs">{prof.metrics.slice(0, 6).map((m) => <div key={m.key} className="bg-slate-800 rounded p-1.5"><div className="text-slate-400">{m.label}</div><div className="font-bold">{m.pct === null ? '–' : `${m.pct.toFixed(0)}%`} <span className="font-normal text-[10px] text-slate-500">n={m.den} · {m.confidence}</span></div></div>)}</div>}
        <div className="text-[11px] text-slate-500" data-testid="profile-note">{prof.note}</div>
      </section>
      <section className="rounded-xl bg-slate-900 p-3 space-y-2">
        <h2 className="font-bold text-sm">기존 기록 이관 / 백업</h2>
        {legacy ? <div className="text-xs space-y-1" data-testid="legacy-report"><div>{legacy.note}</div>{legacy.found && <div className="text-slate-300">복사된 항목: {Object.entries(legacy.copied).map(([k, v]) => `${k} ${v}`).join(' · ')}</div>}{legacy.legacyWalletBalance !== undefined && <div className="text-amber-200">옛 통장 잔액({legacy.legacyWalletBalance.toLocaleString()})은 검증되지 않은 값(legacy/unverified)이라 가져오지 않았습니다. 새 지갑은 서버 원장에서 시작합니다.</div>}</div> : <div className="text-xs text-slate-400">이관 기록이 없습니다.</div>}
        <button className="btn !min-h-[38px] bg-slate-700 text-sm" onClick={download} data-testid="btn-backup">이 기기 전체 백업 내려받기 (JSON + SHA-256)</button>
        {backup && <div className="text-[11px] text-slate-400 break-all" data-testid="backup-sha">크기 {backup.size.toLocaleString()}자 · SHA-256 {backup.sha}</div>}
      </section>
      {online && (
        <section className="rounded-xl bg-slate-900 p-3 space-y-2">
          <button className="btn !min-h-[38px] bg-slate-700 text-sm" onClick={async () => { await logout(); await attachAccount(null); }} data-testid="btn-logout">로그아웃</button>
          <div className="border-t border-slate-700 pt-2 space-y-1"><div className="text-xs text-rose-300">계정 삭제: 지갑·기록·랭킹 등록이 삭제됩니다 (되돌릴 수 없음)</div>
            <div className="flex gap-2"><input type="password" className="flex-1 rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" placeholder="비밀번호 확인" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="delete-pw" /><button className="btn !min-h-[38px] bg-rose-800 text-sm" disabled={!pw} onClick={async () => { const r = await api('POST', '/api/account/delete', { password: pw }); if (r.ok) { await logout(); } else setMsg((r.data as { error: string }).error); }} data-testid="btn-delete-account">삭제</button></div></div>
        </section>
      )}
      {msg && <div className="text-xs text-emerald-300" data-testid="account-msg">{msg}</div>}
      <p className="text-[11px] text-slate-500 pb-8">게임의 모든 크레딧은 환전 불가능한 가상 재화입니다. 공식 WSOP/WPT/EPT 등과 무관하며 실제 현금 연동이 없습니다. 2035년 대회·선수는 가상 설정입니다.</p>
    </div>
  );
}
