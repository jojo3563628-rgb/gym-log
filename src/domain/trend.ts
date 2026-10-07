import type { LocalDate, MassUnit, WorkoutSet } from '../data/types';
import { subMonthsLocal } from './dates';
import { convertMass, round1 } from './units';

export interface TrendPoint {
  date: LocalDate;
  value: number;
}

export interface Trend {
  massMax: TrendPoint[];
  massVolume: TrendPoint[];
  notchMax: TrendPoint[];
  notchVolume: TrendPoint[];
  repsTotal: TrendPoint[];
}

export type TrendRange = '1m' | '3m' | '6m' | 'all';

const RANGE_MONTHS: Record<Exclude<TrendRange, 'all'>, number> = { '1m': 1, '3m': 3, '6m': 6 };

export function rangeStart(today: LocalDate, range: TrendRange): LocalDate | null {
  return range === 'all' ? null : subMonthsLocal(today, RANGE_MONTHS[range]);
}

// kg/lb 換算後合併成同一條線；格數與徒手各自一條，彼此不換算（PES 6.1）
export function buildTrend(sets: WorkoutSet[], displayUnit: MassUnit): Trend {
  const byDate = new Map<LocalDate, WorkoutSet[]>();
  for (const s of sets) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }

  const trend: Trend = { massMax: [], massVolume: [], notchMax: [], notchVolume: [], repsTotal: [] };
  for (const date of [...byDate.keys()].sort()) {
    let massMax = -1;
    let massVol = 0;
    let notchMax = -1;
    let notchVol = 0;
    let reps = 0;
    let hasReps = false;
    for (const s of byDate.get(date)!) {
      if (s.weight === null || s.unit === null) {
        reps += s.reps;
        hasReps = true;
      } else if (s.unit === 'notch') {
        notchMax = Math.max(notchMax, s.weight);
        notchVol += s.weight * s.reps;
      } else {
        const w = convertMass(s.weight, s.unit, displayUnit);
        massMax = Math.max(massMax, w);
        massVol += w * s.reps;
      }
    }
    if (massMax >= 0) {
      trend.massMax.push({ date, value: round1(massMax) });
      trend.massVolume.push({ date, value: round1(massVol) });
    }
    if (notchMax >= 0) {
      trend.notchMax.push({ date, value: round1(notchMax) });
      trend.notchVolume.push({ date, value: round1(notchVol) });
    }
    if (hasReps) trend.repsTotal.push({ date, value: reps });
  }
  return trend;
}
