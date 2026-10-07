// @vitest-environment node
// jsdom 的 Blob 經 fake-indexeddb 複製後會失去功能；資料層改用 Node 原生 Blob 測試
import 'fake-indexeddb/auto';
import { blobToBase64 } from '../../../src/data/blobCodec';
import { db, BUILTIN_BODY_PARTS } from '../../../src/data/db';
import {
  addBodyPart,
  addSet,
  deleteGroup,
  deleteSet,
  endSession,
  exportAll,
  exportCsvRows,
  getSettings,
  importAll,
  lastSessionSets,
  removeExercise,
  saveExercise,
  saveGroup,
  saveRule,
  saveSettings,
  scheduledGroupId,
  setOverride,
  setsForTrend,
  ValidationError,
} from '../../../src/data/repos';
import type { ExerciseInput } from '../../../src/data/types';
import { validateBackup } from '../../../src/domain/backup';

const chestPress: ExerciseInput = {
  name: '坐姿推胸機',
  type: 'machine',
  brand: 'Technogym',
  bodyPartIds: ['bp-chest'],
  defaultUnit: 'kg',
  step: null,
  restSec: null,
  instructions: '座椅調到握把與胸口同高',
  cautions: '',
};

const VIDEO = { youtubeId: 'dQw4w9WgXcQ', startSec: 30, title: '示範' };

async function log(exerciseId: string, date: string, weight: number | null = 40, reps = 10) {
  return addSet({ date, exerciseId, groupId: null, weight, unit: weight === null ? null : 'kg', reps, note: '' });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('資料庫初始化', () => {
  test('首次建立時寫入 11 個內建部位', async () => {
    const parts = await db.bodyParts.orderBy('order').toArray();
    expect(parts.map((p) => p.name)).toEqual(BUILTIN_BODY_PARTS.map((p) => p.name));
    expect(parts).toHaveLength(11);
  });

  test('可新增自訂部位，不可重名（MRS-007）', async () => {
    await addBodyPart('上胸');
    await expect(addBodyPart('胸')).rejects.toBeInstanceOf(ValidationError);
    expect(await db.bodyParts.count()).toBe(12);
  });
});

describe('動作（MRS-001、MRS-002）', () => {
  test('新增動作、影片與照片', async () => {
    const photo = { blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), width: 10, height: 10 };
    const id = await saveExercise(chestPress, [VIDEO, { ...VIDEO, startSec: 0 }], photo);
    const ex = await db.exercises.get(id);
    expect(ex?.name).toBe('坐姿推胸機');
    expect(ex?.archived).toBe(0);
    expect(ex?.photoId).not.toBeNull();
    const videos = await db.videos.where('exerciseId').equals(id).sortBy('order');
    expect(videos.map((v) => v.startSec)).toEqual([30, 0]);
  });

  test('修改時替換影片清單；photo=null 會移除照片', async () => {
    const photo = { blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), width: 1, height: 1 };
    const id = await saveExercise(chestPress, [VIDEO], photo);
    await saveExercise({ ...chestPress, brand: 'Life Fitness' }, [], null, id);
    expect((await db.exercises.get(id))?.brand).toBe('Life Fitness');
    expect(await db.videos.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
  });

  test('驗證失敗時丟出 ValidationError，不寫入資料', async () => {
    await expect(saveExercise({ ...chestPress, name: '' }, [], undefined)).rejects.toBeInstanceOf(ValidationError);
    expect(await db.exercises.count()).toBe(0);
  });

  test('沒有紀錄的動作會真正刪除，並從群組移除', async () => {
    const id = await saveExercise(chestPress, [VIDEO], undefined);
    await saveGroup({ name: '推日', color: 'red', bodyPartIds: [], exerciseIds: [id] });
    expect(await removeExercise(id)).toBe('deleted');
    expect(await db.exercises.count()).toBe(0);
    expect(await db.videos.count()).toBe(0);
    expect((await db.groups.toArray())[0]?.exerciseIds).toEqual([]);
  });

  test('有紀錄的動作只能封存，紀錄保留（PES A5）', async () => {
    const id = await saveExercise(chestPress, [], undefined);
    await log(id, '2026-10-01');
    expect(await removeExercise(id)).toBe('archived');
    expect((await db.exercises.get(id))?.archived).toBe(1);
    expect(await db.sets.count()).toBe(1);
  });
});

