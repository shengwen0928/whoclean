@echo off
echo ===================================================
echo   WhoClean Launcher
echo ===================================================
echo.
echo Info: Due to browser security restrictions, this app
echo       must be run via a local web server.
echo.

:: Check Python
where python >nul 2>nul
if %ERRORLEVEL% equ 0 goto use_python

:: Check Node.js (npx)
where npx >nul 2>nul
if %ERRORLEVEL% equ 0 goto use_npx

:: Error
echo [Error] Python or Node.js was not detected on your system!
echo.
echo Options to run:
echo 1. Install Python or Node.js and run start.bat again.
echo 2. Open this folder in VS Code and use the 'Live Server' extension.
echo.
pause
exit /b

:use_python
echo [System] Detected Python. Starting local server...
echo URL: http://localhost:8000
echo Note: Please do not close this window.
echo.
start "" "http://localhost:8000"
python -m http.server 8000
exit /b

:use_npx
echo [System] Detected Node.js. Starting local server...
echo URL: http://localhost:8080
echo Note: Please do not close this window.
echo.
start "" "http://localhost:8080"
npx http-server -p 8080
exit /b
