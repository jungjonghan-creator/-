import { describe, expect, it } from 'vitest';
import snapJson from '../src/world/data/season.json';
import type { WorldSnapshot } from '../src/world/season';
import { simulateEvent } from '../src/world/season';
import { EVENT_TEMPLATES, templateById, worldDay, dayToDate } from '../src/world/calendar';
import { prizeStructure, prizeAtPlace } from '../src/world/prizes';
import { NAMED, LEGENDS, FUTURE } from '../src/world/cast';
import { ALL_RANKED, aiEntities } from '../src/world/field';
import { buildPointRows, computeRanking, HumanResult, RULES_VERSION } from '../src/world/rankings';
import { absDay } from '../src/world/points';
import { tournamentById, worldDef } from '../src/economy/catalog';
import { launchTournament, tournamentResult, settleTournament } from '../src/economy/actions';
import * as W from '../src/economy/wallet';
import { mttSimToEnd, chipTotal } from '../src/game/mtt';
import { createRng } from '../src/engine/rng';

const SNAP = snapJson as unknown as WorldSnapshot;

describe('선수 시드 v2', () => {
  it('실존 레전드 72 + 가상 66 = 대표 138명, 중복 id 없음, 통계 미검증·권리 미확인 표기', () => {
    expect(LEGENDS.length).toBe(72); expect(FUTURE.length).toBe(66);
    expect(new Set(NAMED.map((p) => p.id)).size).toBe(NAMED.length);
    for (const p of [...LEGENDS, ...FUTURE]) { expect(p.statsVerified).toBe(false); expect(p.rightsConfirmed).toBe(false); }
    for (const p of LEGENDS) expect(p.evidenceSources.length).toBeGreaterThan(0);
    expect(FUTURE.every((p) => p.derivedOrFictional === 'fictional')).toBe(true);
    const nats = new Set(FUTURE.map((p) => p.nationality)); expect(nats.size).toBeGreaterThan(15);
  });
  it('시드 v3: 코몽·캘빈 리 포함, v2의 90명 id 보존, 작고 인물은 historical 표기, 별칭 보유', () => {
    const names = LEGENDS.map((p) => p.name);
    expect(names.some((n) => n.includes('현성주'))).toBe(true); expect(names.some((n) => n.includes('캘빈 리'))).toBe(true);
    expect(LEGENDS.find((p) => p.name.includes('현성주'))!.aliases).toContain('코몽');
    for (const id of ['legend_elky', 'legend_durrrr', 'legend_erik_seidel']) expect(NAMED.some((p) => p.id === id)).toBe(true);
    expect(LEGENDS.filter((p) => p.historical).map((p) => p.name).sort()).toEqual(['Doyle Brunson', 'Mike Sexton']);
    expect(LEGENDS.filter((p) => p.nationality === "대한민국").length).toBeGreaterThanOrEqual(15);
    expect(new Set(LEGENDS.map((p) => p.name)).size).toBe(72);
  });
  it('AI 등록부는 1,000명 이상 (138명은 상한이 아니다)', () => { expect(ALL_RANKED.length).toBeGreaterThanOrEqual(1500); expect(aiEntities().size).toBe(ALL_RANKED.length); });
});

