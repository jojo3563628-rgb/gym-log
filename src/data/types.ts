export type Id = string; // crypto.randomUUID()
export type LocalDate = string; // 'YYYY-MM-DD'，手機本地日期
export type EpochMs = number;

export type ExerciseType = 'machine' | 'free' | 'bodyweight';
export type WeightUnit = 'kg' | 'lb' | 'notch'; // notch = 格數
export type MassUnit = 'kg' | 'lb';

export interface BodyPart {
  id: Id;
  name: string;
  builtin: boolean;
  order: number;
}

export interface Exercise {
  id: Id;
  name: string;
  type: ExerciseType;
  brand: string;
  photoId: Id | null;
  bodyPartIds: Id[];
  defaultUnit: WeightUnit | null; // null = 徒手不填重量
  step: number | null; // null = 用單位預設間距
  restSec: number | null; // null = 用全域預設
  instructions: string;
  cautions: string;
  archived: 0 | 1; // IndexedDB 無法對 boolean 建索引
  lastUsedAt: EpochMs | null;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

export type ExerciseInput = Pick<
  Exercise,
  'name' | 'type' | 'brand' | 'bodyPartIds' | 'defaultUnit' | 'step' | 'restSec' | 'instructions' | 'cautions'
>;

export interface Photo {
  id: Id;
  blob: Blob;
  width: number;
  height: number;
}

export interface Video {
  id: Id;
  exerciseId: Id;
  youtubeId: string;
  startSec: number;
  title: string;
  order: number;
}

export type VideoInput = Pick<Video, 'youtubeId' | 'startSec' | 'title'>;

export const GROUP_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

export interface Group {
  id: Id;
  name: string;
  color: GroupColor;
  bodyPartIds: Id[];
  exerciseIds: Id[]; // 有順序
  createdAt: EpochMs;
}

export type GroupInput = Pick<Group, 'name' | 'color' | 'bodyPartIds' | 'exerciseIds'>;

export interface ScheduleRule {
  id: Id;
  groupId: Id;
  weekdays: number[]; // 0=週日 … 6=週六
  startDate: LocalDate;
  endDate: LocalDate | null;
  createdAt: EpochMs;
}

export interface ScheduleOverride {
  date: LocalDate;
  groupId: Id | null; // null = 當天取消
}

export interface Session {
  id: Id;
  date: LocalDate; // 唯一：一天一筆
  groupId: Id | null; // null = 自由訓練
  groupName: string | null; // 快照：群組被刪除後歷史仍可顯示名稱
  startedAt: EpochMs;
  endedAt: EpochMs | null;
}

export interface WorkoutSet {
  id: Id;
  sessionId: Id;
  exerciseId: Id;
  date: LocalDate; // 冗餘存放，供趨勢圖以 [exerciseId+date] 查詢
  order: number; // 同一 Session 同一動作內的組序，從 1 起
  weight: number | null; // null = 徒手
  unit: WeightUnit | null; // weight 為 null 時必為 null
  reps: number;
  note: string;
  createdAt: EpochMs;
}

export type SetInput = Pick<WorkoutSet, 'weight' | 'unit' | 'reps' | 'note'>;

export interface Settings {
  defaultUnit: MassUnit;
  chartUnit: MassUnit;
  defaultRestSec: number;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultUnit: 'kg',
  chartUnit: 'kg',
  defaultRestSec: 90,
};
