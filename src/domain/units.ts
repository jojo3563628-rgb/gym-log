import type { MassUnit, WeightUnit } from '../data/types';

export const LB_TO_KG = 0.45359237; // 國際磅定義值

export const UNIT_LABEL: Record<WeightUnit, string> = { kg: 'kg', lb: 'lb', notch: '格' };

export function convertMass(value: number, from: MassUnit, to: MassUnit): number {
  if (from === to) return value;
  return from === 'lb' ? value * LB_TO_KG : value / LB_TO_KG;
}

export function defaultStep(unit: WeightUnit): number {
  switch (unit) {
    case 'kg':
      return 2.5;
    case 'lb':
      return 5;
    case 'notch':
      return 1;
  }
}

export function round1(v: number): number {
  // 加 EPSILON 修正 1.05 這類浮點數被捨去的問題
  return Math.round((v + Math.sign(v) * Number.EPSILON) * 10) / 10;
}

export function clampWeight(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return round1(Math.min(999.9, Math.max(0, v)));
}

export function formatNumber(v: number): string {
  const r = round1(v);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function formatWeight(weight: number | null, unit: WeightUnit | null): string {
  if (weight === null || unit === null) return '徒手';
  if (unit === 'notch') return `第 ${formatNumber(weight)} 格`;
  return `${formatNumber(weight)} ${unit}`;
}
