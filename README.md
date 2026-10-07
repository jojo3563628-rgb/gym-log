# gym-log 重訓紀錄

個人使用的重訓紀錄 PWA（可安裝到手機主畫面的網頁 App）。目標裝置為 Google Pixel（Android 版 Chrome）。

- 自建動作庫：器材照片、中文說明、注意事項、YouTube 教學影片（可指定起始秒數）
- 訓練紀錄、休息計時器、訓練群組與行事曆排程、進步趨勢圖
- 所有資料只存在手機本機，可匯出 JSON / CSV 備份

規格文件在 [`docs/`](docs/)：MRS → PES → SW Arch → PIS → SQA。

## 開發

需要 Node.js 24 以上。

```bash
npm install
npm run dev      # 開發伺服器：http://localhost:5173/gym-log/
npm test         # 單元測試
npm run build    # 型別檢查＋正式建置，輸出到 dist/
```

## 部署

push 到 `main` 分支後，GitHub Actions 會自動測試、建置並部署到 GitHub Pages（見 `.github/workflows/deploy.yml`）。

## 隱私

repo 只有程式碼。訓練資料存在手機瀏覽器的 IndexedDB，不會上傳。請勿把自己的備份檔（`gymlog_backup_*.json`）commit 進 repo，`.gitignore` 已預設排除。
