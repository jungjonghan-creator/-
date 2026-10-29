/** 기존 저장 기록(핸드 아카이브·대회 전적·상대 관찰)에서 "실제로 저장된 증거"만으로 플레이 프로필을 만든다. 기본 설정이나 예시 문장은 쓰지 않는다. */
import { heroStats, Metric } from './stats';
import type { HandRecord } from '../engine/types';

export interface LegacyProfile {
  source: string;
  hands: number;
  tourneyRecords: number;
  metrics: { key: string; label: string; num: number; den: number; pct: number | null; confidence: '표본 부족' | '낮음' | '보통' | '높음' }[];
  bb100: number | null;
  /** 핸드 기록에는 타임스탬프가 없다 → 일시는 미확인 */
  dateRange: '미확인';
  note: string;
}
const confidence = (den: number): LegacyProfile['metrics'][number]['confidence'] => (den < 30 ? '표본 부족' : den < 100 ? '낮음' : den < 1000 ? '보통' : '높음');

export function legacyProfile(records: HandRecord[], tourneyCount: number, source = '이 기기 저장소'): LegacyProfile {
  const hs = heroStats(records);
  const metrics = hs.metrics.map((m: Metric) => ({ key: m.key, label: m.label, num: m.num, den: m.den, pct: m.pct, confidence: confidence(m.den) }));
  return {
    source, hands: hs.hands, tourneyRecords: tourneyCount, metrics, bb100: hs.bb100, dateRange: '미확인',
    note: hs.hands === 0 ? '저장된 핸드가 없어 성향을 평가할 수 없습니다 (미확인 · 표본 부족). 임의의 실력 수치를 부여하지 않습니다.' : '저장된 핸드 기록에서 계산한 값입니다. 표본이 작은 지표는 신뢰하지 마세요. 핸드 기록에는 날짜가 저장되어 있지 않아 일시는 미확인입니다.',
  };
}