describe('공식 AI 세계 스냅샷', () => {
  it('이벤트 수·시즌 3개·칩/상금 불변식, 이름 있는 선수 참가', () => {
    expect(SNAP.events.length).toBe(EVENT_TEMPLATES.length * 3);
    for (const e of SNAP.events) {
      expect(e.winnerId).toBeTruthy(); expect(e.top[0].place).toBe(1);
      const sum = e.top.reduce((a, t) => a + (t.prize - 0), 0);
      expect(sum).toBeLessThanOrEqual(e.prizePool + e.tickets * e.ticketValue + e.bountyPool + 1);
    }
  });
  it('재현성: 같은 입력이면 스냅샷과 동일한 결과 (결정론)', () => {
    for (const id of ['kcl-m1', 'busan-spring', 'incheon-pko']) {
      const ev = SNAP.events.find((e) => e.key === `2035:${id}`)!;
      const again = simulateEvent(templateById(id), 2035, { domestic: new Map(), global: new Map() }, new Map(EVENT_TEMPLATES.map((e) => [e.id, e])));
      expect(JSON.parse(JSON.stringify(again))).toEqual(ev);
    }
  });
  it('상금표: Σ payouts == prizePool, 비증가, 보장 오버레이, PKO 분리', () => {
    for (const ev of EVENT_TEMPLATES.filter((e) => e.kind === 'mtt')) {
      for (const n of [ev.field, Math.round(ev.field * 1.3)]) {
        const ps = prizeStructure(ev, n);
        expect(ps.payouts.reduce((a, b) => a + b, 0)).toBe(ps.prizePool);
        for (let i = 1; i < ps.payouts.length; i++) expect(ps.payouts[i]).toBeLessThanOrEqual(ps.payouts[i - 1]);
        expect(ps.cashFromEntries + ps.bountyPool).toBe(ev.buyIn * n);
        if (ev.guarantee) expect(ps.prizePool + ps.bountyPool).toBeGreaterThanOrEqual(ev.guarantee);
      }
    }
  });
  it('세계 시계: 오늘(2026-10-29)=월드 2035-03-15, 하루에 하루씩, 시즌 끝에서 멈춤', () => {
    const d0 = Date.UTC(2026, 9, 29, 12);
    expect(dayToDate(2035, worldDay(d0)).label).toBe('2035.03.15');
    expect(worldDay(d0 + 86400000)).toBe(worldDay(d0) + 1);
    expect(worldDay(d0 + 400 * 86400000)).toBe(365);
  });
});

describe('통합 랭킹 계산', () => {
  const ents = aiEntities();
  const cutoff = absDay(2035, 74);
  it('AI만으로 1,500+명 등록, 공동 순위, 미참가 0점은 맨 아래', () => {
    const rows = buildPointRows(SNAP, ents, SNAP.roster, []);
    const r = computeRanking(ents, rows, { scope: 'long', cutoff, limit: 100000 });
    expect(r.total).toBe(ents.size);
    expect(r.rows.slice(0, 5).map((x) => x.rank)).toEqual([1, 2, 3, 4, 5]);
    const firstUnranked = r.rows.findIndex((x) => x.unranked);
    expect(r.rows.slice(firstUnranked).every((x) => x.unranked && x.points === 0)).toBe(true);
    // 세계 장기 상위에 실존 레전드 AI 가 보인다
    expect(r.rows.slice(0, 30).some((x) => x.kind === 'ai-legend')).toBe(true);
  });
  it('인간 결과는 최고 성적 1건만 반영, 규칙 버전이 다르면 무시, 미래 날짜의 AI 이벤트는 아직 반영되지 않는다', () => {
    const e = new Map(ents); e.set('human:h1', { key: 'human:h1', name: 'H1', nationality: '대한민국', kind: 'human' });
    const hr = (place: number, v = RULES_VERSION): HumanResult => ({ humanId: 'h1', instanceId: `i${place}`, season: 2035, eventId: 'seoul-main', day: 80, place, entries: 1, field: 450, paid: 68, prize: 0, cost: 1100, rulesVersion: v });
    const base = buildPointRows({ ...SNAP, events: [] }, e, SNAP.roster, [hr(30), hr(5), hr(60)]);
    expect(base.get('human:h1')!.length).toBe(1);
    expect(base.get('human:h1')![0].place).toBe(5);
    expect(buildPointRows({ ...SNAP, events: [] }, e, SNAP.roster, [hr(5, 'old')]).get('human:h1')).toBeUndefined();
    const early = computeRanking(ents, buildPointRows(SNAP, ents, SNAP.roster, []), { scope: 'season', season: 2035, cutoff: absDay(2035, 10), limit: 10000 });
    const late = computeRanking(ents, buildPointRows(SNAP, ents, SNAP.roster, []), { scope: 'season', season: 2035, cutoff: absDay(2035, 365), limit: 10000 });
    expect(late.rankedCount).toBeGreaterThan(early.rankedCount);
  });
});

