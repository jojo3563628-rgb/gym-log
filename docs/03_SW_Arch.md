# SW Arch — 軟體架構（Software Architecture）

| 項目 | 內容 |
|---|---|
| 專案名稱 | gym-log（個人重訓紀錄 PWA） |
| 文件版次 | v1.0（已確認） |
| 日期 | 2026-10-07 |
| 依據 | 01_MRS.md v1.2、02_PES.md v1.1 |
| 目標裝置 | Google Pixel（Android＋Chrome） |
| 下一階段 | PIS（產品內部規格） |

本文件決定「系統由哪些部分組成、用什麼技術、資料怎麼流動、部署在哪裡」。各模組的函式簽名、資料表欄位型別等細節留給 PIS。

---

## 1. 架構總覽

**純前端、無後端**：整個 App 是一組靜態檔案（HTML／JS／CSS），由免費靜態託管平台提供下載；所有資料存在手機瀏覽器的 IndexedDB（瀏覽器內建的本機資料庫）。唯一的外部連線是 YouTube 內嵌播放器。

```
┌──────────────────────── 手機 ────────────────────────┐
│  PWA（主畫面圖示開啟，全螢幕）                          │
│  ┌────────────────────────────────────────────────┐  │
│  │ UI 層：頁面（SCR-01~11）、共用元件                │  │
│  ├────────────────────────────────────────────────┤  │
│  │ 狀態層：React hooks＋資料庫即時查詢（liveQuery）   │  │
│  ├────────────────────────────────────────────────┤  │
│  │ 領域層（純函式，無 UI、無 I/O）：                  │  │
│  │  單位換算／訓練量／預帶值／排程展開／               │  │
│  │  YouTube 網址解析／CSV、JSON 序列化               │  │
│  ├──────────────────────┬─────────────────────────┤  │
│  │ 資料存取層（Repository）│ 平台服務層               │  │
│  │  Dexie → IndexedDB    │  計時器、提示音、螢幕常亮、  │  │
│  │                      │  持久儲存、檔案匯出入、照片壓縮│  │
│  └──────────────────────┴─────────────────────────┘  │
│  Service Worker：快取 App 檔案 → 離線可用               │
└──────────────────────────────────────────────────────┘
        │ 首次安裝／更新時下載 App 檔案        │ 播放影片時
        ▼                                     ▼
  靜態託管（GitHub Pages）              YouTube（nocookie 內嵌）
  只放程式，不放任何使用者資料
```

分層原則：上層可以呼叫下層，下層不知道上層。**領域層全部是純函式**（輸入相同就得到相同輸出，不碰資料庫、不碰畫面），這樣 SQA 階段可以用單元測試直接驗證 PES 第 6 節的計算規則。

## 2. 技術選型

| 用途 | 選擇 | 理由 | 備選 |
|---|---|---|---|
| 語言 | TypeScript | 型別檢查可以在編譯時抓到欄位打錯、單位傳錯等錯誤 | JavaScript |
| UI 框架 | React | 資料、教學、範例最多，一人開發卡關時最好找答案 | Svelte、Vue、Preact |
| 建置工具 | Vite | 設定少、開發時即時更新 | — |
| PWA | vite-plugin-pwa（內含 Workbox） | 自動產生 Service Worker 與 manifest | 手寫 Service Worker |
| 本機資料庫 | Dexie（IndexedDB 包裝函式庫） | 原生 IndexedDB API 繁瑣；Dexie 提供版本升級、索引查詢，並可在資料變動時自動更新畫面 | idb、localForage |
| 路由 | React Router（Hash 模式，網址形如 `/#/exercise/123`） | 靜態託管在重新整理子頁面時不會出現 404 | — |
| 圖表 | Chart.js（react-chartjs-2） | 支援左右雙縱軸，符合 PES 6.1 格數另畫一條線的需求 | uPlot、Recharts |
| 拖曳排序 | dnd-kit | 支援觸控 | — |
| 日期 | date-fns | 依需要個別匯入函式，體積小 | Day.js |
| 月曆 | 自行實作 | 只需要月格與點選日期，用現成元件反而更難客製 | — |
| 測試 | Vitest、fake-indexeddb、Playwright | 細節在 SQA 階段定義 | — |

套件版本不在此寫死，PIS 階段建立專案時以當下 npm 的穩定版為準，並記錄在 `package.json` 與 lock 檔中。

## 3. 模組劃分

