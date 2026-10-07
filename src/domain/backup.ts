import type {
  BodyPart,
  Exercise,
  Group,
  ScheduleOverride,
  ScheduleRule,
  Session,
  Settings,
  Video,
  WorkoutSet,
} from '../data/types';
import { GROUP_COLORS } from '../data/types';
import { isLocalDate } from './dates';

export const BACKUP_FORMAT = 'gym-log-backup';
export const BACKUP_VERSION = 1;

export interface BackupPhoto {
  id: string;
  width: number;
  height: number;
  mime: string;
  base64: string;
}

export interface BackupV1 {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  data: {
    bodyParts: BodyPart[];
    exercises: Exercise[];
    videos: Video[];
    groups: Group[];
    scheduleRules: ScheduleRule[];
    scheduleOverrides: ScheduleOverride[];
    sessions: Session[];
    sets: WorkoutSet[];
    photos: BackupPhoto[];
    settings: Settings;
  };
}

export type ValidateResult = { ok: true; backup: BackupV1 } | { ok: false; error: string };

// ---- 欄位檢查小工具 ----
type Check = (v: unknown) => boolean;
const str: Check = (v) => typeof v === 'string';
const num: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const int: Check = (v) => Number.isInteger(v);
const bool: Check = (v) => typeof v === 'boolean';
const date: Check = isLocalDate;
const nullable =
  (c: Check): Check =>
  (v) =>
    v === null || c(v);
const oneOf =
  (...vals: readonly unknown[]): Check =>
  (v) =>
    vals.includes(v);
const arrayOf =
  (c: Check): Check =>
  (v) =>
    Array.isArray(v) && v.every(c);

const SPECS: Record<string, Record<string, Check>> = {
  bodyParts: { id: str, name: str, builtin: bool, order: num },
  exercises: {
    id: str,
    name: str,
    type: oneOf('machine', 'free', 'bodyweight'),
    brand: str,
    photoId: nullable(str),
    bodyPartIds: arrayOf(str),
    defaultUnit: nullable(oneOf('kg', 'lb', 'notch')),
    step: nullable(num),
    restSec: nullable(int),
    instructions: str,
    cautions: str,
    archived: oneOf(0, 1),
    lastUsedAt: nullable(num),
    createdAt: num,
    updatedAt: num,
  },
  videos: { id: str, exerciseId: str, youtubeId: str, startSec: int, title: str, order: num },
  groups: {
    id: str,
    name: str,
    color: oneOf(...GROUP_COLORS),
    bodyPartIds: arrayOf(str),
    exerciseIds: arrayOf(str),
    createdAt: num,
  },
  scheduleRules: {
    id: str,
    groupId: str,
    weekdays: arrayOf((v) => int(v) && (v as number) >= 0 && (v as number) <= 6),
    startDate: date,
    endDate: nullable(date),
    createdAt: num,
  },
  scheduleOverrides: { date, groupId: nullable(str) },
  sessions: { id: str, date, groupId: nullable(str), groupName: nullable(str), startedAt: num, endedAt: nullable(num) },
  sets: {
    id: str,
    sessionId: str,
    exerciseId: str,
    date,
    order: int,
    weight: nullable(num),
    unit: nullable(oneOf('kg', 'lb', 'notch')),
    reps: int,
    note: str,
    createdAt: num,
  },
  photos: { id: str, width: num, height: num, mime: str, base64: str },
};

