import type { ExerciseInput } from '../../../src/data/types';
import {
  textLength,
  validateExerciseInput,
  validateGroupInput,
  validateSetInput,
  validateVideoInput,
} from '../../../src/domain/validate';

const base: ExerciseInput = {
  name: '坐姿推胸機',
  type: 'machine',
  brand: 'Technogym',
  bodyPartIds: ['bp-chest'],
  defaultUnit: 'kg',
  step: null,
  restSec: null,
  instructions: '',
  cautions: '',
};

describe('validateExerciseInput（SCR-08）', () => {
  test('合法輸入沒有錯誤', () => {
    expect(validateExerciseInput(base)).toEqual([]);
  });

  test('名稱必填、最多 40 字（中文以字計）', () => {
    expect(validateExerciseInput({ ...base, name: '  ' })).toContain('名稱為必填');
    expect(validateExerciseInput({ ...base, name: '胸'.repeat(40) })).toEqual([]);
    expect(validateExerciseInput({ ...base, name: '胸'.repeat(41) })).toContain('名稱最多 40 字');
  });

  test('至少 1 個部位', () => {
    expect(validateExerciseInput({ ...base, bodyPartIds: [] })).toContain('請至少選 1 個訓練部位');
  });

  test('休息秒數 30–600', () => {
    expect(validateExerciseInput({ ...base, restSec: 29 })).toHaveLength(1);
    expect(validateExerciseInput({ ...base, restSec: 600 })).toEqual([]);
    expect(validateExerciseInput({ ...base, restSec: 601 })).toHaveLength(1);
  });

  test('重量間距', () => {
    expect(validateExerciseInput({ ...base, step: 1.25 })).toHaveLength(1);
    expect(validateExerciseInput({ ...base, step: 0 })).toHaveLength(1);
    expect(validateExerciseInput({ ...base, step: 2.5 })).toEqual([]);
  });

  test('textLength 以字元計算', () => {
    expect(textLength('胸肌💪')).toBe(3);
  });
});

describe('validateSetInput（SCR-02）', () => {
  const ok = { weight: 40, unit: 'kg' as const, reps: 10, note: '' };

  test('合法輸入', () => {
    expect(validateSetInput(ok)).toEqual([]);
    expect(validateSetInput({ ...ok, weight: null, unit: null })).toEqual([]);
    expect(validateSetInput({ ...ok, weight: 0 })).toEqual([]);
    expect(validateSetInput({ ...ok, weight: 999.9 })).toEqual([]);
  });

  test('重量範圍與小數位數', () => {
    expect(validateSetInput({ ...ok, weight: 1000 })).toHaveLength(1);
    expect(validateSetInput({ ...ok, weight: -1 })).toHaveLength(1);
    expect(validateSetInput({ ...ok, weight: 40.25 })).toContain('重量最多 1 位小數');
  });

  test('重量與單位需一致', () => {
    expect(validateSetInput({ ...ok, unit: null })).toContain('重量與單位需同時填寫或同時留空');
  });

  test('次數 1–999 整數', () => {
    expect(validateSetInput({ ...ok, reps: 0 })).toHaveLength(1);
    expect(validateSetInput({ ...ok, reps: 1.5 })).toHaveLength(1);
    expect(validateSetInput({ ...ok, reps: 999 })).toEqual([]);
  });

  test('備註最多 200 字', () => {
    expect(validateSetInput({ ...ok, note: 'a'.repeat(201) })).toHaveLength(1);
  });
});

describe('其他驗證', () => {
  test('影片', () => {
    expect(validateVideoInput({ youtubeId: 'dQw4w9WgXcQ', startSec: 0, title: '' })).toEqual([]);
    expect(validateVideoInput({ youtubeId: 'bad', startSec: -1, title: '' })).toHaveLength(2);
  });

  test('群組', () => {
    expect(validateGroupInput({ name: '推日', color: 'red', bodyPartIds: [], exerciseIds: [] })).toEqual([]);
    expect(validateGroupInput({ name: '', color: 'red', bodyPartIds: [], exerciseIds: [] })).toHaveLength(1);
  });
});
