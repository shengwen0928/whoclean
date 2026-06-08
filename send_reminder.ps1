# 1. 讀取設定檔
$configPath = Join-Path $PSScriptRoot "config.json"
if (-not (Test-Path $configPath)) {
    Write-Error "找不到 config.json 設定檔"
    exit 1
}

$config = Get-Content -Raw $configPath | ConvertFrom-Json
$members = $config.members
$anchor = $config.anchor
$webhookUrl = $config.webhookUrl

if (-not $webhookUrl) {
    Write-Error "config.json 中未設定 webhookUrl！"
    exit 1
}

# 2. 計算週數與值日生 (演算法與網頁端相同)
function Get-YearWeekString([DateTime]$d) {
    $utcDate = [DateTime]::SpecifyKind($d.Date, [DateTimeKind]::Utc)
    $dayOfWeek = [int]$utcDate.DayOfWeek
    if ($dayOfWeek -eq 0) { $dayOfWeek = 7 }
    $thursday = $utcDate.AddDays(4 - $dayOfWeek)
    $yearStart = [DateTime]::new($thursday.Year, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)
    $weekNo = [Math]::Ceiling((($thursday - $yearStart).TotalDays + 1) / 7)
    return "$($thursday.Year)-W$(($weekNo.ToString()).PadLeft(2, '0'))"
}

function Get-WeekRangeText($weekStr) {
    $parts = $weekStr -split '-W'
    $year = [int]$parts[0]
    $week = [int]$parts[1]
    
    $simple = [DateTime]::new($year, 1, 1).AddDays(($week - 1) * 7)
    $dow = [int]$simple.DayOfWeek
    $isoWeekStart = $simple
    if ($dow -le 4) {
        $isoWeekStart = $simple.AddDays(-$dow + 1)
    } else {
        $isoWeekStart = $simple.AddDays(8 - $dow)
    }
    
    $start = $isoWeekStart
    $end = $isoWeekStart.AddDays(4)
    
    return "$($start.ToString('MM/dd')) ~ $($end.ToString('MM/dd'))"
}

function Get-WeekDiff($weekStr1, $weekStr2) {
    if ($weekStr1 -eq $weekStr2) { return 0 }
    
    function Get-MondayOfISOWeek($wStr) {
        $parts = $wStr -split '-W'
        $y = [int]$parts[0]
        $w = [int]$parts[1]
        
        $simple = [DateTime]::new($y, 1, 1).AddDays(($w - 1) * 7)
        $dow = [int]$simple.DayOfWeek
        if ($dow -le 4) {
            return $simple.AddDays(-$dow + 1)
        } else {
            return $simple.AddDays(8 - $dow)
        }
    }
    
    $d1 = Get-MondayOfISOWeek $weekStr1
    $d2 = Get-MondayOfISOWeek $weekStr2
    
    return [Math]::Round(($d2 - $d1).TotalDays / 7)
}

$today = [DateTime]::Now
$currentWeekKey = Get-YearWeekString $today
$dateRange = Get-WeekRangeText $currentWeekKey

$anchorIdx = $members.IndexOf($anchor.memberName)
$diff = Get-WeekDiff $anchor.weekKey $currentWeekKey
$cleanerIdx = (($anchorIdx + $diff) % $members.Count + $members.Count) % $members.Count
$cleanerName = $members[$cleanerIdx]

# 3. 建立 Teams Adaptive Card JSON
$bodyPayload = [ordered]@{
    type = "AdaptiveCard"
    version = "1.4"
    body = @(
        [ordered]@{
            type = "Container"
            style = "accent"
            bleed = $true
            items = @(
                @{
                    type = "TextBlock"
                    text = "🧹 WhoClean 本週值日生提醒 (Windows 自動發送)"
                    weight = "Bolder"
                    size = "Large"
                    color = "Accent"
                }
            )
        },
        [ordered]@{
            type = "FactSet"
            spacing = "Medium"
            facts = @(
                @{
                    title = "本週值日生:"
                    value = $cleanerName
                },
                @{
                    title = "值日區間:"
                    value = $dateRange
                }
            )
        },
        @{
            type = "TextBlock"
            text = "新的一週開始囉！請值日生記得撥空打掃，維護環境整潔！"
            wrap = $true
            isSubtle = $true
            spacing = "Medium"
        }
    )
    `$schema = "http://adaptivecards.io/schemas/adaptive-card.json"
}

$jsonPayload = $bodyPayload | ConvertTo-Json -Depth 10 -Compress

# 4. 發送至 Teams Webhook
try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonPayload)
    $response = Invoke-RestMethod -Uri $webhookUrl -Method Post -ContentType "application/json" -Body $bytes
    Write-Host "發送成功！值日生為：$cleanerName"
} catch {
    Write-Error "發送失敗：$_"
}
