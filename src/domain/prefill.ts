import type { Exercise, WeightUnit, WorkoutSet } from '../data/types';

export const DEFAULT_REPS = 12;

export interface Prefill {
  weight: number | null;
  unit: WeightUnit | null;
  reps: number;
}

// 讓「和上次一樣」只需按一次「完成這組」（KPI-2）
export function prefill(
  exercise: Pick<Exercise, 'defaultUnit'>,
  currentSessionSets: WorkoutSet[],
  lastSessionSets: WorkoutSet[],
): Prefill {
  const source = currentSessionSets.at(-1) ?? lastSessionSets[0];
  if (source) return { weight: source.weight, unit: source.unit, reps: source.reps };
  return {
    weight: exercise.defaultUnit === null ? null : 0,
    unit: exercise.defaultUnit,
    reps: DEFAULT_REPS,
  };
}
