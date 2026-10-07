import type { ExerciseType, LocalDate, WeightUnit } from '../data/types';
import { formatNumber, UNIT_LABEL } from './units';

export interface CsvRow {
  date: LocalDate;
  groupName: string | null;
  exerciseName: string;
  type: ExerciseType;
  order: number;
  weight: number | null;
  unit: WeightUnit | null;
  reps: number;
  note: string;
}

export const TYPE_LABEL: Record<ExerciseType, string> = { machine: '機台', free: '自由重量', bodyweight: '徒手' };

const HEADER = ['日期', '群組', '動作名稱', '類型', '組序', '重量', '單位', '次數', '備註'];

function cell(value: string): string {
  let s = value;
  // 防 CSV 公式注入：Excel 會把這些字元開頭的內容當公式執行
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: CsvRow[]): string {
  const lines = [HEADER.join(',')];
  for (const r of rows) {
    const cells = [
      r.date,
      r.groupName ?? '',
      r.exerciseName,
      TYPE_LABEL[r.type],
      String(r.order),
      r.weight === null ? '' : formatNumber(r.weight),
      r.unit === null ? '' : UNIT_LABEL[r.unit],
      String(r.reps),
      r.note,
    ];
    lines.push(cells.map(cell).join(','));
  }
  // BOM 讓 Excel 以 UTF-8 開啟，中文不會亂碼
  return '﻿' + lines.join('\r\n') + '\r\n';
}
