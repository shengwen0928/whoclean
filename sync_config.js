/**
 * WhoClean 設定同步工具
 * 
 * 用法: node sync_config.js
 * 
 * 從 Firebase Firestore 讀取最新資料（成員、錨點、Webhook），
 * 更新本地 config.json，讓 GitHub 儲存庫中的設定保持最新。
 * 
 * 建議在執行 cron_scheduler.js 之前先執行本腳本。
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');

// 讀取 config.json
function readConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        console.error('❌ 找不到 config.json');
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// 寫回 config.json
function writeConfig(config) {
    config.updatedAt = new Date().toISOString();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
    console.log('✅ config.json 已更新');
}

// 從舊格式純字串陣列轉為新格式物件陣列
function normalizeMembers(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(m => {
        if (typeof m === 'string') {
            return { name: m, active: true };
        }
        return {
            name: m.name || '未知',
            active: m.active !== false
        };
    });
}

// 解析 Firestore REST API 回傳的強型別 JSON
function parseFirestoreValue(value) {
    if (!value) return null;
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

// 將 Firebase 的成員物件轉為 config.json 格式
function convertMembersForConfig(cloudMembers) {
    if (!Array.isArray(cloudMembers)) return [];
    return cloudMembers.map(m => ({
        name: m.name || '未知',
        active: m.active !== false
    }));
}

async function run() {
    console.log('🧹 WhoClean 設定同步工具');
    console.log('='.repeat(40));

    const config = readConfig();
    console.log(`📄 目前 config.json 版本: ${config.version || '未知'}`);

    // 檢查是否有 Firebase 設定
    if (!config.firebaseConfig || !config.firebaseConfig.projectId) {
        console.log('⚠️  未設定 Firebase，無法同步。請先在 config.json 中加入 firebaseConfig。');
        return;
    }

    const projectId = config.firebaseConfig.projectId;
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/whoclean/settings`;

    console.log(`☁️  正在從 Firebase (${projectId}) 讀取資料...`);

    try {
        const res = await fetch(firestoreUrl);
        if (!res.ok) {
            console.log(`⚠️  無法讀取雲端資料 (HTTP ${res.status})，config.json 維持不變。`);
            return;
        }

        const docData = await res.json();
        const cloudData = parseFirestoreDoc(docData);

        let hasChanges = false;

        // 同步成員清單
        if (cloudData.members && Array.isArray(cloudData.members) && cloudData.members.length > 0) {
            const newMembers = convertMembersForConfig(cloudData.members);
            const oldMembers = normalizeMembers(config.members);

            // 比較是否有差異
            const oldStr = JSON.stringify(oldMembers);
            const newStr = JSON.stringify(newMembers);
            if (oldStr !== newStr) {
                console.log(`👥 成員有變更: ${oldMembers.length} → ${newMembers.length} 人`);
                config.members = newMembers;
                hasChanges = true;
            } else {
                console.log(`👥 成員無變更 (${newMembers.length} 人)`);
            }
        }

        // 同步錨點
        if (cloudData.anchor) {
            const cloudAnchor = cloudData.anchor;
            const activeMembers = (cloudData.members || []).filter(m => m.active !== false);
            const anchorMember = activeMembers.find(m => m.id === cloudAnchor.memberId);

            if (anchorMember) {
                const newAnchor = {
                    weekKey: cloudAnchor.weekKey,
                    memberName: anchorMember.name
                };
                const oldAnchor = config.anchor;
                if (JSON.stringify(oldAnchor) !== JSON.stringify(newAnchor)) {
                    console.log(`📍 錨點已更新: ${newAnchor.memberName} @ ${newAnchor.weekKey}`);
                    config.anchor = newAnchor;
                    hasChanges = true;
                } else {
                    console.log(`📍 錨點無變更`);
                }
            }
        }

        // 同步 Teams Webhook
        if (cloudData.teamsWebhook) {
            if (config.webhookUrl !== cloudData.teamsWebhook) {
                console.log('🔗 Webhook URL 已更新');
                config.webhookUrl = cloudData.teamsWebhook;
                hasChanges = true;
            }
        }

        if (hasChanges) {
            config.version = '3.0';
            writeConfig(config);
            console.log('✅ 同步完成！config.json 已更新為 Firebase 最新資料。');
        } else {
            console.log('✅ 同步完成！config.json 已是最新，無需變更。');
        }

    } catch (e) {
        console.error('❌ 同步失敗:', e.message);
        process.exit(1);
    }
}

run();
