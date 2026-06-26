# 1. 尋找 Chrome 安裝路徑
$paths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chromePath = ""
foreach ($p in $paths) {
    if (Test-Path $p) {
        $chromePath = $p
        break
    }
}

if (-not $chromePath) {
    Write-Error "找不到 Chrome 瀏覽器！"
    exit 1
}

# 2. 建立排程任務執行命令 (啟用 9222 連接埠偵錯與獨立 Profile)
$profilePath = "C:\Users\admin\Desktop\whoclean\chrome_profile"
$args = "--remote-debugging-port=9222 --user-data-dir=""$profilePath"" https://make.powerautomate.com/"
$action = New-ScheduledTaskAction -Execute $chromePath -Argument $args

# 3. 取得目前登入的互動式使用者
$currentUser = "desktop-glc2nae\admin"
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive

# 4. 註冊並立即啟動
$task = Register-ScheduledTask -TaskName "TempLaunchDebugChrome" -Action $action -Principal $principal -Force
Start-ScheduledTask -TaskName "TempLaunchDebugChrome"

# 5. 清理排程任務
Start-Sleep -Seconds 3
Unregister-ScheduledTask -TaskName "TempLaunchDebugChrome" -Confirm:$false

Write-Host "已在您的桌面上啟動偵錯模式的 Chrome！"