| 模組 | 職責 | 對應 PES |
|---|---|---|
| `domain/units` | kg 與 lb 換算、重量格式化 | 6.1 |
| `domain/volume` | 訓練量計算（重量×次數、格數、徒手） | 6.2 |
| `domain/trend` | 依日期彙整每日最大重量與訓練量，並把 kg/lb 和格數分成不同的線 | SCR-10 |
| `domain/prefill` | 計算記錄畫面的預帶重量、次數與單位 | SCR-02 |
| `domain/schedule` | 把「每週重複規則＋單日覆寫」展開成某一天的排程 | SCR-01、SCR-04 |
| `domain/youtube` | 解析三種網址格式，取出影片 ID 和 `t=` 起始秒數 | SCR-08 |
| `domain/backup` | JSON 備份的序列化、格式驗證、版本升級 | 7.2、7.3 |
| `domain/csv` | 產生 CSV（UTF-8 BOM、跳脫逗號和換行） | 7.1 |
| `data/db` | Dexie 資料庫定義、資料表、索引、版本升級 | — |
| `data/repos` | 各實體的新增、讀取、修改、刪除，以及封存規則 | SCR-08 刪除規則 |
| `platform/timer` | 以時間戳記為準的倒數計時 | SCR-03 |
| `platform/alert` | 提示音、震動（有支援才用）、螢幕常亮 | SCR-03 |
| `platform/storage` | 申請持久儲存、查詢已用空間 | R-1 |
| `platform/files` | 下載檔案、iOS 分享選單、讀取使用者選的檔案 | 7.x |
| `platform/image` | 照片縮小到長邊 1280 px 並轉成 JPEG | SCR-08 |
| `ui/pages/*` | SCR-01～SCR-11 | 全部 |
| `ui/components/*` | 數字加減器、單位切換、影片播放器、計時條等共用元件 | — |

## 4. 資料模型（邏輯層）

各欄位的型別、索引與限制在 PIS 定義，這裡只列實體與關係。

```
BodyPart ─┐
          │多對多
Exercise ─┼── 1:N ── Video
   │      └── 0..1 ── Photo（Blob 另存，避免列表查詢時載入照片）
   │
   │ 多對多（有順序）
Group ── 1:N ── ScheduleRule（每週星期幾，有起訖日）
   │
   └── 0..1 ── ScheduleOverride（單日覆寫：改成另一個群組，或取消）

Session（某一天的一次訓練，可對應一個 Group）── 1:N ── Set ── N:1 ── Exercise

Setting（設定，key/value）
Meta（資料庫格式版本、上次備份時間）
```

設計決策：

| 編號 | 決策 | 理由 |
|---|---|---|
| D-1 | 所有 ID 使用 UUID（`crypto.randomUUID()`），不用自動遞增數字 | 匯入、匯出時不會撞號，日後若要做雲端同步也比較好處理 |
| D-2 | 日期存成本地日期字串 `YYYY-MM-DD`（UTC+8），時間點存成毫秒時間戳記 | 「哪一天練的」以手機所在地的日期為準，不會因為時區換算跑到前一天 |
| D-3 | Set 儲存「輸入時的數值與單位」，不預先換算 | 符合 PES 6.1，原始資料不會因為四捨五入失真 |
| D-4 | 排程存「規則＋覆寫」，不預先產生每一天的資料 | 修改每週規則時不必批次改寫大量資料；單日修改只新增一筆覆寫 |
| D-5 | Exercise 用 `archived` 旗標實作封存 | PES SCR-08 規則：有紀錄的動作只能封存不能刪除 |
| D-6 | 照片另外存成 Photo 表，Exercise 只存 photoId | 列出動作清單時不必載入照片內容，清單捲動比較順 |
| D-7 | Set 冗餘存一份 `date` 欄位 | 畫趨勢圖時可以直接用「動作＋日期」索引查詢，不必先 join Session |

排程判定規則（`domain/schedule`）：查某一天的排程時，先看當天有沒有覆寫，有就以覆寫為準（包含「取消」）；沒有覆寫時，找符合星期幾且在起訖日內的規則。PES A1 規定一天最多 1 個群組，所以 UI 在建立規則時要阻擋星期重疊；萬一資料中仍有重疊，取最晚建立的那條規則。

## 5. 主要資料流

### 5.1 記錄一組（FLOW-01）

1. SCR-02 開啟時，`prefill` 依「本次訓練的上一組」或「該動作最近一次訓練的第 1 組」算出預帶值。
2. 使用者點「完成這組」：
   - 如果今天還沒有 Session，先建立一筆。
   - 寫入一筆 Set，並更新 `Exercise.lastUsedAt`。
   - 依該動作的休息秒數，或全域預設值，啟動 `timer`。
3. Dexie 的 liveQuery 偵測到資料變動，畫面上的組列表自動更新。

整個流程只寫本機資料庫、沒有網路往返，目標反應時間在 100 ms 以內。

### 5.2 匯出與匯入

