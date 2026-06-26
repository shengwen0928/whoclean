/**
 * 資料存取管理模組 (LocalStorage)
 */
import { getYearWeekString, getWeekRangeText, getRandomGradient, generateId, getWeekDiff } from './utils.js';

const STORAGE_KEYS = {
    MEMBERS: 'whoclean_members',
    ROTATION_ANCHOR: 'whoclean_rotation_anchor',
    TEAMS_WEBHOOK: 'whoclean_teams_webhook',
    PERSONAL_TEAMS_WEBHOOK: 'whoclean_personal_teams_webhook',
};

let firebaseApp = null;
let db = null;
let isFirebaseEnabled = false;
let _firestoreModuleCache = null;

// 快取 Firebase 模組
async function _getFirestoreModule() {
    if (!_firestoreModuleCache) {
        _firestoreModuleCache = {
            app: await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js'),
            firestore: await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js'),
        };
    }
    return _firestoreModuleCache;
}

// 將當前 LocalStorage 的資料同步寫入 Firebase
async function syncToFirebase() {
    if (!isFirebaseEnabled || !db) return;
    try {
        const { firestore } = await _getFirestoreModule();
        const { doc, setDoc } = firestore;
        await setDoc(doc(db, "whoclean", "settings"), {
            members: getMembers(),
            anchor: getRotationAnchor(),
            teamsWebhook: getTeamsWebhookUrl(),
            personalTeamsWebhook: getPersonalTeamsWebhookUrl()
        });
        console.log("資料已成功同步到 Firebase");
    } catch (e) {
        console.error("同步到 Firebase 失敗:", e);
    }
}

export async function initStorage(config = null) {
    if (!localStorage.getItem(STORAGE_KEYS.MEMBERS)) {
        localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ROTATION_ANCHOR)) {
        localStorage.setItem(STORAGE_KEYS.ROTATION_ANCHOR, JSON.stringify(null));
    }
    if (!localStorage.getItem(STORAGE_KEYS.TEAMS_WEBHOOK)) {
        localStorage.setItem(STORAGE_KEYS.TEAMS_WEBHOOK, '');
    }
    if (!localStorage.getItem(STORAGE_KEYS.PERSONAL_TEAMS_WEBHOOK)) {
        localStorage.setItem(STORAGE_KEYS.PERSONAL_TEAMS_WEBHOOK, '');
    }

    // 使用傳入的 config 初始化 Firebase (由 app.js 統一讀取，避免重複 fetch)
    try {
        if (config) {
            if (config.firebaseConfig && config.firebaseConfig.apiKey) {
                console.log("偵測到 Firebase 設定，開始初始化...");
                const { app } = await _getFirestoreModule();
                const { firestore } = await _getFirestoreModule();
                const { initializeApp, getApp } = app;
                const { getFirestore, doc, getDoc } = firestore;

                // 若 auth.js 已初始化過 [DEFAULT] App，重複 initializeApp 會丟出 duplicate-app
                try {
                    firebaseApp = getApp();
                } catch {
                    firebaseApp = initializeApp(config.firebaseConfig);
                }
                db = getFirestore(firebaseApp);
                isFirebaseEnabled = true;

                // 從雲端抓取最新資料
                const docRef = doc(db, "whoclean", "settings");
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.members) localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(data.members));
                    if (data.anchor) localStorage.setItem(STORAGE_KEYS.ROTATION_ANCHOR, JSON.stringify(data.anchor));
                    if (data.teamsWebhook !== undefined) localStorage.setItem(STORAGE_KEYS.TEAMS_WEBHOOK, data.teamsWebhook);
                    if (data.personalTeamsWebhook !== undefined) localStorage.setItem(STORAGE_KEYS.PERSONAL_TEAMS_WEBHOOK, data.personalTeamsWebhook);
                    console.log("已從 Firebase 同步最新資料至本地");
                } else {
                    // 若雲端無資料，將本地目前資料上傳雲端進行初始備份
                    await syncToFirebase();
                }
            }
        }
    } catch (e) {
        console.error("Firebase 初始化或資料載入失敗，將降級使用 LocalStorage:", e);
    }
}

export function getTeamsWebhookUrl() {
    return localStorage.getItem(STORAGE_KEYS.TEAMS_WEBHOOK) || '';
}

