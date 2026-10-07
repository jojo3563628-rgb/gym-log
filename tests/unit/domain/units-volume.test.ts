import { clampWeight, convertMass, defaultStep, formatWeight, LB_TO_KG, round1 } from '../../../src/domain/units';
import { setVolume } from '../../../src/domain/volume';

describe('units（PES 6.1）', () => {
  test('1 lb = 0.45359237 kg', () => {
    expect(convertMass(1, 'lb', 'kg')).toBe(LB_TO_KG);
    expect(convertMass(100, 'kg', 'lb')).toBeCloseTo(220.462, 3);
    expect(convertMass(42, 'kg', 'kg')).toBe(42);
  });

  test('kg → lb → kg 來回換算不失真', () => {
    expect(convertMass(convertMass(37.5, 'kg', 'lb'), 'lb', 'kg')).toBeCloseTo(37.5, 10);
  });

  test('預設重量間距：kg 2.5、lb 5、格數 1（PES A7）', () => {
    expect(defaultStep('kg')).toBe(2.5);
    expect(defaultStep('lb')).toBe(5);
    expect(defaultStep('notch')).toBe(1);
  });

  test('round1 修正浮點誤差', () => {
    expect(round1(1.05)).toBe(1.1);
    expect(round1(0.1 + 0.2)).toBe(0.3);
  });

  test('clampWeight 限制 0–999.9 並取 1 位小數', () => {
    expect(clampWeight(-5)).toBe(0);
    expect(clampWeight(1200)).toBe(999.9);
    expect(clampWeight(12.34)).toBe(12.3);
    expect(clampWeight(Number.NaN)).toBe(0);
  });

  test('formatWeight', () => {
    expect(formatWeight(40, 'kg')).toBe('40 kg');
    expect(formatWeight(88.5, 'lb')).toBe('88.5 lb');
    expect(formatWeight(7, 'notch')).toBe('第 7 格');
    expect(formatWeight(null, null)).toBe('徒手');
  });
});

describe('volume（PES 6.2）', () => {
  test('有重量：重量 × 次數，換算成 kg', () => {
    expect(setVolume({ weight: 40, unit: 'kg', reps: 10 })).toEqual({ kind: 'mass', kg: 400 });
    const v = setVolume({ weight: 100, unit: 'lb', reps: 5 });
    expect(v.kind).toBe('mass');
    if (v.kind === 'mass') expect(v.kg).toBeCloseTo(226.796, 3);
  });

  test('格數：格數 × 次數，不換算', () => {
    expect(setVolume({ weight: 7, unit: 'notch', reps: 12 })).toEqual({ kind: 'notch', value: 84 });
  });

  test('徒手：只算次數', () => {
    expect(setVolume({ weight: null, unit: null, reps: 15 })).toEqual({ kind: 'reps', value: 15 });
  });
});
