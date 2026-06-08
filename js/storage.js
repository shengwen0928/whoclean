/**
 * 資料存取管理模組 (LocalStorage)
 */
import { getYearWeekString, getWeekRangeText, getRandomGradient, generateId, getWeekDiff } from './utils.js';

const STORAGE_KEYS = {
    MEMBERS: 'whoclean_members',
    ROTATION_ANCHOR: 'whoclean_rotation_anchor',
    TEAMS_WEBHOOK: 'whoclean_teams_webhook',
};

export function initStorage() {
    if (!localStorage.getItem(STORAGE_KEYS.MEMBERS)) {
        localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ROTATION_ANCHOR)) {
        localStorage.setItem(STORAGE_KEYS.ROTATION_ANCHOR, JSON.stringify(null));
    }
    if (!localStorage.getItem(STORAGE_KEYS.TEAMS_WEBHOOK)) {
        localStorage.setItem(STORAGE_KEYS.TEAMS_WEBHOOK, '');
    }
}

export function getTeamsWebhookUrl() {
    return localStorage.getItem(STORAGE_KEYS.TEAMS_WEBHOOK) || '';
}

export function saveTeamsWebhookUrl(url) {
    localStorage.setItem(STORAGE_KEYS.TEAMS_WEBHOOK, url.trim());
}

export function getMembers() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMBERS)) || [];
}

export function saveMembers(members) {
    localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(members));
}

export function addMember(name) {
    const members = getMembers();
    const newMember = {
        id: generateId(),
        name,
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

export function moveMemberUp(id) {
    const members = getMembers();
    const idx = members.findIndex(m => m.id === id);
    if (idx > 0) {
        const temp = members[idx];
        members[idx] = members[idx - 1];
        members[idx - 1] = temp;
        saveMembers(members);
        return true;
    }
    return false;
}

export function moveMemberDown(id) {
    const members = getMembers();
    const idx = members.findIndex(m => m.id === id);
    if (idx !== -1 && idx < members.length - 1) {
        const temp = members[idx];
        members[idx] = members[idx + 1];
        members[idx + 1] = temp;
        saveMembers(members);
        return true;
    }
    return false;
}

export function getRotationAnchor() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.ROTATION_ANCHOR)) || null;
}

export function saveRotationAnchor(anchor) {
    localStorage.setItem(STORAGE_KEYS.ROTATION_ANCHOR, JSON.stringify(anchor));
}

// 動態排班計算：依據成員順序與週數偏移量，永遠輪流
export function getSchedule() {
    const members = getMembers();
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
    
    // 動態產生前 2 週到後 5 週，共 8 週的自動排班
    const schedule = [];
    for (let i = -2; i <= 5; i++) {
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
    }
}

export function saveHistory(history) {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
}
