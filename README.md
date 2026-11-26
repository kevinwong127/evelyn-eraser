# WorkSheet Eraser

獨立 React + TypeScript Web App，包含工作表清除、功課批改、默書練習、Supabase Edge Functions、資料庫 migration 和 GitHub Pages 靜態部署。

## 功能

- **WorkSheet Eraser**：圖片／PDF 批量上傳、清除手寫、文字提取、掃描優化、局部修正及匯出。
- **功課小幫手 HK**：相片或手動輸入、批改、提示模式、歷史記錄及家長報告。
- **默書小助手**：`/#/dictation`，圖片 OCR、粵語／普通話／英文、語速、分段及播放控制。OCR 和語音在瀏覽器執行，不需要 AI API。
- Supabase 電郵登入、註冊及 Google OAuth。

## 服務與費用

- **前端**：GitHub Pages，使用公開 repository 時免費。
- **資料庫、登入和 Edge Functions**：使用你自己的 Supabase project，按 Supabase 計劃及用量計算。
- **文字 AI（功課批改和 OCR）**：直接呼叫 Google Cloud Vertex AI，使用 `gemini-3.1-pro-preview`。
- **圖片 AI（清除、掃描和重建）**：直接呼叫 Google Cloud Vertex AI，使用 `gemini-3.1-flash-image`。圖像功能需要啟用 Google Cloud billing，費用由你的 Google 帳戶控制。
- **默書 OCR 和語音**：瀏覽器內執行，不產生 AI API 費用。

AI 請求經 `aiplatform.googleapis.com`，以專用 Google service account 驗證。`GOOGLE_SERVICE_ACCOUNT_JSON` 只可以設為 Supabase Edge Function secret，不能放進前端程式碼、GitHub 或 Pages 分支。

## 本機執行

建議使用 Node.js 20 或以上版本。

```bash
npm install
cp .env.example .env
npm run dev
```

在 `.env` 填入自己 Supabase project 的公開設定：

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-anon-or-publishable-key
```

這裡只應放 Supabase 的公開 anon／publishable key。`.env` 已被 `.gitignore` 排除。

## 測試與正式建置

```bash
npm test
npm run build
npm run preview
```

建置結果位於 `dist/`。網站使用 Hash Router，因此 GitHub Pages 的內部頁面重新整理不需要額外 rewrite 設定。

## 獨立 Supabase 設定

1. 建立自己的 Supabase project。
2. 把 project reference 填入 `supabase/config.toml` 的 `project_id`。
3. 執行 `supabase/migrations/` 內全部 migrations，建立功課及默書資料表。
4. 在 Supabase Edge Function secrets 設定 `GOOGLE_SERVICE_ACCOUNT_JSON`（內容為專用 service account 的完整 JSON）。
5. 部署所有 functions：

```bash
supabase functions deploy erase-handwriting
supabase functions deploy extract-text
supabase functions deploy check-homework
supabase functions deploy rebuild-worksheet
supabase functions deploy scan-optimize
supabase functions deploy elevenlabs-tts
```

`elevenlabs-tts` 是預留接口，目前默書播放使用瀏覽器語音，不需要設定 ElevenLabs。

現有用戶的資料庫記錄和 Storage 檔案不包含在程式碼內，需要另外匯入及遷移。

## Google 登入

Supabase 內必須啟用 Google provider，並把本機及公開網址加入 allowed redirect URLs。OAuth callback 使用 `/#/auth`。

## GitHub Pages 部署

目前部署使用 `gh-pages` 分支：在本機透過 `.env` 執行 `npm run build`，再將 `dist/` 的靜態內容發布到該分支。這個方法不需要 GitHub Actions 或 workflow 權限。

在 **Settings → Pages** 選擇 **Deploy from branch**，分支為 `gh-pages`，目錄為 `/ (root)`。網址通常是 `https://YOUR_NAME.github.io/YOUR_REPO/`。

只有 Supabase 的公開前端設定會在建置時放入靜態網站。伺服器私密 key 絕對不能加入前端程式碼或 Pages 分支。
