# 1. 讀取設定檔
$configPath = Join-Path $PSScriptRoot "config.json"
if (-not (Test-Path $configPath)) {
    Write-Error "找不到 config.json 設定檔"
    exit 1
}

$config = Get-Content -Raw $configPath | ConvertFrom-Json
# 讀取成員，相容舊格式（純字串陣列）與新格式（物件含 active）
$rawMembers = $config.members
$members = @()
foreach ($m in $rawMembers) {
    if ($m -is [string]) {
        # 舊格式：純字串
        $members += $m
    } elseif ($m.active -ne $false) {
        # 新格式：物件，且 active 不為 false
        $members += $m.name
    }
    # active = false 者直接跳過
}

$anchor = $config.anchor
$webhookUrl = $config.webhookUrl

if (-not $webhookUrl) {
    Write-Error "config.json 中未設定 webhookUrl！"
    exit 1
}

Write-Host "活躍成員 ($($members.Count) 人): $($members -join ', ')"

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

# 若錨點成員不在活躍列表中，自動重設
if (-not $anchor -or ($members -notcontains $anchor.memberName)) {
    if ($members.Count -gt 0) {
        $newAnchor = $members[0]
        Write-Warning "原錨點成員「$($anchor.memberName)」不在活躍列表中，自動重設錨點為「$newAnchor」（本週）"
        $anchor = @{ weekKey = $currentWeekKey; memberName = $newAnchor }
    } else {
        Write-Error "無活躍成員，無法排班！"
        exit 1
    }
}

$anchorIdx = $members.IndexOf($anchor.memberName)
$diff = Get-WeekDiff $anchor.weekKey $currentWeekKey
$cleanerIdx = (($anchorIdx + $diff) % $members.Count + $members.Count) % $members.Count
$cleanerName = $members[$cleanerIdx]

# 3. 建立 Teams Adaptive Card JSON (精緻版卡片)
$adaptiveCard = [ordered]@{
    type = "AdaptiveCard"
    version = "1.4"
    msteams = @{ width = "Full" }
    body = @(
        [ordered]@{
            type = "Container"
            style = "accent"
            bleed = $true
            items = @(
                [ordered]@{
                    type = "ColumnSet"
                    columns = @(
                        [ordered]@{
                            type = "Column"
                            width = "auto"
                            verticalContentAlignment = "Center"
                            items = @(
                                @{ type = "TextBlock"; text = "🧹"; size = "ExtraLarge" }
                            )
                        },
                        [ordered]@{
                            type = "Column"
                            width = "stretch"
                            verticalContentAlignment = "Center"
                            items = @(
                                [ordered]@{
                                    type = "TextBlock"
                                    text = "新的一週開始！本週值日生提醒"
                                    weight = "Bolder"
                                    size = "Large"
                                    color = "Accent"
                                },
                                [ordered]@{
                                    type = "TextBlock"
                                    text = "WhoClean · 每週一 08:00 自動排程通知"
                                    isSubtle = $true
                                    size = "Small"
                                    spacing = "None"
                                }
                            )
                        }
                    )
                }
            )
        },
        [ordered]@{
            type = "Container"
            spacing = "Medium"
            items = @(
                [ordered]@{
                    type = "TextBlock"
                    text = "本週值日生"
                    size = "Small"
                    isSubtle = $true
                    weight = "Bolder"
                },
                [ordered]@{
                    type = "TextBlock"
                    text = $cleanerName
                    size = "ExtraLarge"
                    weight = "Bolder"
                    color = "Accent"
                    spacing = "Small"
                    wrap = $true
                }
            )
        },
        [ordered]@{
            type = "ColumnSet"
            spacing = "Medium"
            separator = $true
            columns = @(
                [ordered]@{
                    type = "Column"
                    width = 1
                    items = @(
                        @{ type = "TextBlock"; text = "📅 週數"; size = "Small"; isSubtle = $true },
                        @{ type = "TextBlock"; text = $currentWeekKey; weight = "Bolder"; spacing = "None" }
                    )
                },
                [ordered]@{
                    type = "Column"
                    width = 1
                    items = @(
                        @{ type = "TextBlock"; text = "🗓️ 值日區間"; size = "Small"; isSubtle = $true },
                        @{ type = "TextBlock"; text = $dateRange; weight = "Bolder"; spacing = "None" }
                    )
                }
            )
        },
        [ordered]@{
            type = "TextBlock"
            text = "請值日生記得撥空打掃，大家一起維護環境整潔！💪"
            wrap = $true
            isSubtle = $true
            spacing = "Medium"
            separator = $true
        }
    )
    '$schema' = "http://adaptivecards.io/schemas/adaptive-card.json"
}

# Power Automate「工作流程」Webhook 需要 attachments 信封格式
$bodyPayload = [ordered]@{
    type = "message"
    attachments = @(
        [ordered]@{
            contentType = "application/vnd.microsoft.card.adaptive"
            content = $adaptiveCard
        }
    )
}

$jsonPayload = $bodyPayload | ConvertTo-Json -Depth 20 -Compress

# 4. 發送至 Teams Webhook
try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonPayload)
    $response = Invoke-RestMethod -Uri $webhookUrl -Method Post -ContentType "application/json" -Body $bytes
    Write-Host "發送成功！值日生為：$cleanerName"
} catch {
    Write-Error "發送失敗：$_"
}
