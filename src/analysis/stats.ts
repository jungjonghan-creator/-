import { positionLabels } from '../ai/observation';
import { emptyStats, Stats, updateModel } from '../ai/opponentModel';
import { replayRecord } from '../engine/replay';
import { HandRecord } from '../engine/types';

export interface Metric { key: string; label: string; num: number; den: number; pct: number | null; def: string }

export function heroStats(records: HandRecord[], heroId = 'hero') {
  const model: Record<string, Stats> = {};
  let net = 0, hands = 0, bbSum = 0;
  let wsd = 0, wsdWin = 0;
  const pos: Record<string, { hands: number; net: number; bbSum: number }> = {};
  for (const r of records) {
    const me = r.startStacks.find((s) => s.id === heroId);
    if (!me || me.stack <= 0) continue;
    updateModel(model, r);
    const n = r.result?.net[me.seat] ?? 0;
    net += n; hands++; bbSum += r.config.bb;
    const label = positionLabels(replayRecord(r, 0))[me.seat] ?? '?';
    const p = (pos[label] ??= { hands: 0, net: 0, bbSum: 0 });
    p.hands++; p.net += n; p.bbSum += r.config.bb;
    if (r.result && !r.result.endedByFold && r.result.shown[me.seat] && r.board.length >= 3) { wsd++; if (n > 0) wsdWin++; }
  }
  const st = model[heroId] ?? emptyStats();
  const m = (key: string, label: string, num: number, den: number, def: string): Metric => ({ key, label, num, den, pct: den ? (100 * num) / den : null, def });
  const metrics: Metric[] = [
    m('vpip', 'VPIP', st.vpip, st.hands, '자발적으로 칩을 넣은 핸드 / 전체 핸드'),
    m('pfr', 'PFR', st.pfr, st.hands, '프리플랍 레이즈 / 전체 핸드'),
    m('3bet', '3-bet', st.tb, st.tbOpp, '3벳 기회(앞에 1레이즈) 중 3벳'),
    m('f3b', 'Fold to 3-bet', st.f3b, st.f3bOpp, '3벳을 맞은 오픈 레이저의 폴드'),
    m('cbet', 'C-bet', st.cb, st.cbOpp, '프리플랍 어그레서가 플랍 첫 행동에서 벳'),
    m('fcb', 'Fold to C-bet', st.fcb, st.fcbOpp, 'C-bet 직면 시 폴드'),
    m('af', 'Aggression (벳·레이즈 비율)', st.aggr, st.aggr + st.passive, '포스트플랍 (벳+레이즈)/(벳+레이즈+콜)'),
    m('wtsd', 'WTSD', st.wtsd, st.sawFlop, '플랍을 본 핸드 중 쇼다운 도달'),
    m('wsd', 'W$SD', wsdWin, wsd, '쇼다운 도달 핸드 중 승리(팟 획득)'),
  ];
  const avgBB = hands ? bbSum / hands : 100;
  const bb100 = hands ? (net / avgBB / hands) * 100 : null;
  const byPos = Object.entries(pos).map(([label, v]) => ({ label, hands: v.hands, net: v.net, bb100: (v.net / (v.bbSum / v.hands) / v.hands) * 100 }));
  return { hands, net, bb100, metrics, byPos };
}