describe('紀錄（MRS-003、PIS C1）', () => {
  test('第一組自動建立當天 Session，組序遞增', async () => {
    const id = await saveExercise(chestPress, [], undefined);
    const s1 = await log(id, '2026-10-07');
    const s2 = await log(id, '2026-10-07');
    expect([s1.order, s2.order]).toEqual([1, 2]);
    expect(s1.sessionId).toBe(s2.sessionId);
    expect(await db.sessions.count()).toBe(1);
    expect((await db.exercises.get(id))?.lastUsedAt).not.toBeNull();
  });

  test('不同動作的組序各自計算', async () => {
    const a = await saveExercise(chestPress, [], undefined);
    const b = await saveExercise({ ...chestPress, name: '肩推機' }, [], undefined);
    await log(a, '2026-10-07');
    const sb = await log(b, '2026-10-07');
    expect(sb.order).toBe(1);
  });

  test('一天一筆：結束後再記錄會重新開啟同一筆', async () => {
    const id = await saveExercise(chestPress, [], undefined);
    await log(id, '2026-10-07');
    await endSession('2026-10-07');
    expect((await db.sessions.toArray())[0]?.endedAt).not.toBeNull();
    await log(id, '2026-10-07');
    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.endedAt).toBeNull();
  });

  test('Session 記錄群組名稱快照，刪除群組後仍保留', async () => {
    const id = await saveExercise(chestPress, [], undefined);
    const g = await saveGroup({ name: '推日', color: 'red', bodyPartIds: [], exerciseIds: [id] });
    await addSet({ date: '2026-10-07', exerciseId: id, groupId: g, weight: 40, unit: 'kg', reps: 10, note: '' });
    await deleteGroup(g);
    expect((await db.sessions.toArray())[0]?.groupName).toBe('推日');
  });

  test('刪除組後重新編排組序；全部刪光時刪除 Session', async () => {
    const id = await saveExercise(chestPress, [], undefined);
    const s1 = await log(id, '2026-10-07');
    const s2 = await log(id, '2026-10-07');
    const s3 = await log(id, '2026-10-07');
    await deleteSet(s2.id);
    expect((await db.sets.get(s3.id))?.order).toBe(2);
    await deleteSet(s1.id);
    await deleteSet(s3.id);
    expect(await db.sessions.count()).toBe(0);
  });

  test('驗證失敗不寫入', async () => {
    const id = await saveExercise(chestPress, [], undefined);
    await expect(log(id, '2026-10-07', 40, 0)).rejects.toBeInstanceOf(ValidationError);
    await expect(log(id, '2026-02-30')).rejects.toBeInstanceOf(ValidationError);
    expect(await db.sets.count()).toBe(0);
    expect(await db.sessions.count()).toBe(0);
  });

  test('lastSessionSets 取今天之前最近一次，依組序排列', async () => {
    const id = await saveExercise(chestPress, [], undefined);
    await log(id, '2026-10-01', 35);
    await log(id, '2026-10-03', 40);
    await log(id, '2026-10-03', 42.5);
    await log(id, '2026-10-07', 45);
    const last = await lastSessionSets(id, '2026-10-07');
    expect(last.map((s) => s.weight)).toEqual([40, 42.5]);
    expect(await lastSessionSets(id, '2026-10-01')).toEqual([]);
  });

  test('setsForTrend 依起始日篩選', async () => {
    const id = await saveExercise(chestPress, [], undefined);
    await log(id, '2026-08-01');
    await log(id, '2026-10-01');
    expect(await setsForTrend(id, '2026-09-07')).toHaveLength(1);
    expect(await setsForTrend(id, null)).toHaveLength(2);
  });
});

