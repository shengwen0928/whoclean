const fs = require('fs');
const path = require('path');

// 取得指定日期所在的年份與 ISO 週數 (格式: YYYY-Www)
function getYearWeekString(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// 取得指定週數的起始與結束日期文字 (星期一到星期五，排除六日)
function getWeekRangeText(weekStr) {
    const [year, week] = weekStr.split('-W');
    const w = parseInt(week, 10);
    const simple = new Date(year, 0, 1 + (w - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4) {
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    } else {
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    }
    
    const start = new Date(ISOweekStart);
    const end = new Date(ISOweekStart);
    end.setDate(start.getDate() + 4);
    
    const format = (date) => `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
    return `${format(start)} ~ ${format(end)}`;
}

// 計算兩個週數字串之間的週數差
function getWeekDiff(weekStr1, weekStr2) {
    if (weekStr1 === weekStr2) return 0;
    
    const parseWeek = (wStr) => {
        const [year, week] = wStr.split('-W');
        return { y: parseInt(year, 10), w: parseInt(week, 10) };
    };
    
    const w1 = parseWeek(weekStr1);
    const w2 = parseWeek(weekStr2);
    
    const getMondayOfISOWeek = (y, w) => {
        const simple = new Date(y, 0, 1 + (w - 1) * 7);
        const dow = simple.getDay();
        const ISOweekStart = new Date(simple);
        if (dow <= 4) {
            ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
        } else {
            ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
        }
        return ISOweekStart;
    };
    
    const d1 = getMondayOfISOWeek(w1.y, w1.w);
    const d2 = getMondayOfISOWeek(w2.y, w2.w);
    
    const diffTime = d2.getTime() - d1.getTime();
    return Math.round(diffTime / (7 * 24 * 60 * 60 * 1000));
}

async function run() {
    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) {
        console.error("找不到 config.json 檔案！");
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const members = config.members || [];
    const anchor = config.anchor;
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL || config.webhookUrl;

    if (!webhookUrl) {
        console.error("未設定 TEAMS_WEBHOOK_URL 環境變數，且 config.json 中的 webhookUrl 為空！");
        process.exit(1);
    }

    if (members.length === 0) {
        console.log("成員清單為空，不需要發送通知。");
        return;
    }

    if (!anchor || !members.includes(anchor.memberName)) {
        console.error("未設定錨點 (anchor) 或錨點的成員不在列表中！");
        process.exit(1);
    }

    const today = new Date();
    const currentWeekKey = getYearWeekString(today);
    const dateRange = getWeekRangeText(currentWeekKey);

    const anchorIdx = members.indexOf(anchor.memberName);
    const diff = getWeekDiff(anchor.weekKey, currentWeekKey);
    const cleanerIdx = ((anchorIdx + diff) % members.length + members.length) % members.length;
    const cleanerName = members[cleanerIdx];

    console.log(`目前週數: ${currentWeekKey} (${dateRange})`);
    console.log(`錨點週數: ${anchor.weekKey}, 錨點成員: ${anchor.memberName}`);
    console.log(`週數差: ${diff}, 本週值日生: ${cleanerName}`);

    // 額外輸出一個靜態檔案，供 Power Automate 精準定時抓取
    const dutyInfo = {
        cleanerName,
        dateRange,
        weekKey: currentWeekKey
    };
    fs.writeFileSync(path.join(__dirname, 'current_duty.json'), JSON.stringify(dutyInfo, null, 2));
    console.log("已更新並寫入 current_duty.json");

    const adaptiveCard = {
        type: "AdaptiveCard",
        version: "1.4",
        body: [
            {
                type: "Container",
                style: "accent",
                bleed: true,
                items: [
                    {
                        type: "TextBlock",
                        text: "🧹 WhoClean 本週值日生提醒 (排程自動發送)",
                        weight: "Bolder",
                        size: "Large",
                        color: "Accent"
                    }
                ]
            },
            {
                type: "FactSet",
                spacing: "Medium",
                facts: [
                    {
                        title: "本週值日生:",
                        value: cleanerName
                    },
                    {
                        title: "值日區間:",
                        value: dateRange
                    }
                ]
            },
            {
                type: "TextBlock",
                text: "新的一週開始囉！請值日生記得撥空打掃，維護環境整潔！",
                wrap: true,
                isSubtle: true,
                spacing: "Medium"
            }
        ],
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json"
    };

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(adaptiveCard)
        });
        
        if (response.ok) {
            console.log("Teams 提醒通知自動發送成功！");
        } else {
            const errText = await response.text();
            console.error(`發送失敗，HTTP 狀態碼: ${response.status}, 回傳內容: ${errText}`);
            process.exit(1);
        }
    } catch (error) {
        console.error("發送請求時發生錯誤:", error);
        process.exit(1);
    }
}

run();
