# PIS — 產品內部規格（Product Internal Spec）

| 項目 | 內容 |
|---|---|
| 專案名稱 | gym-log（個人重訓紀錄 PWA） |
| 文件版次 | v1.1（已確認） |
| 日期 | 2026-10-07 |
| 依據 | 01_MRS.md v1.2、02_PES.md v1.1、03_SW_Arch.md v1.0 |
| 下一階段 | 實作 → SQA |

本文件是寫程式時的直接依據：資料型別、資料庫結構、各模組函式介面與規則、實作順序。

---

## 1. 開發環境（2026-10-07 實際安裝版本）

| 項目 | 版本 |
|---|---|
| Node.js | 24.19.0（LTS） |
| npm | 11.17.0 |
| TypeScript | 7.0.2 |
| Vite | 8.3.x |
| React | 19.3.x |
| React Router | 8.4.x（使用 `HashRouter`） |
| Dexie | 4.4.x |
| vite-plugin-pwa | 2.0.x |
| Vitest | 5.0.x |

正確版本以 `package-lock.json` 為準。

常用指令：

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm test` | 執行單元測試 |
| `npm run build` | 型別檢查＋正式建置（輸出 `dist/`） |
| `npm run preview` | 在本機預覽正式建置結果 |

程式慣例：識別字（變數、函式、型別）用英文；註解用繁體中文，只說明「為什麼」和不明顯的地方。

## 2. 資料型別（`src/data/types.ts`）

```ts
export type Id = string;              // crypto.randomUUID()
export type LocalDate = string;       // 'YYYY-MM-DD'，手機本地日期（UTC+8）
export type EpochMs = number;         // 毫秒時間戳記

export type ExerciseType = 'machine' | 'free' | 'bodyweight';  // 機台／自由重量／徒手
export type WeightUnit = 'kg' | 'lb' | 'notch';                // notch = 格數

export interface BodyPart {
  id: Id;
  name: string;          // 最多 10 字
  builtin: boolean;      // 內建部位不可刪除
  order: number;
}