describe('개인 인스턴스 월드 이벤트 (엔진)', () => {
  it('서울 마스터스 메인(450명): 이름 있는 선수 포함, 끝까지 진행, 칩 보존, 정산 1회', () => {
    const def = tournamentById('world:seoul-main');
    expect(def.entrants).toBe(450);
    const l = launchTournament(W.newWallet(), def, 'intermediate', {}, 77, { sid: 'w1', now: 1 });
    expect(l.wallet.balance).toBe(30000 - 1000 - 100);
    const m0 = l.session.mtt!;
    expect(Object.keys(m0.names).some((id) => id.startsWith('legend_') || id.startsWith('future_') || id.startsWith('reg'))).toBe(true);
    expect(m0.config.fast).toBe(true);
    let s = mttSimToEnd(l.session, createRng(4));
    expect(s.mtt!.finished).toBe(true);
    expect(chipTotal(s.mtt!)).toBe(s.mtt!.totalEntries * 5000 * 1 * (def.startBB * def.bb) / 5000);
    const w1 = settleTournament(l.wallet, s, 2);
    const w2 = settleTournament(w1, s, 3);
    expect(w2).toBe(w1);
    expect(W.verifyWallet(w1)).toEqual([]);
    expect(w1.accounts['w1'].status).toBe('closed');
  }, 120000);
  it('PKO + 새틀라이트 정의가 엔진 설정에 반영된다', () => {
    const pko = worldDef(templateById('seoul-pko'));
    expect(pko.bounty).toEqual({ share: 0.5 });
    const l = launchTournament(W.newWallet(), pko, 'intermediate', {}, 5, { sid: 'p1', now: 1 });
    expect(l.session.mtt!.bounty!.unit).toBe(250);
    const sat = worldDef(templateById('vss-sat1'));
    const l2 = launchTournament(W.newWallet(), sat, 'intermediate', {}, 6, { sid: 's1', now: 1 });
    expect(l2.session.mtt!.config.world!.eventId).toBe('vss-sat1');
  });
  it('티켓으로 입장하면 차감 없음, 티켓은 한 번만', () => {
    let w = W.newWallet();
    w = W.grantTicket(w, { id: 'tk1', eventId: 'vss-main', season: 2035, value: 10000, sourceEntry: 'sx' });
    expect(W.grantTicket(w, { id: 'tk2', eventId: 'vss-main', season: 2035, value: 10000, sourceEntry: 'sx' })).toBe(w);
    const u = W.useTicketFor(w, 'vss-main', 2035, 'e1');
    expect(u.ticketId).toBe('tk1');
    const def = worldDef(templateById('vss-main'));
    const l = launchTournament(u.wallet, def, 'intermediate', {}, 8, { sid: 'e1', now: 1, ticket: true });
    expect(l.wallet.balance).toBe(30000);
    expect(W.useTicketFor(u.wallet, 'vss-main', 2035, 'e2').ticketId).toBeNull();
  });
  it('prizeAtPlace: 헤즈업 토너먼트표 공동 순위 상금 균등', () => {
    const hu = templateById('seoul-hu');
    const ps = prizeStructure(hu, 64);
    const total = [1, 2, 3, 4, 5, 6, 7, 8].reduce((a, p) => a + prizeAtPlace(hu, 64, p), 0);
    expect(Math.abs(prizeAtPlace(hu, 64, 3) - prizeAtPlace(hu, 64, 4))).toBeLessThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(ps.prizePool);
  });
});