describe('群組與排程（MRS-008、MRS-009）', () => {
  test('群組名稱不可重複', async () => {
    await saveGroup({ name: '推日', color: 'red', bodyPartIds: [], exerciseIds: [] });
    await expect(saveGroup({ name: '推日', color: 'blue', bodyPartIds: [], exerciseIds: [] })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  test('每週規則與單日覆寫', async () => {
    const push = await saveGroup({ name: '推日', color: 'red', bodyPartIds: [], exerciseIds: [] });
    const legs = await saveGroup({ name: '腿日', color: 'green', bodyPartIds: [], exerciseIds: [] });
    await saveRule({ groupId: push, weekdays: [1, 4], startDate: '2026-10-01', endDate: null });
    expect(await scheduledGroupId('2026-10-05')).toBe(push);
    await setOverride('2026-10-05', legs);
    expect(await scheduledGroupId('2026-10-05')).toBe(legs);
    await setOverride('2026-10-08', null);
    expect(await scheduledGroupId('2026-10-08')).toBeNull();
  });

  test('一天最多 1 個群組：星期重疊的規則會被拒絕（PES A1）', async () => {
    const push = await saveGroup({ name: '推日', color: 'red', bodyPartIds: [], exerciseIds: [] });
    const legs = await saveGroup({ name: '腿日', color: 'green', bodyPartIds: [], exerciseIds: [] });
    await saveRule({ groupId: push, weekdays: [1, 4], startDate: '2026-10-01', endDate: null });
    await expect(
      saveRule({ groupId: legs, weekdays: [4], startDate: '2026-10-01', endDate: null }),
    ).rejects.toBeInstanceOf(ValidationError);
    await saveRule({ groupId: legs, weekdays: [2, 5], startDate: '2026-10-01', endDate: null });
    expect(await db.scheduleRules.count()).toBe(2);
  });

  test('刪除群組時一併刪除其排程', async () => {
    const push = await saveGroup({ name: '推日', color: 'red', bodyPartIds: [], exerciseIds: [] });
    await saveRule({ groupId: push, weekdays: [1], startDate: '2026-10-01', endDate: null });
    await setOverride('2026-10-07', push);
    await deleteGroup(push);
    expect(await db.scheduleRules.count()).toBe(0);
    expect(await db.scheduleOverrides.count()).toBe(0);
  });
});

describe('設定', () => {
  test('沒有存過時使用預設值', async () => {
    expect(await getSettings()).toEqual({ defaultUnit: 'kg', chartUnit: 'kg', defaultRestSec: 90 });
    await saveSettings({ defaultRestSec: 120 });
    expect((await getSettings()).defaultRestSec).toBe(120);
  });
});

describe('匯出與匯入（MRS-005、MRS-006）', () => {
  async function seed() {
    const photo = { blob: new Blob([new Uint8Array([255, 216, 255, 0, 1, 2])], { type: 'image/jpeg' }), width: 4, height: 3 };
    const ex = await saveExercise(chestPress, [VIDEO], photo);
    const g = await saveGroup({ name: '推日', color: 'red', bodyPartIds: ['bp-chest'], exerciseIds: [ex] });
    await saveRule({ groupId: g, weekdays: [1], startDate: '2026-10-01', endDate: null });
    await addSet({ date: '2026-10-05', exerciseId: ex, groupId: g, weight: 40, unit: 'kg', reps: 10, note: '=備註' });
    await saveSettings({ chartUnit: 'lb' });
    return ex;
  }

  test('匯出的 JSON 能通過驗證，匯入後資料完全一致（含照片）', async () => {
    await seed();
    const backup = await exportAll(new Date('2026-10-07T12:00:00+08:00'));
    // 模擬存成檔案再讀回
    const json: unknown = JSON.parse(JSON.stringify(backup));
    const result = validateBackup(json);
    expect(result.ok).toBe(true);

    await db.delete();
    await db.open();
    if (!result.ok) throw new Error(result.error);
    await importAll(result.backup);

    const again = await exportAll(new Date('2026-10-07T12:00:00+08:00'));
    expect(again).toEqual(backup);
    const photo = (await db.photos.toArray())[0]!;
    expect(await blobToBase64(photo.blob)).toBe(btoa(String.fromCharCode(255, 216, 255, 0, 1, 2)));
    expect(photo.blob.type).toBe('image/jpeg');
  });

  test('匯入是全部取代：原有資料被清除', async () => {
    await seed();
    const backup = await exportAll();
    await saveExercise({ ...chestPress, name: '匯入後應消失' }, [], undefined);
    await importAll(backup);
    expect(await db.exercises.where('name').equals('匯入後應消失').count()).toBe(0);
    expect(await db.exercises.count()).toBe(1);
  });

  test('匯入中途失敗時整筆撤銷，原資料不變（PES 7.3）', async () => {
    await seed();
    const backup = await exportAll();
    // 製造主鍵衝突：同一個 id 出現兩次，bulkAdd 會失敗
    const broken = structuredClone(backup);
    broken.data.sets.push({ ...broken.data.sets[0]! });
    await expect(importAll(broken)).rejects.toThrow();
    expect(await db.exercises.count()).toBe(1);
    expect(await db.sets.count()).toBe(1);
  });

  test('CSV 每一組一列，帶群組名稱', async () => {
    await seed();
    const rows = await exportCsvRows();
    expect(rows).toEqual([
      {
        date: '2026-10-05',
        groupName: '推日',
        exerciseName: '坐姿推胸機',
        type: 'machine',
        order: 1,
        weight: 40,
        unit: 'kg',
        reps: 10,
        note: '=備註',
      },
    ]);
  });
});

describe('validateBackup（PES 7.3）', () => {
  test('拒絕不是本 App 的檔案', () => {
    expect(validateBackup({ hello: 1 })).toEqual({ ok: false, error: '這不是本 App 的備份檔' });
    expect(validateBackup(null).ok).toBe(false);
  });

  test('拒絕較新版本', async () => {
    const b = await exportAll();
    expect(validateBackup({ ...b, version: 99 })).toEqual({ ok: false, error: '備份檔版本較新，請先更新 App 再匯入' });
  });

  test('欄位型別錯誤時指出是哪一筆', async () => {
    const id = await saveExercise(chestPress, [], undefined);
    await log(id, '2026-10-05');
    const b = structuredClone(await exportAll());
    (b.data.sets[0] as unknown as Record<string, unknown>).reps = '10';
    const r = validateBackup(b);
    expect(r).toEqual({ ok: false, error: '「組」第 1 筆的欄位 reps 格式錯誤' });
  });

  test('參照不存在的動作時拒絕', async () => {
    const id = await saveExercise(chestPress, [], undefined);
    await log(id, '2026-10-05');
    const b = structuredClone(await exportAll());
    b.data.exercises = [];
    expect(validateBackup(b)).toEqual({ ok: false, error: '有紀錄參照了不存在的動作' });
  });
});