export function saveTeamsWebhookUrl(url) {
    localStorage.setItem(STORAGE_KEYS.TEAMS_WEBHOOK, url.trim());
    syncToFirebase();
}

export function getPersonalTeamsWebhookUrl() {
    return localStorage.getItem(STORAGE_KEYS.PERSONAL_TEAMS_WEBHOOK) || '';
}

export function savePersonalTeamsWebhookUrl(url) {
    localStorage.setItem(STORAGE_KEYS.PERSONAL_TEAMS_WEBHOOK, url.trim());
    syncToFirebase();
}

export function getMembers() {
    let members = [];
    try {
        members = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMBERS)) || [];
    } catch {
        members = [];
    }

    // 自動啟用功能偵測
    let hasChanges = false;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    members = members.map(m => {
        if (!m.active && m.autoReactivateDate) {
            if (todayStr >= m.autoReactivateDate) {
                m.active = true;
                delete m.autoReactivateDate;
                hasChanges = true;
            }
        }
        return m;
    });

    if (hasChanges) {
        localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(members));
        setTimeout(() => syncToFirebase(), 0);
    }

    return members;
}

export function saveMembers(members) {
    localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(members));
    syncToFirebase();
}

export function addMember(name, email = '') {
    const members = getMembers();
    const newMember = {
        id: generateId(),
        name,
        email: email.trim(),
        color: getRandomGradient(),
        active: true
    };
    members.push(newMember);
    saveMembers(members);
    return newMember;
}

export function removeMember(id) {
    let members = getMembers();
    members = members.filter(m => m.id !== id);
    saveMembers(members);
}

export function getRotationAnchor() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.ROTATION_ANCHOR)) || null;
}

export function saveRotationAnchor(anchor) {
    localStorage.setItem(STORAGE_KEYS.ROTATION_ANCHOR, JSON.stringify(anchor));
    syncToFirebase();
}

// 動態排班計算：依據成員順序與週數偏移量，永遠輪流
export function getSchedule() {
    const allMembers = getMembers();
    const members = allMembers.filter(m => m.active !== false);
    if (members.length === 0) return [];

    let anchor = getRotationAnchor();
    const today = new Date();
    const thisWeekKey = getYearWeekString(today);
    
    // 若無錨點或錨點的成員已被刪除，則以本週排第一個成員為新錨點
    if (!anchor || !members.some(m => m.id === anchor.memberId)) {
        anchor = {
            weekKey: thisWeekKey,
            memberId: members[0].id
        };
        saveRotationAnchor(anchor);
    }

    const anchorIdx = members.findIndex(m => m.id === anchor.memberId);
    
    // 動態產生從本週開始，長度等於成員人數的週數排班 (過去的時間不顯示，只顯示與人數相同的週數)
    const schedule = [];
    for (let i = 0; i < members.length; i++) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + (i * 7));
        const weekKey = getYearWeekString(targetDate);
        
        // 計算與錨點週的差值
        const diff = getWeekDiff(anchor.weekKey, weekKey);
        
        // 算出循環對應的成員索引
        const cleanerIdx = ((anchorIdx + diff) % members.length + members.length) % members.length;
        const cleaner = members[cleanerIdx];
        
        schedule.push({
            weekKey,
            dateRange: getWeekRangeText(weekKey),
            cleanerIds: cleaner ? [cleaner.id] : []
        });
    }
    return schedule;
}

export function updateWeekCleaner(weekKey, cleanerIds) {
    if (cleanerIds.length > 0) {
        // 設定新的輪替錨點
        saveRotationAnchor({
            weekKey,
            memberId: cleanerIds[0]
        });
        
        // 記錄到歷史
        const allMembers = getMembers();
        const cleanerNames = cleanerIds
            .map(id => allMembers.find(m => m.id === id)?.name)
            .filter(Boolean);
        saveWeekHistory(weekKey, cleanerNames);
    }
}

// 儲存週次歷史紀錄
export function saveWeekHistory(weekKey, cleanerNames) {
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem('whoclean_history')) || [];
    } catch { history = []; }
    
    const existing = history.findIndex(h => h.weekKey === weekKey);
    const entry = { weekKey, cleanerNames, updatedAt: new Date().toISOString() };
    
    if (existing >= 0) {
        history[existing] = entry;
    } else {
        history.push(entry);
    }
    
    localStorage.setItem('whoclean_history', JSON.stringify(history));
}