export interface Exercise {
  id: Id;
  name: string;                   // 1–40 字
  type: ExerciseType;
  brand: string;                  // 0–40 字
  photoId: Id | null;
  bodyPartIds: Id[];              // 至少 1 個
  defaultUnit: WeightUnit | null; // null = 徒手不填重量
  step: number | null;            // null = 用單位預設間距
  restSec: number | null;         // null = 用全域預設
  instructions: string;           // 0–2000 字
  cautions: string;               // 0–1000 字
  archived: 0 | 1;                // IndexedDB 不能對 boolean 建索引，所以用 0/1
  lastUsedAt: EpochMs | null;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

export interface Photo {
  id: Id;
  blob: Blob;          // JPEG，長邊 ≤ 1280 px
  width: number;
  height: number;
}

export interface Video {
  id: Id;
  exerciseId: Id;
  youtubeId: string;   // 11 碼
  startSec: number;    // ≥ 0 的整數
  title: string;       // 0–60 字；空白時畫面顯示「影片 N」
  order: number;
}

export interface Group {
  id: Id;
  name: string;        // 1–20 字，不可重複
  color: GroupColor;
  bodyPartIds: Id[];
  exerciseIds: Id[];   // 有順序
  createdAt: EpochMs;
}
export type GroupColor = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink';

export interface ScheduleRule {
  id: Id;
  groupId: Id;
  weekdays: number[];      // 0=週日 … 6=週六
  startDate: LocalDate;
  endDate: LocalDate | null;
  createdAt: EpochMs;
}

export interface ScheduleOverride {
  date: LocalDate;         // 主鍵
  groupId: Id | null;      // null = 當天取消
}

export interface Session {
  id: Id;
  date: LocalDate;         // 唯一：一天只有一筆 Session
  groupId: Id | null;      // null = 自由訓練
  groupName: string | null; // 群組名稱快照：群組刪除後歷史仍可顯示
  startedAt: EpochMs;
  endedAt: EpochMs | null;
}

export interface WorkoutSet {
  id: Id;
  sessionId: Id;
  exerciseId: Id;
  date: LocalDate;         // 冗餘存放，供趨勢圖查詢（Arch D-7）
  order: number;           // 同一 Session 同一動作內的組序，從 1 起
  weight: number | null;   // 0–999.9；null = 徒手
  unit: WeightUnit | null; // weight 為 null 時必為 null
  reps: number;            // 1–999 整數
  note: string;            // 0–200 字
  createdAt: EpochMs;
}

export interface Settings {
  defaultUnit: 'kg' | 'lb';
  chartUnit: 'kg' | 'lb';
  defaultRestSec: number;   // 30–600，預設 90
}

export interface Meta {
  schemaVersion: number;
  lastBackupAt: EpochMs | null;
}
```

設計說明：

- **一天只有一筆 Session。** PES 規定「第一組存檔時自動建立當天的訓練」，所以同一天再記錄時都寫進同一筆。按下「結束今天的訓練」會填入 `endedAt`；之後同一天再記錄，會清掉 `endedAt`，重新開啟這筆 Session。
- **組序以「同一 Session 內同一動作」為範圍。** 也就是每個動作的第 1、2、3 組，與 SCR-02 畫面上的顯示一致。

## 3. 資料庫結構（`src/data/db.ts`，Dexie 版本 1）

| 資料表 | 主鍵與索引 | 主要查詢 |
|---|---|---|
| `bodyParts` | `id, order` | 依順序列出 |
| `exercises` | `id, name, type, archived, lastUsedAt, *bodyPartIds` | 清單、依部位篩選（`*` 代表多值索引） |
| `photos` | `id` | 依 id 取照片 |
| `videos` | `id, exerciseId` | 某動作的影片 |
| `groups` | `id, &name` | `&` 代表唯一值 |
| `scheduleRules` | `id, groupId` | 某群組的規則 |
| `scheduleOverrides` | `date` | 某一天的覆寫 |
| `sessions` | `id, &date, groupId` | 依日期取 Session |
| `sets` | `id, sessionId, exerciseId, date, [exerciseId+date]` | 某次訓練的所有組；某動作在某日期區間的組（趨勢圖） |
| `kv` | `key` | 存放 Settings 與 Meta |

首次建立資料庫時，寫入 11 個內建部位：胸、背、肩、二頭、三頭、前臂、股四頭、腿後、臀、小腿、核心。

**改版規則：** 之後只要資料表結構有改，就要 `db.version(n+1)`，並撰寫 `upgrade()` 函式。同時 `schemaVersion` 加 1，`domain/backup` 的升級函式也要加上對應版本，並補上測試（Arch AR-2）。

## 4. 領域層介面（`src/domain/`，全部是純函式）

### 4.1 `units.ts`

| 函式 | 規則 |
|---|---|
| `LB_TO_KG = 0.45359237` | 國際磅的定義值 |
| `convertMass(value, from: 'kg'\|'lb', to: 'kg'\|'lb'): number` | 不做四捨五入 |
| `defaultStep(unit: WeightUnit): number` | kg → 2.5、lb → 5、notch → 1 |
| `formatWeight(weight, unit): string` | 例如 `40 kg`、`88.5 lb`、`第 7 格`、`徒手`；最多 1 位小數，整數不顯示 `.0` |
| `clampWeight(v): number` | 限制在 0 到 999.9，並四捨五入到 1 位小數 |

### 4.2 `volume.ts`

```ts
type SetVolume =
  | { kind: 'mass'; kg: number }      // 重量 × 次數，換算成 kg
  | { kind: 'notch'; value: number }  // 格數 × 次數
  | { kind: 'reps'; value: number };  // 徒手：次數
function setVolume(s: Pick<WorkoutSet, 'weight' | 'unit' | 'reps'>): SetVolume
```

### 4.3 `trend.ts`

```ts
interface TrendPoint { date: LocalDate; value: number }
interface Trend {
  massMax: TrendPoint[];     // 每天最大重量（顯示單位）
  massVolume: TrendPoint[];  // 每天訓練量（顯示單位）
  notchMax: TrendPoint[];
  notchVolume: TrendPoint[];
  repsTotal: TrendPoint[];   // 徒手每日總次數
}
function buildTrend(sets: WorkoutSet[], displayUnit: 'kg' | 'lb'): Trend
function rangeStart(today: LocalDate, range: '1m' | '3m' | '6m' | 'all'): LocalDate | null
```

- 依日期由舊到新排序，每一條線只放有資料的日期。
- 圖表元件依 PES SCR-10 的規則決定要畫哪幾條線：沒有資料的線不畫；資料天數少於 2 時，顯示「紀錄累積 2 次以上才能畫趨勢」。

### 4.4 `prefill.ts`

```ts
interface Prefill { weight: number | null; unit: WeightUnit | null; reps: number }
function prefill(
  exercise: Pick<Exercise, 'defaultUnit'>,
  currentSessionSets: WorkoutSet[],   // 本次訓練中此動作的組，依組序排列
  lastSessionSets: WorkoutSet[],      // 此動作最近一次（不含今天）的組，依組序排列
): Prefill
```

決定預帶值時，依下列順序取第一個有資料的來源：

1. 本次訓練的最後一組。
2. 上次訓練的第 1 組。
3. 都沒有時：重量為 `null`（如果動作有預設單位，則為 `0`），單位用動作的預設單位，次數 **12**。

### 4.5 `schedule.ts`

```ts
function weekdayOf(date: LocalDate): number                // 0–6
function resolveGroup(date, rules, overrides): Id | null    // 該日排程的群組
function monthGrid(year, month): LocalDate[]                // 月曆格，從週日開始，6 列 × 7 天
function findOverlap(rule, others): ScheduleRule | null     // 檢查同一天是否有兩條規則
```

`resolveGroup` 的規則：

1. 當天有覆寫時，以覆寫為準，回傳覆寫的群組；覆寫為「取消」時回傳 `null`。
2. 沒有覆寫時，找出星期幾相符、且當天落在起訖日之間的規則。
3. 符合的規則不只一條時，取 `createdAt` 最大的那條。

### 4.6 `youtube.ts`

```ts
function parseYouTubeUrl(input: string): { videoId: string; startSec: number } | null
function embedUrl(videoId: string, startSec: number): string
function watchUrl(videoId: string, startSec: number): string
function parseMmSs(s: string): number | null    // '1:30' → 90；'90' → 90
function formatMmSs(sec: number): string         // 90 → '1:30'
```

- 支援的網址格式：`youtube.com/watch?v=ID`、`m.youtube.com/watch?v=ID`、`youtu.be/ID`、`youtube.com/shorts/ID`。網址可以有也可以沒有 `https://`，也可以帶 `www.`。
- 影片 ID 必須符合 `^[A-Za-z0-9_-]{11}$`。
- 時間參數 `t` 支援三種寫法：`90`、`90s`、`1m30s`。
- `embedUrl` 產生的網址為 `https://www.youtube-nocookie.com/embed/{id}?start={s}&playsinline=1&rel=0`。

### 4.7 `csv.ts`

```ts
interface CsvRow { date; groupName; exerciseName; type; order; weight; unit; reps; note }
function toCsv(rows: CsvRow[]): string   // 以 '﻿' 開頭（UTF-8 BOM）；換行用 CRLF
```

- 欄位內容含逗號、雙引號或換行時，整個欄位用雙引號包起來，內容中的雙引號寫成兩個。
- 欄位值開頭為 `=`、`+`、`-`、`@`、Tab、CR 時，在前面加 `'`。這是為了防止 Excel 把內容當成公式執行（CSV 注入）。
- 類型與單位輸出中文：機台、自由重量、徒手；kg、lb、格。

### 4.8 `backup.ts`

```ts
interface BackupV1 {
  format: 'gym-log-backup';
  version: 1;
  exportedAt: string;   // ISO 8601
  data: {
    bodyParts; exercises; videos; groups; scheduleRules; scheduleOverrides;
    sessions; sets;
    photos: { id; width; height; mime; base64 }[];
    settings: Settings;
  };
}
function validateBackup(json: unknown): { ok: true; backup: BackupV1 } | { ok: false; error: string }
function migrateBackup(json): BackupV1   // 未來版本升級用，目前只處理 v1
function summarize(b: BackupV1): { exportedAt; exercises; sessions; sets; photos }
```

驗證時逐項檢查：`format`、`version`、每張表的欄位型別、所有參照的 id 是否都存在（例如 `set.exerciseId`）。任何一項不通過，就回傳中文錯誤訊息。

### 4.9 `validate.ts`

集中放置 PES 的欄位驗證規則，例如名稱長度、重量範圍、次數範圍。UI 層與 repository 層都呼叫這裡的函式，確保兩邊用的規則一致。

## 5. 資料存取層（`src/data/repos.ts`）

| 函式 | 行為 |
|---|---|
| `saveExercise(input, videos, photo, id?)` | 新增或修改動作，並整批替換影片清單。`photo`：undefined＝不變、null＝移除、物件＝換新。照片由呼叫端先用 `platform/image` 壓縮，repository 不處理影像 |
| `removeExercise(id): 'deleted' \| 'archived'` | 有紀錄就封存，沒有紀錄就刪除，並一併刪除其影片與照片 |
| `addSet(input)` | **單一交易內**完成：找到或建立當天的 Session、計算組序、寫入 Set、更新 `exercise.lastUsedAt` |
| `updateSet` / `deleteSet` | 刪除後，重新編排同一動作剩下各組的組序；Session 內沒有任何組時，一併刪除該 Session |
| `endSession(date)` | 填入 `endedAt` |
| `lastSessionSets(exerciseId, beforeDate)` | 給 `prefill` 使用 |
| `setsForTrend(exerciseId, from)` | 使用 `[exerciseId+date]` 索引查詢 |
| `saveGroup` / `deleteGroup(id)` | 刪除群組時，一併刪除它的每週規則與單日覆寫（排程不能指向不存在的群組）；過去的訓練以 `groupName` 快照保留名稱。UI 在刪除前提示「會一併取消此群組的排程」 |
| `saveRule` | 存檔前呼叫 `findOverlap`，有重疊就拒絕 |
| `setOverride(date, groupId \| null)` / `clearOverride(date)` | 單日覆寫 |
| `exportAll(): BackupV1` / `importAll(b)` | 匯入在單一交易內完成清空與寫入。匯出時在交易內只讀資料庫，照片轉 base64 在交易外進行（IndexedDB 交易遇到非資料庫的等待會自動提交） |

## 6. 平台服務層（`src/platform/`）

| 模組 | 介面 | 說明 |
|---|---|---|
| `timer.ts` | `start(sec)`、`adjust(±15)`、`skip()`、`subscribe(cb)` | 狀態只記 `endAt`，剩餘秒數一律以 `endAt - Date.now()` 計算。同時把 `endAt` 存進 `localStorage`，App 被系統重新載入後仍能接續倒數 |
| `alert.ts` | `unlockAudio()`、`ring()` | `ring()` 會發出 Web Audio 提示音（880 Hz、0.15 秒 × 2），並呼叫 `navigator.vibrate([200,100,200])` |
| `wakeLock.ts` | `acquire()`、`release()` | 頁面回到前景（`visibilitychange`）時自動重新取得 |
| `storage.ts` | `requestPersist()`、`estimate()` | 對應 SCR-11 的「持久儲存」與「已用空間」 |
| `files.ts` | `saveFile(name, blob)`、`pickFile(accept)` | 手機支援時用分享選單（`navigator.canShare({files})`），否則改用 `<a download>` 下載 |
| `image.ts` | `compressImage(file): {blob,width,height}` | 用 `createImageBitmap` 讀取後畫到 canvas，縮到長邊 1280 px，存成 JPEG（品質 0.8） |

## 7. UI 結構（`src/ui/`）

路由（Hash 模式）：

| 路徑 | 畫面 |
|---|---|
| `/` | SCR-01 今天 |
| `/log/:exerciseId` | SCR-02（SCR-03 計時條嵌在此頁） |
| `/calendar` | SCR-04 |
| `/groups`, `/groups/:id` | SCR-05 |
| `/exercises` | SCR-06 |
| `/exercises/:id` | SCR-07 |
| `/exercises/:id/edit`, `/exercises/new` | SCR-08 |
| `/history` | SCR-09 |
| `/trend/:exerciseId` | SCR-10 |
| `/settings` | SCR-11 |

共用元件：`Stepper`（數字加減）、`UnitPicker`、`YouTubePlayer`（點擊後才載入 iframe）、`RestTimerBar`、`BodyPartPicker`、`ConfirmDialog`、`TabBar`、`UpdatePrompt`（有新版本時提示更新）。

樣式：使用 CSS 變數定義淺色與深色兩套顏色，跟隨 `prefers-color-scheme`。按鈕最小 44×44 px。不額外引入 UI 套件，以控制 App 大小。

## 8. 實作順序（6 週）

| 週 | 內容 | 完成條件 |
|---|---|---|
| W1 | 領域層全部模組、資料庫、repository | 單元測試全部通過 |
| W2 | 動作庫：SCR-06、07、08（照片、影片） | 可以在 Pixel 上建立第一台器材 |
| W3 | 記錄：SCR-01、02、03（預帶值、計時器、螢幕常亮） | 可以在健身房實際記錄 |
| W4 | 群組與行事曆：SCR-04、05 | 可以排一週的課表 |
| W5 | 歷史、趨勢、設定、匯出入：SCR-09、10、11 | 可以完成換手機演練（FLOW-05） |
| W6 | 部署到 GitHub Pages、實機測試、SQA | 05_SQA.md 驗收通過 |

## 9. 待確認事項

| # | 項目 | 決定 |
|---|---|---|
| C1 | 一天只有一筆 Session（結束後再記錄會重新開啟） | 採用 |
| C2 | 動作第一次記錄時，預帶次數 | **12** |
| C3 | CSV 加上防公式注入的處理（開頭為 `=+-@` 時加 `'`） | 採用 |

---

## 變更紀錄

| 版次 | 日期 | 說明 |
|---|---|---|
| v0.1 | 2026-10-07 | 初稿 |
| v1.0 | 2026-10-07 | C1 一天一筆、C2 預帶次數改為 12、C3 採用 |
| v1.1 | 2026-10-07 | W1 實作回饋：Session 加 groupName 快照；deleteGroup 一律刪除其排程；saveExercise 介面與照片責任歸屬；deleteSet 清除空 Session；CSV 防注入加入 Tab/CR；exportAll 交易範圍 |
