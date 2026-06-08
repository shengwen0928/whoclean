@echo off
chcp 65001 > nul
echo ===================================================
echo   🚀 WhoClean 本周值日生打掃紀錄工具 - 啟動器
echo ===================================================
echo.
echo 說明: 由於瀏覽器安全性限制 (CORS Module Policy)，
echo 必須透過本地伺服器 (Local Server) 執行，無法直接雙擊點開 HTML。
echo.

:: 檢查 Python
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [系統偵測] 偵測到 Python，正在為您啟動本地伺服器...
    echo 伺服器網址: http://localhost:8000
    echo (視窗開啟後，請勿關閉此命令提示字元視窗)
    echo.
    start "" "http://localhost:8000"
    python -m http.server 8000
    goto end
)

:: 檢查 Node.js (npx)
where npx >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [系統偵測] 偵測到 Node.js，正在啟動 npx http-server...
    echo 伺服器網址: http://localhost:8080
    echo (視窗開啟後，請勿關閉此命令提示字元視窗)
    echo.
    start "" "http://localhost:8080"
    npx http-server -p 8080
    goto end
)

:: 如果都沒有安裝
echo ❌ [錯誤] 系統中未偵測到 Python 或 Node.js！
echo.
echo 請依以下任一方式開啟：
echo 1. 安裝 Python 之後重新執行此 start.bat。
echo 2. 在 VS Code 中對 index.html 點擊右鍵選擇「Open with Live Server」。
echo 3. 將此資料夾上傳至網頁託管服務（如 GitHub Pages、Vercel 等）。
echo.
pause

:end
