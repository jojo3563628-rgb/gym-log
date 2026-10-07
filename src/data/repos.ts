import Dexie from 'dexie';
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupV1 } from '../domain/backup';
import type { CsvRow } from '../domain/csv';
import { resolveGroup, findOverlap } from '../domain/schedule';
import {
  validateBodyPartName,
  validateExerciseInput,
  validateGroupInput,
  validateSetInput,
  validateVideoInput,
} from '../domain/validate';
import { isLocalDate } from '../domain/dates';
import { base64ToBlob, blobToBase64 } from './blobCodec';
import { db } from './db';
import {
  DEFAULT_SETTINGS,
  type BodyPart,
  type Exercise,
  type ExerciseInput,
  type Group,
  type GroupInput,
  type Id,
  type LocalDate,
  type Photo,
  type ScheduleRule,
  type Session,
  type SetInput,
  type Settings,
  type VideoInput,
  type WorkoutSet,
} from './types';

export class ValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join('；'));
    this.name = 'ValidationError';
  }
}

function assertValid(errors: string[]): void {
  if (errors.length > 0) throw new ValidationError(errors);
}

const newId = () => crypto.randomUUID();

// ---------------- 訓練部位 ----------------

export async function addBodyPart(name: string): Promise<Id> {
  const err = validateBodyPartName(name);
  if (err) throw new ValidationError([err]);
  return db.transaction('rw', db.bodyParts, async () => {
    const all = await db.bodyParts.toArray();
    if (all.some((b) => b.name === name.trim())) throw new ValidationError(['部位名稱已存在']);
    const part: BodyPart = {
      id: newId(),
      name: name.trim(),
      builtin: false,
      order: Math.max(-1, ...all.map((b) => b.order)) + 1,
    };
    await db.bodyParts.add(part);
    return part.id;
  });
}

// ---------------- 動作 ----------------