const TABLE_LABEL: Record<string, string> = {
  bodyParts: '訓練部位',
  exercises: '動作',
  videos: '影片',
  groups: '群組',
  scheduleRules: '排程規則',
  scheduleOverrides: '單日排程',
  sessions: '訓練',
  sets: '組',
  photos: '照片',
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkTable(name: string, rows: unknown): string | null {
  const label = TABLE_LABEL[name] ?? name;
  if (!Array.isArray(rows)) return `備份檔缺少「${label}」資料`;
  const spec = SPECS[name]!;
  for (let i = 0; i < rows.length; i++) {
    const row: unknown = rows[i];
    if (!isObject(row)) return `「${label}」第 ${i + 1} 筆格式錯誤`;
    for (const [field, check] of Object.entries(spec)) {
      if (!check(row[field])) return `「${label}」第 ${i + 1} 筆的欄位 ${field} 格式錯誤`;
    }
  }
  return null;
}

function checkSettings(v: unknown): string | null {
  if (
    !isObject(v) ||
    !oneOf('kg', 'lb')(v.defaultUnit) ||
    !oneOf('kg', 'lb')(v.chartUnit) ||
    !int(v.defaultRestSec)
  ) {
    return '備份檔的設定格式錯誤';
  }
  return null;
}

function checkReferences(d: BackupV1['data']): string | null {
  const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id));
  const bodyParts = ids(d.bodyParts);
  const exercises = ids(d.exercises);
  const groups = ids(d.groups);
  const photos = ids(d.photos);
  const sessions = new Map(d.sessions.map((s) => [s.id, s]));

  for (const [name, rows] of Object.entries(d) as [string, unknown][]) {
    if (!Array.isArray(rows) || name === 'scheduleOverrides') continue;
    const seen = new Set<string>();
    for (const r of rows as { id: string }[]) {
      if (seen.has(r.id)) return `「${TABLE_LABEL[name] ?? name}」有重複的 id`;
      seen.add(r.id);
    }
  }
  if (new Set(d.sessions.map((s) => s.date)).size !== d.sessions.length) return '同一天有兩筆訓練紀錄';
  if (new Set(d.groups.map((g) => g.name)).size !== d.groups.length) return '群組名稱重複';
  if (new Set(d.scheduleOverrides.map((o) => o.date)).size !== d.scheduleOverrides.length) {
    return '單日排程有重複的日期';
  }

  for (const e of d.exercises) {
    if (e.photoId !== null && !photos.has(e.photoId)) return `動作「${e.name}」的照片不存在`;
    if (e.bodyPartIds.some((id) => !bodyParts.has(id))) return `動作「${e.name}」參照了不存在的部位`;
  }
  for (const v of d.videos) if (!exercises.has(v.exerciseId)) return '有影片參照了不存在的動作';
  for (const g of d.groups) {
    if (g.exerciseIds.some((id) => !exercises.has(id))) return `群組「${g.name}」參照了不存在的動作`;
    if (g.bodyPartIds.some((id) => !bodyParts.has(id))) return `群組「${g.name}」參照了不存在的部位`;
  }
  for (const r of d.scheduleRules) if (!groups.has(r.groupId)) return '有排程規則參照了不存在的群組';
  for (const o of d.scheduleOverrides) {
    if (o.groupId !== null && !groups.has(o.groupId)) return '有單日排程參照了不存在的群組';
  }
  // session.groupId 可指向已刪除的群組（歷史以 groupName 快照顯示），因此不檢查
  for (const s of d.sets) {
    const session = sessions.get(s.sessionId);
    if (!session) return '有紀錄參照了不存在的訓練';
    if (session.date !== s.date) return '有紀錄的日期與所屬訓練不一致';
    if (!exercises.has(s.exerciseId)) return '有紀錄參照了不存在的動作';
    if ((s.weight === null) !== (s.unit === null)) return '有紀錄的重量與單位不一致';
  }
  return null;
}

/** 日後格式改版時，在這裡把舊版轉成最新版 */
export function migrateBackup(json: Record<string, unknown>): Record<string, unknown> {
  return json;
}

export function validateBackup(json: unknown): ValidateResult {
  if (!isObject(json) || json.format !== BACKUP_FORMAT) {
    return { ok: false, error: '這不是本 App 的備份檔' };
  }
  if (!int(json.version) || (json.version as number) > BACKUP_VERSION) {
    return { ok: false, error: '備份檔版本較新，請先更新 App 再匯入' };
  }
  const migrated = migrateBackup(json);
  const data = migrated.data;
  if (!isObject(data)) return { ok: false, error: '備份檔缺少資料內容' };
  if (!str(migrated.exportedAt)) return { ok: false, error: '備份檔缺少匯出時間' };

  for (const name of Object.keys(SPECS)) {
    const err = checkTable(name, data[name]);
    if (err) return { ok: false, error: err };
  }
  const settingsErr = checkSettings(data.settings);
  if (settingsErr) return { ok: false, error: settingsErr };

  const backup = migrated as unknown as BackupV1;
  const refErr = checkReferences(backup.data);
  if (refErr) return { ok: false, error: refErr };
  return { ok: true, backup };
}

export function summarize(b: BackupV1) {
  return {
    exportedAt: b.exportedAt,
    exercises: b.data.exercises.length,
    sessions: b.data.sessions.length,
    sets: b.data.sets.length,
    photos: b.data.photos.length,
  };
}
