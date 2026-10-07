import Dexie, { type EntityTable } from 'dexie';
import type {
  BodyPart,
  Exercise,
  Group,
  Photo,
  ScheduleOverride,
  ScheduleRule,
  Session,
  Video,
  WorkoutSet,
} from './types';

export interface KvRow {
  key: string;
  value: unknown;
}

// 內建部位使用固定 id，讓不同手機的備份檔可以互相匯入
export const BUILTIN_BODY_PARTS: BodyPart[] = [
  ['chest', '胸'],
  ['back', '背'],
  ['shoulders', '肩'],
  ['biceps', '二頭'],
  ['triceps', '三頭'],
  ['forearms', '前臂'],
  ['quads', '股四頭'],
  ['hamstrings', '腿後'],
  ['glutes', '臀'],
  ['calves', '小腿'],
  ['core', '核心'],
].map(([key, name], i) => ({ id: `bp-${key}`, name: name!, builtin: true, order: i }));

export class GymDB extends Dexie {
  bodyParts!: EntityTable<BodyPart, 'id'>;
  exercises!: EntityTable<Exercise, 'id'>;
  photos!: EntityTable<Photo, 'id'>;
  videos!: EntityTable<Video, 'id'>;
  groups!: EntityTable<Group, 'id'>;
  scheduleRules!: EntityTable<ScheduleRule, 'id'>;
  scheduleOverrides!: EntityTable<ScheduleOverride, 'date'>;
  sessions!: EntityTable<Session, 'id'>;
  sets!: EntityTable<WorkoutSet, 'id'>;
  kv!: EntityTable<KvRow, 'key'>;

  constructor(name = 'gym-log') {
    super(name);
    // 結構變更時必須新增 version(n+1) 並撰寫 upgrade()，見 PIS 第 3 節
    this.version(1).stores({
      bodyParts: 'id, order',
      exercises: 'id, name, type, archived, lastUsedAt, *bodyPartIds',
      photos: 'id',
      videos: 'id, exerciseId',
      groups: 'id, &name',
      scheduleRules: 'id, groupId',
      scheduleOverrides: 'date',
      sessions: 'id, &date, groupId',
      sets: 'id, sessionId, exerciseId, date, [exerciseId+date]',
      kv: 'key',
    });
    this.on('populate', (tx) => {
      void tx.table('bodyParts').bulkAdd(BUILTIN_BODY_PARTS);
    });
  }

  get allTables() {
    return [
      this.bodyParts,
      this.exercises,
      this.photos,
      this.videos,
      this.groups,
      this.scheduleRules,
      this.scheduleOverrides,
      this.sessions,
      this.sets,
      this.kv,
    ];
  }
}

export const db = new GymDB();
