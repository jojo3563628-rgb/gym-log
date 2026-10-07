import type { ExerciseInput, GroupInput, SetInput, VideoInput } from '../data/types';
import { GROUP_COLORS } from '../data/types';

// PES 欄位規則集中在此，UI 與 repository 共用同一份
export const LIMITS = {
  exerciseName: 40,
  brand: 40,
  instructions: 2000,
  cautions: 1000,
  groupName: 20,
  bodyPartName: 10,
  videoTitle: 60,
  note: 200,
  weightMax: 999.9,
  repsMax: 999,
  restMin: 30,
  restMax: 600,
  stepMax: 100,
} as const;

/** 以字元（code point）計算長度，中文與 emoji 都算 1 個字 */
export function textLength(s: string): number {
  return [...s].length;
}

function hasAtMostOneDecimal(v: number): boolean {
  return Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;
}

export function validateRestSec(v: number | null): string | null {
  if (v === null) return null;
  if (!Number.isInteger(v) || v < LIMITS.restMin || v > LIMITS.restMax) {
    return `休息秒數需為 ${LIMITS.restMin}–${LIMITS.restMax} 的整數`;
  }
  return null;
}

export function validateExerciseInput(e: ExerciseInput): string[] {
  const errors: string[] = [];
  const name = e.name.trim();
  if (!name) errors.push('名稱為必填');
  else if (textLength(name) > LIMITS.exerciseName) errors.push(`名稱最多 ${LIMITS.exerciseName} 字`);
  if (textLength(e.brand) > LIMITS.brand) errors.push(`品牌最多 ${LIMITS.brand} 字`);
  if (e.bodyPartIds.length === 0) errors.push('請至少選 1 個訓練部位');
  if (e.step !== null && !(e.step > 0 && e.step <= LIMITS.stepMax && hasAtMostOneDecimal(e.step))) {
    errors.push(`重量間距需大於 0、最多 ${LIMITS.stepMax}，且最多 1 位小數`);
  }
  const rest = validateRestSec(e.restSec);
  if (rest) errors.push(rest);
  if (textLength(e.instructions) > LIMITS.instructions) errors.push(`使用說明最多 ${LIMITS.instructions} 字`);
  if (textLength(e.cautions) > LIMITS.cautions) errors.push(`注意事項最多 ${LIMITS.cautions} 字`);
  return errors;
}

export function validateVideoInput(v: VideoInput): string[] {
  const errors: string[] = [];
  if (!/^[A-Za-z0-9_-]{11}$/.test(v.youtubeId)) errors.push('無法辨識的 YouTube 影片');
  if (!Number.isInteger(v.startSec) || v.startSec < 0) errors.push('起始時間格式錯誤');
  if (textLength(v.title) > LIMITS.videoTitle) errors.push(`影片標題最多 ${LIMITS.videoTitle} 字`);
  return errors;
}

export function validateSetInput(s: SetInput): string[] {
  const errors: string[] = [];
  if ((s.weight === null) !== (s.unit === null)) errors.push('重量與單位需同時填寫或同時留空');
  if (s.weight !== null) {
    if (!Number.isFinite(s.weight) || s.weight < 0 || s.weight > LIMITS.weightMax) {
      errors.push(`重量需在 0–${LIMITS.weightMax} 之間`);
    } else if (!hasAtMostOneDecimal(s.weight)) {
      errors.push('重量最多 1 位小數');
    }
  }
  if (!Number.isInteger(s.reps) || s.reps < 1 || s.reps > LIMITS.repsMax) {
    errors.push(`次數需為 1–${LIMITS.repsMax} 的整數`);
  }
  if (textLength(s.note) > LIMITS.note) errors.push(`備註最多 ${LIMITS.note} 字`);
  return errors;
}

export function validateGroupInput(g: GroupInput): string[] {
  const errors: string[] = [];
  const name = g.name.trim();
  if (!name) errors.push('群組名稱為必填');
  else if (textLength(name) > LIMITS.groupName) errors.push(`群組名稱最多 ${LIMITS.groupName} 字`);
  if (!(GROUP_COLORS as readonly string[]).includes(g.color)) errors.push('顏色不正確');
  return errors;
}

export function validateBodyPartName(name: string): string | null {
  const n = name.trim();
  if (!n) return '部位名稱為必填';
  if (textLength(n) > LIMITS.bodyPartName) return `部位名稱最多 ${LIMITS.bodyPartName} 字`;
  return null;
}