- **匯出**：從所有資料表讀出資料，照片 Blob 轉成 base64，交給 `backup` 序列化，再交給 `files` 處理。手機支援分享選單時（`navigator.share`）就跳出分享選單，可以直接存到雲端硬碟或 LINE；不支援時改用一般下載。最後更新 `Meta.lastBackupAt`。
- **匯入**：讀取使用者選的檔案，交給 `backup` 驗證格式與版本，必要時把舊版格式升級成目前格式。驗證通過後先自動匯出一份目前的資料（PES 7.3），再用**單一資料庫交易**清空並寫入所有資料表。交易中任何一步失敗，整筆交易都會撤銷，原有資料保持不變。

## 6. 關鍵技術議題與查證結果

### 6.1 本機資料會不會被清除（R-1）

目標裝置為 Android Chrome。以下查證包含 Safari 的資料，僅供日後若要支援 iOS 時參考。

查證結果（WebKit 官方說明與 MDN）：

- Safari 在儲存空間不足，或網站一段時間沒有被使用時，可能自動刪除網站資料。
- 加到主畫面的 Web App 有自己的使用天數計算，而且實際使用 App 時會重置計時。
- 呼叫 `navigator.storage.persist()` 並獲准後，該網站的資料不會被自動清除。Safari 不會跳出詢問視窗，而是依情況自動決定是否核准，其中一項判斷依據就是 App 是否從主畫面開啟。

架構對策：

- Chromium 系瀏覽器（含 Android Chrome）同樣依使用者與網站的互動紀錄自動決定是否核准 `persist()`，不跳出詢問。

架構對策：

1. 一律以「安裝為 App」的方式使用，不要只在 Chrome 分頁中開啟。
2. App 第一次開啟時就呼叫 `persist()`，並在 SCR-11 顯示是否已獲准。
3. 保留 PES 的 14 天備份提醒。

### 6.2 YouTube 內嵌（MRS-002、105）

- 使用 `youtube-nocookie.com/embed/{id}` 網址，搭配 `start={秒}` 從指定秒數開始播放，加上 `playsinline=1` 讓影片在頁面內播放，不強制全螢幕。
- 不需要 API 金鑰，也不需要 YouTube Data API。影片標題由使用者自己填，不自動抓取，避免為了抓標題而用到 API 金鑰。
- 播放器在使用者點擊影片後才載入（lazy load），所以開啟 SCR-07 時不必等待 YouTube 載入；沒有網路時，說明文字和照片也能照常顯示。

### 6.3 休息計時器（MRS-010）

目標裝置為 Android Chrome，可用的能力如下：

| 能力 | Android Chrome | 用途 |
|---|---|---|
| 震動（`navigator.vibrate`） | 支援 | 時間到時震動 |
| 螢幕常亮（Screen Wake Lock API） | 支援（**實際行為於 SQA 以 Pixel 實機驗證**） | 訓練中避免自動鎖屏 |
| Web Audio | 支援；必須由使用者操作觸發後才能播放聲音 | 提示音 |
| 背景定時通知 | 沒有標準 API 能在 App 背景時自行於指定時間發出通知（推論，**未實測**） | 不依賴 |

架構對策：

1. 計時器以結束時間點為準，不依賴 `setInterval` 累加。App 回到前景時，用「結束時間 − 現在時間」重新計算剩餘秒數。
2. 從記錄第一組起，到按下「結束今天的訓練」為止，取得 Wake Lock 讓螢幕保持常亮。App 切到背景時 Wake Lock 會被系統釋放，回到前景時要重新取得。
3. 時間到時同時發出提示音、震動（例如 `[200, 100, 200]` 毫秒）並讓畫面閃爍。按下「完成這組」時先初始化音訊，以符合「必須由使用者操作觸發才能播放聲音」的限制。
4. 不做推播伺服器，以維持零主機費、資料不離開手機的原則。

### 6.4 App 更新

Service Worker 偵測到新版時，**不自動重新載入**，而是在畫面上顯示「有新版本，點此更新」。這是為了避免訓練到一半畫面突然重新整理。

### 6.5 儲存空間估算（**估計值**）

| 項目 | 單筆大小 | 數量 | 合計 |
|---|---|---|---|
| 照片（1280 px JPEG，品質 0.8） | 約 150–300 KB | 100 張 | 約 15–30 MB |
| 每一組的紀錄 | 約 200 B | 每年約 15,000 組 | 約 3 MB／年 |

各瀏覽器給網站的空間上限遠高於這個量級，因此只在 SCR-11 顯示目前用量，不另外處理空間上限。

## 7. 部署