export interface PhotoInput {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * 新增或修改動作。photo：undefined = 不變更、null = 移除、物件 = 換新照片
 * 照片須由呼叫端先以 platform/image 壓縮。
 */
export async function saveExercise(
  input: ExerciseInput,
  videos: VideoInput[],
  photo: PhotoInput | null | undefined,
  id?: Id,
): Promise<Id> {
  assertValid([...validateExerciseInput(input), ...videos.flatMap(validateVideoInput)]);
  const now = Date.now();
  return db.transaction('rw', [db.exercises, db.videos, db.photos], async () => {
    const existing = id ? await db.exercises.get(id) : undefined;
    if (id && !existing) throw new Error(`找不到動作 ${id}`);

    let photoId = existing?.photoId ?? null;
    if (photo !== undefined) {
      if (photoId) await db.photos.delete(photoId);
      photoId = null;
      if (photo) {
        const p: Photo = { id: newId(), ...photo };
        await db.photos.add(p);
        photoId = p.id;
      }
    }

    const exercise: Exercise = {
      id: existing?.id ?? newId(),
      ...input,
      name: input.name.trim(),
      brand: input.brand.trim(),
      photoId,
      archived: existing?.archived ?? 0,
      lastUsedAt: existing?.lastUsedAt ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.exercises.put(exercise);

    await db.videos.where('exerciseId').equals(exercise.id).delete();
    await db.videos.bulkAdd(
      videos.map((v, i) => ({ id: newId(), exerciseId: exercise.id, ...v, title: v.title.trim(), order: i })),
    );
    return exercise.id;
  });
}

/** 有紀錄的動作只能封存；沒有紀錄才真正刪除（PES SCR-08） */
export async function removeExercise(id: Id): Promise<'deleted' | 'archived'> {
  return db.transaction('rw', [db.exercises, db.videos, db.photos, db.sets, db.groups], async () => {
    const ex = await db.exercises.get(id);
    if (!ex) throw new Error(`找不到動作 ${id}`);
    const used = await db.sets.where('exerciseId').equals(id).count();
    if (used > 0) {
      await db.exercises.update(id, { archived: 1, updatedAt: Date.now() });
      return 'archived';
    }
    await db.videos.where('exerciseId').equals(id).delete();
    if (ex.photoId) await db.photos.delete(ex.photoId);
    await db.exercises.delete(id);
    // 從各群組的動作清單中移除
    await db.groups.toCollection().modify((g) => {
      g.exerciseIds = g.exerciseIds.filter((x) => x !== id);
    });
    return 'deleted';
  });
}

export async function unarchiveExercise(id: Id): Promise<void> {
  await db.exercises.update(id, { archived: 0, updatedAt: Date.now() });
}

// ---------------- 訓練與組 ----------------

export interface AddSetInput extends SetInput {
  date: LocalDate;
  exerciseId: Id;
  /** 只在當天第一次建立 Session 時使用 */
  groupId: Id | null;
}

async function sessionGroupName(groupId: Id | null): Promise<string | null> {
  if (!groupId) return null;
  return (await db.groups.get(groupId))?.name ?? null;
}

/** 單一交易內：找到或建立當天 Session、計算組序、寫入、更新最近使用時間 */
export async function addSet(input: AddSetInput): Promise<WorkoutSet> {
  assertValid(validateSetInput(input));
  if (!isLocalDate(input.date)) throw new ValidationError(['日期格式錯誤']);
  const now = Date.now();
  return db.transaction('rw', [db.sessions, db.sets, db.exercises, db.groups], async () => {
    if (!(await db.exercises.get(input.exerciseId))) throw new Error(`找不到動作 ${input.exerciseId}`);

    let session = await db.sessions.where('date').equals(input.date).first();
    if (!session) {
      session = {
        id: newId(),
        date: input.date,
        groupId: input.groupId,
        groupName: await sessionGroupName(input.groupId),
        startedAt: now,
        endedAt: null,
      };
      await db.sessions.add(session);
    } else if (session.endedAt !== null) {
      // 一天一筆：結束後再記錄就重新開啟（PIS C1）
      await db.sessions.update(session.id, { endedAt: null });
    }

    const siblings = await db.sets.where('sessionId').equals(session.id).filter((s) => s.exerciseId === input.exerciseId).toArray();
    const set: WorkoutSet = {
      id: newId(),
      sessionId: session.id,
      exerciseId: input.exerciseId,
      date: input.date,
      order: Math.max(0, ...siblings.map((s) => s.order)) + 1,
      weight: input.weight,
      unit: input.unit,
      reps: input.reps,
      note: input.note.trim(),
      createdAt: now,
    };
    await db.sets.add(set);
    await db.exercises.update(input.exerciseId, { lastUsedAt: now });
    return set;
  });
}

export async function updateSet(id: Id, patch: SetInput): Promise<void> {
  assertValid(validateSetInput(patch));
  const n = await db.sets.update(id, { ...patch, note: patch.note.trim() });
  if (n === 0) throw new Error(`找不到紀錄 ${id}`);
}

/** 刪除後重新編排組序；Session 沒有任何組時一併刪除 */
export async function deleteSet(id: Id): Promise<void> {
  await db.transaction('rw', [db.sets, db.sessions], async () => {
    const set = await db.sets.get(id);
    if (!set) return;
    await db.sets.delete(id);
    const rest = await db.sets.where('sessionId').equals(set.sessionId).toArray();
    if (rest.length === 0) {
      await db.sessions.delete(set.sessionId);
      return;
    }
    const siblings = rest.filter((s) => s.exerciseId === set.exerciseId).sort((a, b) => a.order - b.order);
    for (const [i, s] of siblings.entries()) {
      if (s.order !== i + 1) await db.sets.update(s.id, { order: i + 1 });
    }
  });
}

export async function endSession(date: LocalDate): Promise<void> {
  const session = await db.sessions.where('date').equals(date).first();
  if (session && session.endedAt === null) await db.sessions.update(session.id, { endedAt: Date.now() });
}

export async function sessionByDate(date: LocalDate): Promise<Session | undefined> {
  return db.sessions.where('date').equals(date).first();
}

/** 某動作在 beforeDate 之前最近一次訓練的所有組（依組序），供 prefill 使用 */
export async function lastSessionSets(exerciseId: Id, beforeDate: LocalDate): Promise<WorkoutSet[]> {
  const latest = await db.sets
    .where('[exerciseId+date]')
    .between([exerciseId, Dexie.minKey], [exerciseId, beforeDate], true, false)
    .last();
  if (!latest) return [];
  const sets = await db.sets.where('[exerciseId+date]').equals([exerciseId, latest.date]).toArray();
  return sets.sort((a, b) => a.order - b.order);
}

export async function setsForExerciseOnDate(exerciseId: Id, date: LocalDate): Promise<WorkoutSet[]> {
  const sets = await db.sets.where('[exerciseId+date]').equals([exerciseId, date]).toArray();
  return sets.sort((a, b) => a.order - b.order);
}

export async function setsForTrend(exerciseId: Id, from: LocalDate | null): Promise<WorkoutSet[]> {
  return db.sets
    .where('[exerciseId+date]')
    .between([exerciseId, from ?? Dexie.minKey], [exerciseId, Dexie.maxKey], true, true)
    .toArray();
}

// ---------------- 群組與排程 ----------------

export async function saveGroup(input: GroupInput, id?: Id): Promise<Id> {
  assertValid(validateGroupInput(input));
  const name = input.name.trim();
  return db.transaction('rw', db.groups, async () => {
    const dup = await db.groups.where('name').equals(name).first();
    if (dup && dup.id !== id) throw new ValidationError(['群組名稱已存在']);
    const existing = id ? await db.groups.get(id) : undefined;
    if (id && !existing) throw new Error(`找不到群組 ${id}`);
    const group: Group = { id: existing?.id ?? newId(), ...input, name, createdAt: existing?.createdAt ?? Date.now() };
    await db.groups.put(group);
    return group.id;
  });
}

/** 刪除群組時一併刪除它的排程；過去的訓練以 groupName 快照保留名稱 */
export async function deleteGroup(id: Id): Promise<void> {
  await db.transaction('rw', [db.groups, db.scheduleRules, db.scheduleOverrides], async () => {
    await db.scheduleRules.where('groupId').equals(id).delete();
    await db.scheduleOverrides.filter((o) => o.groupId === id).delete();
    await db.groups.delete(id);
  });
}

export type RuleInput = Pick<ScheduleRule, 'groupId' | 'weekdays' | 'startDate' | 'endDate'>;

export async function saveRule(input: RuleInput, id?: Id): Promise<Id> {
  const errors: string[] = [];
  const weekdays = [...new Set(input.weekdays)].sort();
  if (weekdays.length === 0 || weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    errors.push('請至少選 1 個星期');
  }
  if (!isLocalDate(input.startDate)) errors.push('開始日期格式錯誤');
  if (input.endDate !== null && (!isLocalDate(input.endDate) || input.endDate < input.startDate)) {
    errors.push('結束日期需晚於開始日期');
  }
  assertValid(errors);

  return db.transaction('rw', [db.scheduleRules, db.groups], async () => {
    if (!(await db.groups.get(input.groupId))) throw new Error(`找不到群組 ${input.groupId}`);
    const existing = id ? await db.scheduleRules.get(id) : undefined;
    const rule: ScheduleRule = {
      id: existing?.id ?? newId(),
      ...input,
      weekdays,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    const overlap = findOverlap(rule, await db.scheduleRules.toArray());
    if (overlap) throw new ValidationError(['和既有的每週排程在同一天重疊（一天最多排 1 個群組）']);
    await db.scheduleRules.put(rule);
    return rule.id;
  });
}

export async function deleteRule(id: Id): Promise<void> {
  await db.scheduleRules.delete(id);
}

export async function setOverride(date: LocalDate, groupId: Id | null): Promise<void> {
  if (!isLocalDate(date)) throw new ValidationError(['日期格式錯誤']);
  await db.scheduleOverrides.put({ date, groupId });
}

export async function clearOverride(date: LocalDate): Promise<void> {
  await db.scheduleOverrides.delete(date);
}

export async function scheduledGroupId(date: LocalDate): Promise<Id | null> {
  const [rules, override] = await Promise.all([db.scheduleRules.toArray(), db.scheduleOverrides.get(date)]);
  return resolveGroup(date, rules, override ? [override] : []);
}

// ---------------- 設定與備份時間 ----------------

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get('settings');
  return { ...DEFAULT_SETTINGS, ...(row?.value as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await db.kv.put({ key: 'settings', value: { ...current, ...patch } });
}

export async function getLastBackupAt(): Promise<number | null> {
  return ((await db.kv.get('lastBackupAt'))?.value as number | undefined) ?? null;
}

export async function markBackup(at = Date.now()): Promise<void> {
  await db.kv.put({ key: 'lastBackupAt', value: at });
}

// ---------------- 匯出與匯入 ----------------

export async function exportAll(now = new Date()): Promise<BackupV1> {
  // 交易內只做資料庫讀取；照片轉 base64 不是 IndexedDB 操作，
  // 若在交易中等待它，交易會被自動提交，之後的讀取就會失敗
  const snapshot = await db.transaction('r', db.allTables, async () => ({
    bodyParts: await db.bodyParts.toArray(),
    exercises: await db.exercises.toArray(),
    videos: await db.videos.toArray(),
    groups: await db.groups.toArray(),
    scheduleRules: await db.scheduleRules.toArray(),
    scheduleOverrides: await db.scheduleOverrides.toArray(),
    sessions: await db.sessions.toArray(),
    sets: await db.sets.toArray(),
    photos: await db.photos.toArray(),
    settings: await getSettings(),
  }));
  const photos = await Promise.all(
    snapshot.photos.map(async (p) => ({
      id: p.id,
      width: p.width,
      height: p.height,
      mime: p.blob.type || 'image/jpeg',
      base64: await blobToBase64(p.blob),
    })),
  );
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: { ...snapshot, photos },
  };
}

/** 全部取代。呼叫前須先通過 validateBackup；任何一步失敗整筆撤銷，原資料不變 */
export async function importAll(b: BackupV1): Promise<void> {
  const d = b.data;
  // base64 解碼在交易外先做完，避免交易因等待非 IndexedDB 的工作而自動提交
  const photos: Photo[] = d.photos.map((p) => ({
    id: p.id,
    width: p.width,
    height: p.height,
    blob: base64ToBlob(p.base64, p.mime),
  }));
  await db.transaction('rw', db.allTables, async () => {
    const lastBackupAt = await getLastBackupAt();
    await Promise.all(db.allTables.map((t) => t.clear()));
    await db.bodyParts.bulkAdd(d.bodyParts);
    await db.exercises.bulkAdd(d.exercises);
    await db.photos.bulkAdd(photos);
    await db.videos.bulkAdd(d.videos);
    await db.groups.bulkAdd(d.groups);
    await db.scheduleRules.bulkAdd(d.scheduleRules);
    await db.scheduleOverrides.bulkAdd(d.scheduleOverrides);
    await db.sessions.bulkAdd(d.sessions);
    await db.sets.bulkAdd(d.sets);
    await db.kv.put({ key: 'settings', value: d.settings });
    if (lastBackupAt !== null) await db.kv.put({ key: 'lastBackupAt', value: lastBackupAt });
  });
}

export async function exportCsvRows(): Promise<CsvRow[]> {
  const [sets, sessions, exercises] = await Promise.all([
    db.sets.toArray(),
    db.sessions.toArray(),
    db.exercises.toArray(),
  ]);
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  return sets
    .map((s) => {
      const ex = exMap.get(s.exerciseId);
      return {
        date: s.date,
        groupName: sessionMap.get(s.sessionId)?.groupName ?? null,
        exerciseName: ex?.name ?? '',
        type: ex?.type ?? 'machine',
        order: s.order,
        weight: s.weight,
        unit: s.unit,
        reps: s.reps,
        note: s.note,
        createdAt: s.createdAt,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map(({ createdAt: _createdAt, ...row }) => row);
}
