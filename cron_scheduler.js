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

// 解析 Firestore REST API 回傳的強型別 JSON
function parseFirestoreValue(value) {
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.integerValue !== undefined) return parseInt(value.integerValue, 10);
    if (value.doubleValue !== undefined) return parseFloat(value.doubleValue);
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.arrayValue !== undefined) {
        return (value.arrayValue.values || []).map(v => parseFirestoreValue(v));
    }
    if (value.mapValue !== undefined) {
        const obj = {};
        const fields = value.mapValue.fields || {};
        for (const k in fields) {
            obj[k] = parseFirestoreValue(fields[k]);
        }
        return obj;
    }
    return null;
}

function parseFirestoreDoc(doc) {
    const data = {};
    const fields = doc.fields || {};
    for (const k in fields) {
        data[k] = parseFirestoreValue(fields[k]);
    }
    return data;
}

async function run() {
    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) {
        console.error("找不到 config.json 檔案！");
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    // 讀取成員，相容舊格式（純字串陣列）與新格式（物件含 active）
    const rawMembers = config.members || [];
    let members = rawMembers
        .map(m => typeof m === 'string' ? { name: m, active: true } : m)
        .filter(m => m.active !== false)
        .map(m => m.name);
    let anchor = config.anchor;
    let webhookUrl = process.env.TEAMS_WEBHOOK_URL || config.webhookUrl;

    // 嘗試從 Firebase 雲端讀取最新資料
    if (config.firebaseConfig && config.firebaseConfig.projectId) {
        console.log("偵測到 Firebase 設定，嘗試從雲端 Firestore 讀取最新資料...");
        const projectId = config.firebaseConfig.projectId;
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/whoclean/settings`;
        try {
            const firestoreRes = await fetch(firestoreUrl);
            if (firestoreRes.ok) {
                const docData = await firestoreRes.json();
                const cloudData = parseFirestoreDoc(docData);
                if (cloudData.members && cloudData.anchor) {
                    const cloudMembers = cloudData.members;
                    const cloudAnchor = cloudData.anchor;
                    const anchorMember = cloudMembers.find(m => m.id === cloudAnchor.memberId);
                    if (anchorMember) {
                        // 從 Firebase 同步時保留 active 狀態，過濾掉未啟用成員
                        members = cloudMembers
                            .filter(m => m.active !== false)
                            .map(m => m.name);
                        anchor = {
                            weekKey: cloudAnchor.weekKey,
                            memberName: anchorMember.name
                        };
                        console.log(`Firebase 同步完成：${members.length} 位活躍成員`);
                        if (cloudData.teamsWebhook) {
                            webhookUrl = cloudData.teamsWebhook;
                        }
                        console.log("成功從 Firebase 同步最新成員與錨點設定！");
                    }
                }
            } else {
                console.log(`無法讀取雲端資料 (HTTP ${firestoreRes.status})，降級使用本地 config.json`);
            }
        } catch (e) {
            console.error("讀取 Firebase 失敗，降級使用本地 config.json:", e);
        }
    }

    if (!webhookUrl) {
        console.error("未設定 TEAMS_WEBHOOK_URL 環境變數，且 config.json 中的 webhookUrl 為空！");
        process.exit(1);
    }

    if (members.length === 0) {
        console.log("成員清單為空，不需要發送通知。");
        return;
    }

    if (!anchor || !members.includes(anchor.memberName)) {
        if (members.length > 0) {
            // 錨點成員可能已被停用或刪除，自動使用第一個活躍成員作為新錨點
            const newAnchor = members[0];
            console.warn(`⚠️ 原錨點成員「${anchor ? anchor.memberName : '無'}」不在活躍列表中，自動重設錨點為「${newAnchor}」（本週）`);
            anchor = {
                weekKey: getYearWeekString(new Date()),
                memberName: newAnchor
            };
        } else {
            console.error("無活躍成員，無法排班！");
            process.exit(1);
        }
    }

    console.log(`活躍成員 (${members.length} 人): ${members.join(', ')}`);

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

    // 將本週排班結果回寫至 Firebase Firestore（歷史記錄 + 更新錨點）
    if (config.firebaseConfig && config.firebaseConfig.projectId) {
        try {
            const projectId = config.firebaseConfig.projectId;
            const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
            
            // 寫入歷史記錄
            const historyEntry = {
                fields: {
                    weekKey: { stringValue: currentWeekKey },
                    cleanerNames: { arrayValue: { values: [{ stringValue: cleanerName }] } },
                    updatedAt: { stringValue: new Date().toISOString() }
                }
            };
            
            // 儲存到 whoclean/history/{weekKey}
            const historyUrl = `${firestoreBase}/whoclean_history/${currentWeekKey}`;
            const historyRes = await fetch(historyUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(historyEntry)
            });
            if (historyRes.ok) {
                console.log(`📜 已記錄歷史排班至 Firebase: ${currentWeekKey} → ${cleanerName}`);
            }
            
            // 不強制更新 Firestore 錨點以免干擾 web app 的排班編輯
        } catch (e) {
            console.warn("⚠️ 寫入 Firebase 失敗（非致命）:", e.message);
        }
    }

    const adaptiveCard = {
        type: "AdaptiveCard",
        version: "1.4",
        msteams: { width: "Full" },
        body: [
            {
                type: "Container",
                style: "accent",
                bleed: true,
                items: [
                    {
                        type: "ColumnSet",
                        columns: [
                            {
                                type: "Column",
                                width: "auto",
                                verticalContentAlignment: "Center",
                                items: [
                                    { type: "TextBlock", text: "🧹", size: "ExtraLarge" }
                                ]
                            },
                            {
                                type: "Column",
                                width: "stretch",
                                verticalContentAlignment: "Center",
                                items: [
                                    {
                                        type: "TextBlock",
                                        text: "新的一週開始！本週值日生提醒",
                                        weight: "Bolder",
                                        size: "Large",
                                        color: "Accent"
                                    },
                                    {
                                        type: "TextBlock",
                                        text: "WhoClean · 每週一 08:00 自動排程通知",
                                        isSubtle: true,
                                        size: "Small",
                                        spacing: "None"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                type: "Container",
                spacing: "Medium",
                items: [
                    {
                        type: "TextBlock",
                        text: "本週值日生",
                        size: "Small",
                        isSubtle: true,
                        weight: "Bolder"
                    },
                    {
                        type: "TextBlock",
                        text: cleanerName,
                        size: "ExtraLarge",
                        weight: "Bolder",
                        color: "Accent",
                        spacing: "Small",
                        wrap: true
                    }
                ]
            },
            {
                type: "ColumnSet",
                spacing: "Medium",
                separator: true,
                columns: [
                    {
                        type: "Column",
                        width: 1,
                        items: [
                            { type: "TextBlock", text: "📅 週數", size: "Small", isSubtle: true },
                            { type: "TextBlock", text: currentWeekKey, weight: "Bolder", spacing: "None" }
                        ]
                    },
                    {
                        type: "Column",
                        width: 1,
                        items: [
                            { type: "TextBlock", text: "🗓️ 值日區間", size: "Small", isSubtle: true },
                            { type: "TextBlock", text: dateRange, weight: "Bolder", spacing: "None" }
                        ]
                    }
                ]
            },
            {
                type: "TextBlock",
                text: "請值日生記得撥空打掃，大家一起維護環境整潔！💪",
                wrap: true,
                isSubtle: true,
                spacing: "Medium",
                separator: true
            }
        ],
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json"
    };

    // Power Automate「工作流程」Webhook 需要 attachments 信封格式
    const payload = {
        type: "message",
        attachments: [
            {
                contentType: "application/vnd.microsoft.card.adaptive",
                content: adaptiveCard
            }
        ]
    };

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
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