| 項目 | 決定 |
|---|---|
| 程式碼存放 | GitHub repository |
| 託管 | GitHub Pages，免費方案只支援**公開** repo |
| 建置 | GitHub Actions：push 到 `main` 分支後自動執行建置、測試與部署 |
| 網址 | `https://<帳號>.github.io/gym-log/` |
| HTTPS | GitHub Pages 內建 HTTPS；PWA 和 Service Worker 都必須在 HTTPS 下才能運作 |

**公開 repo 是否有疑慮：** 公開的只有程式碼，訓練紀錄、照片等使用者資料都存在手機裡，不會進到 repo。只要不把自己的備份檔 commit 進 repo 即可；`.gitignore` 會排除 `*.json` 備份檔與 `backup/` 目錄。

**如果希望 repo 不公開：** 可以改用 Cloudflare Pages，免費方案每月可建置 500 次。它是否支援私人 repo，我沒有在官方文件中查到明確說明，**尚未查證**。

## 8. 安全與隱私

| 項目 | 做法 |
|---|---|
| 資料位置 | 只存在手機的 IndexedDB；App 沒有任何上傳資料的程式碼 |
| 外部連線 | 只連 `youtube-nocookie.com`，並用 Content-Security-Policy 限制只能嵌入這個網域的 iframe |
| 分析與追蹤 | 不使用任何分析或追蹤工具 |
| 備份檔 | 內含全部資料，存放位置由使用者自行決定；匯出畫面會提醒「備份檔請存在自己的私人空間」 |
| 匯入 | 先驗證格式，把匯入內容一律當成資料處理，不執行檔案中的任何內容；文字一律經 React 跳脫後顯示，不用 innerHTML |

## 9. 品質屬性對應

| PES | 架構如何滿足 |
|---|---|
| PES-NF-01 可安裝、全螢幕 | Web App Manifest 設定 `display: standalone`，並由 vite-plugin-pwa 產生 Service Worker |
| PES-NF-03 離線 | Service Worker 預先快取所有 App 檔案；資料存在 IndexedDB；影片延後載入 |
| PES-NF-04 2 秒內開啟 | App 檔案從 Service Worker 快取讀取，不經網路；圖表模組只在需要時才載入 |
| PES-NF-06 資料不外流 | 純前端架構，無後端；以 CSP 限制外部連線 |
| PES-NF-07 零費用 | GitHub Pages 加 GitHub Actions，皆用免費方案 |
| KPI-2 10 秒內記錄一組 | 預帶值計算加上本機寫入，不經網路 |

## 10. 專案目錄結構（預定）

```
gym-log/
├─ docs/                 01_MRS ～ 05_SQA
├─ public/               圖示、manifest 素材
├─ src/
│  ├─ domain/            純函式（單元測試重點）
│  ├─ data/              Dexie 資料庫定義、repository
│  ├─ platform/          計時器、音效、檔案、影像、儲存
│  ├─ ui/
│  │  ├─ pages/          SCR-01 ～ SCR-11
│  │  └─ components/
│  ├─ app.tsx
│  └─ main.tsx
├─ tests/
│  ├─ unit/              Vitest
│  └─ e2e/               Playwright
├─ .github/workflows/    部署流程
└─ package.json
```

## 11. 架構風險

| 編號 | 風險 | 對策 |
|---|---|---|
| AR-1 | 手動鎖屏或切到背景時計時器無法提示 | 6.3：螢幕常亮＋回前景時重新計算剩餘時間；SQA 於 Pixel 實機驗證 |
| AR-2 | 資料庫格式改版後，舊資料或舊備份讀不進來 | 使用 Dexie 的版本升級機制；備份檔記錄格式版本，由 `backup` 模組負責升級；每次改版都要有升級測試 |
| AR-3 | 備份檔太大，透過 LINE 等管道傳送失敗 | 匯出時顯示檔案大小；未來可以考慮匯出時選擇是否包含照片 |
| AR-4 | 一人開發，React 學習成本 | 如果你熟悉其他框架，可以改用該框架，領域層與資料層不受影響 |

## 12. 參考資料

- WebKit Blog, Updates to Storage Policy — https://webkit.org/?p=14403
- MDN, Storage quotas and eviction criteria — https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- YouTube Embedded Players and Player Parameters — https://developers.google.com/youtube/player_parameters
- Cloudflare Pages Limits — https://developers.cloudflare.com/pages/platform/limits
- Vibration API 在 iOS 的支援狀況（第三方整理）— https://progressier.com/pwa-capabilities/vibration-api

---

## 變更紀錄

| 版次 | 日期 | 說明 |
|---|---|---|
| v0.1 | 2026-10-07 | 初稿 |
| v1.0 | 2026-10-07 | 確認 React、GitHub Pages（公開 repo）；目標裝置改為 Google Pixel，改寫 6.1、6.3 |
