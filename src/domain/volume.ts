import type { WorkoutSet } from '../data/types';
import { convertMass } from './units';

export type SetVolume =
  | { kind: 'mass'; kg: number } // 重量 × 次數，換算成 kg
  | { kind: 'notch'; value: number } // 格數 × 次數，只能和同一動作比較
  | { kind: 'reps'; value: number }; // 徒手：次數

export function setVolume(s: Pick<WorkoutSet, 'weight' | 'unit' | 'reps'>): SetVolume {
  if (s.weight === null || s.unit === null) return { kind: 'reps', value: s.reps };
  if (s.unit === 'notch') return { kind: 'notch', value: s.weight * s.reps };
  return { kind: 'mass', kg: convertMass(s.weight, s.unit, 'kg') * s.reps };
}
