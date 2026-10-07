import type { WorkoutSet } from '../../../src/data/types';
import { DEFAULT_REPS, prefill } from '../../../src/domain/prefill';
import { buildTrend, rangeStart } from '../../../src/domain/trend';

let seq = 0;
function set(p: Partial<WorkoutSet> & Pick<WorkoutSet, 'date'>): WorkoutSet {
  seq++;
  return {
    id: `s${seq}`,
    sessionId: `sess-${p.date}`,
    exerciseId: 'ex1',
    order: 1,
    weight: 40,
    unit: 'kg',
    reps: 10,
    note: '',
    createdAt: seq,
    ...p,
  };
}

describe('buildTrend（SCR-10、PES 6.1）', () => {
  test('每天取最大重量，訓練量為加總，日期由舊到新', () => {
    const t = buildTrend(
      [
        set({ date: '2026-10-05', weight: 45, reps: 8 }),
        set({ date: '2026-10-01', weight: 40, reps: 10 }),
        set({ date: '2026-10-01', weight: 42.5, reps: 8 }),
      ],
      'kg',
    );
    expect(t.massMax).toEqual([
      { date: '2026-10-01', value: 42.5 },
      { date: '2026-10-05', value: 45 },
    ]);
    expect(t.massVolume).toEqual([
      { date: '2026-10-01', value: 740 },
      { date: '2026-10-05', value: 360 },
    ]);
    expect(t.notchMax).toEqual([]);
    expect(t.repsTotal).toEqual([]);
  });

  test('kg 與 lb 換算後合併成同一條線', () => {
    const t = buildTrend(
      [set({ date: '2026-10-01', weight: 40, unit: 'kg' }), set({ date: '2026-10-01', weight: 100, unit: 'lb' })],
      'kg',
    );
    expect(t.massMax).toEqual([{ date: '2026-10-01', value: 45.4 }]);
  });

  test('顯示單位為 lb 時換算成 lb', () => {
    const t = buildTrend([set({ date: '2026-10-01', weight: 100, unit: 'kg', reps: 1 })], 'lb');
    expect(t.massMax[0]!.value).toBe(220.5);
  });

  test('格數另成一條線，不和 kg 換算', () => {
    const t = buildTrend(
      [
        set({ date: '2026-10-01', weight: 40, unit: 'kg', reps: 10 }),
        set({ date: '2026-10-01', weight: 7, unit: 'notch', reps: 12 }),
      ],
      'kg',
    );
    expect(t.massMax).toEqual([{ date: '2026-10-01', value: 40 }]);
    expect(t.notchMax).toEqual([{ date: '2026-10-01', value: 7 }]);
    expect(t.notchVolume).toEqual([{ date: '2026-10-01', value: 84 }]);
  });

  test('徒手只累計次數', () => {
    const t = buildTrend(
      [
        set({ date: '2026-10-01', weight: null, unit: null, reps: 15 }),
        set({ date: '2026-10-01', weight: null, unit: null, reps: 12 }),
      ],
      'kg',
    );
    expect(t.repsTotal).toEqual([{ date: '2026-10-01', value: 27 }]);
    expect(t.massMax).toEqual([]);
  });

  test('重量為 0 kg 的組仍算一個資料點', () => {
    const t = buildTrend([set({ date: '2026-10-01', weight: 0 })], 'kg');
    expect(t.massMax).toEqual([{ date: '2026-10-01', value: 0 }]);
  });
});

describe('rangeStart', () => {
  test('1/3/6 個月與全部', () => {
    expect(rangeStart('2026-10-07', '1m')).toBe('2026-09-07');
    expect(rangeStart('2026-10-07', '3m')).toBe('2026-07-07');
    expect(rangeStart('2026-10-07', '6m')).toBe('2026-04-07');
    expect(rangeStart('2026-10-07', 'all')).toBeNull();
  });

  test('月底遇到較短月份時取該月最後一天', () => {
    expect(rangeStart('2026-03-31', '1m')).toBe('2026-02-28');
  });
});

describe('prefill（SCR-02、PIS 4.4）', () => {
  const machine = { defaultUnit: 'kg' as const };

  test('優先帶入本次訓練的最後一組', () => {
    const cur = [set({ date: '2026-10-07', weight: 40, reps: 10 }), set({ date: '2026-10-07', weight: 42.5, reps: 8 })];
    const last = [set({ date: '2026-10-03', weight: 35, reps: 12 })];
    expect(prefill(machine, cur, last)).toEqual({ weight: 42.5, unit: 'kg', reps: 8 });
  });

  test('本次還沒記，帶入上次訓練的第 1 組', () => {
    const last = [
      set({ date: '2026-10-03', weight: 35, unit: 'lb', reps: 12 }),
      set({ date: '2026-10-03', weight: 40, reps: 10 }),
    ];
    expect(prefill(machine, [], last)).toEqual({ weight: 35, unit: 'lb', reps: 12 });
  });

  test('都沒有紀錄：重量 0、預設單位、次數 12（PIS C2）', () => {
    expect(DEFAULT_REPS).toBe(12);
    expect(prefill(machine, [], [])).toEqual({ weight: 0, unit: 'kg', reps: 12 });
    expect(prefill({ defaultUnit: 'notch' }, [], [])).toEqual({ weight: 0, unit: 'notch', reps: 12 });
  });

  test('徒手動作第一次：重量與單位為 null', () => {
    expect(prefill({ defaultUnit: null }, [], [])).toEqual({ weight: null, unit: null, reps: 12 });
  });
});
