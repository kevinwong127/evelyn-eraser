# WorkSheet Eraser

這是從 Lovable 完整 Codebase 遷移的 React + TypeScript 專案，包含原始頁面、Supabase Edge Functions、資料庫 migration，以及 GitHub Pages 部署設定。前端可直接在本機或 GitHub Pages 執行，不需要在 Lovable 編輯或發布網站。

## 功能

- WorkSheet Eraser：圖片／PDF 批量上傳、AI 清除手寫、文字提取、掃描優化、局部修正及匯出。
- 功課小幫手 HK：相片或手動輸入、AI 批改、提示模式、歷史記錄及家長報告。
- 默書小助手：連接原有外部服務。
- Supabase 電郵登入、註冊及 Google OAuth。

## 服務依賴

這個 repository 包含應用程式碼，但不包含資料庫內的記錄、Storage 檔案或私密密钥。

- **前端**：可獨立部署到 GitHub Pages。
- **資料庫與登入**：使用 Supabase。
- **AI**：目前仍由原 Supabase Edge Functions 呼叫 Lovable AI Gateway，會需要有效的 `LOVABLE_API_KEY` 並可能消耗 Lovable AI 額度。若要完全停用 Lovable 收費，需要把 Edge Functions 改接其他 AI 供應商。
- **Google 登入**：已改用 Supabase 標準 OAuth；Supabase 內必須啟用 Google provider，並把最終網址加入 allowed redirect URLs。

## 本機執行

建議使用 Node.js 20 或以上版本。

```bash
npm install
cp .env.example .env
npm run dev
```

編輯 `.env`，填入自己的 Supabase 設定：

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-anon-or-publishable-key
```

這裡只應放 Supabase 的公開 anon／publishable key。**不要放入 service-role key、Lovable API key 或其他私密伺服器密钥。** `.env` 已被 `.gitignore` 排除。

## 測試與正式建置

```bash
npm test
npm run build
npm run preview
```

建置結果位於 `dist/`。網站使用 Hash Router，因此 GitHub Pages 的內部頁面重新整理不需要額外 rewrite 設定。

## 推送到 GitHub

在 GitHub 建立一個空白 repository，然後在此目錄執行（先確認沒有把 `.env` 加入版本控制）：

```bash
git init
git add .
git status
git commit -m "Migrate Evelyn Eraser from Lovable"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/YOUR_REPO.git
git push -u origin main
```

## GitHub Pages 部署

目前部署使用 `gh-pages` 分支：先在本機透過 `.env` 執行 `npm run build`，再將 `dist/` 的靜態內容發布到該分支。這個方法不需要 GitHub Actions 或 workflow 權限。

在 **Settings → Pages** 應選擇 **Deploy from branch**，分支為 `gh-pages`，目錄為 `/ (root)`。網址通常是 `https://YOUR_NAME.github.io/YOUR_REPO/`，以 GitHub Pages 顯示為準。

只有 Supabase 的公開前端設定會在建置時放入靜態網站。伺服器私密 key 絕對不能加入前端程式碼或 Pages 分支。

## Supabase 後端

原始後端位於：

```text
supabase/functions/
├── erase-handwriting/
├── check-homework/
├── extract-text/
├── rebuild-worksheet/
└── scan-optimize/
```

如要部署到你自己的 Supabase project，需要安裝 Supabase CLI、連結 project、執行 migrations，再部署 functions 和設定伺服器 secrets。`LOVABLE_API_KEY` 只能設為 Edge Function secret，不能放進 `.env` 或前端程式碼。

資料庫備份與 Storage 檔案需要另外遷移；程式碼 ZIP 並不包含這些資料。
