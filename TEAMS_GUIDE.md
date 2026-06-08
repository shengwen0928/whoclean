# Microsoft Teams App 方案B (SSO 整合) 部署與設定指南

本指南將引導您如何將 WhoClean 封裝為 Microsoft Teams 內置 Tab App，並在 Teams 中實現自動辨識身分的無感登入功能。

---

## 🛠️ 第一步：選擇 HTTPS 部署方式 (ngrok 或 GitHub Pages)

Microsoft Teams 規定所有的 Tab 網頁必須為安全的 **HTTPS** 網址。您可以使用以下兩種方式之一來部署：

### 方案 1：使用 GitHub Pages (推薦，免費且免本機開機)
這是最方便的線上部署方案，GitHub 會自動提供免費的 HTTPS 網址。

1. **建立 GitHub 儲存庫 (Repository)**：
   - 在您的 GitHub 上建立一個新的儲存庫，例如命名為 `whoclean`。
2. **將本機程式碼推送到 GitHub**：
   在專案目錄下執行終端機指令（請將 `<your-username>` 替換為您的 GitHub 帳號）：
   ```bash
   git remote add origin https://github.com/<your-username>/whoclean.git
   git branch -M main
   git push -u origin main
   ```
3. **啟用 GitHub Pages**：
   - 進入該 GitHub 專案的 **Settings** -> **Pages**。
   - 在 **Build and deployment** 下的 **Source** 選擇 `Deploy from a branch`。
   - **Branch** 選擇 `main`，資料夾選擇 `/ (root)`，然後按下 **Save**。
4. **取得 HTTPS 網址**：
   - 稍等約 1~2 分鐘重新整理頁面，GitHub 會在上方顯示您的網站網址，格式為：
     `https://<your-username>.github.io/whoclean/`

> [!IMPORTANT]
> 請複製您的 GitHub Pages 網址（結尾需帶有 `/`），這將是您 Teams App 的正式網址。

---

### 方案 2：使用本地穿透 (ngrok，適合本地快速除錯)
如果您不想推送到 GitHub，只想在本機測試：

1. **安裝與執行 ngrok**：
   ```bash
   # 若您執行 start.bat 使用的是 Node.js (8080 埠)
   ngrok http 8080

   # 若您執行 start.bat 使用的是 Python (8000 埠)
   ngrok http 8000
   ```
2. **取得轉發網址**：
   複製啟動後顯示的 `https://xxxx.ngrok-free.app` 網址。

---

## 📝 第二步：修改 `manifest.json`

打開您的專案目錄下的 [manifest.json](file:///C:/Users/admin/Desktop/whoclean/manifest.json)，將所有 `http://localhost:8080` 替換為您的 ngrok 網址。

例如：
```json
{
  "developer": {
    "name": "WhoClean",
    "websiteUrl": "https://xxxx-xxxx-xxxx.ngrok-free.app",
    "privacyUrl": "https://xxxx-xxxx-xxxx.ngrok-free.app",
    "termsOfUseUrl": "https://xxxx-xxxx-xxxx.ngrok-free.app"
  },
  "staticTabs": [
    {
      "entityId": "whocleanTab",
      "name": "WhoClean 打掃紀錄",
      "contentUrl": "https://xxxx-xxxx-xxxx.ngrok-free.app/index.html",
      "websiteUrl": "https://xxxx-xxxx-xxxx.ngrok-free.app/index.html",
      "scopes": ["personal", "team"]
    }
  ],
  "validDomains": [
    "xxxx-xxxx-xxxx.ngrok-free.app"
  ]
}
```

---

## 📦 第三步：封裝 Teams App 安裝包

Microsoft Teams App 安裝包是一個簡單的 `.zip` 壓縮檔，包含三個檔案：
1. `manifest.json` (組態描述檔)
2. `color.png` (192x192 像素的彩色圖示)
3. `outline.png` (32x32 像素的外框圖示)

### 壓縮步驟 (Windows)
1. 進入 `whoclean` 專案資料夾。
2. 同時選取 `manifest.json`、`color.png` 與 `outline.png`。
3. 按下滑鼠右鍵，選擇 **「傳送到」 -> 「壓縮(zipped)資料夾」**（或使用 WinRAR / 7-Zip），命名為 `whoclean-teams-app.zip`。

> [!WARNING]
> 請確保這三個檔案位於壓縮檔的**根目錄**下，不要將整個 `whoclean` 資料夾直接壓縮，否則 Teams 會讀取不到組態檔。

---

## 🚀 第四步：上傳與側載至 Teams

1. 打開 **Microsoft Teams** 應用程式。
2. 點選左側選單的 **「應用程式」 (Apps)**。
3. 點選左下角的 **「管理您的應用程式」** (Manage your apps)。
4. 點選 **「上傳自訂應用程式」** (Publish a custom app) -> **「上傳為您或您的組織建立的應用程式」**。
5. 選擇您剛剛打包的 `whoclean-teams-app.zip`。
6. 上傳完成後，您可以將它新增到您的**個人視圖**或是某個**團隊頻道**的 Tab 中。

---

## 🎉 完成！體驗自動身分識別

當您在 Teams 內打開 WhoClean 時：
* 系統會透過 `microsoftTeams.app.getContext()` 自動獲取當前登入使用者的 `displayName`（姓名）與 `userPrincipalName`（Email）。
* 頂部會顯示為 Teams 的登入狀態（無須任何密碼輸入框）。
* 每位成員都可以自己設定 Webhook，或者透過 Deep Link 快速私訊當週值日生！
