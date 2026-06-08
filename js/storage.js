/**
 * 資料存取管理模組 (LocalStorage)
 */
import { getYearWeekString, getWeekRangeText, getRandomGradient, generateId } from './utils.js';

const STORAGE_KEYS = {
    MEMBERS: 'whoclean_members',
    SCHEDULE: 'whoclean_schedule',
    HISTORY: 'whoclean_history',
};

const DEFAULT_MEMBERS = [];

export function initStorage() {
    if (!localStorage.getItem(STORAGE_KEYS.MEMBERS)) {
        localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SCHEDULE)) {
        localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.HISTORY)) {
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify([]));
    }
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

export function getSchedule() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SCHEDULE)) || [];
}

export function saveSchedule(schedule) {
    localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(schedule));
}

export function updateWeekCleaner(weekKey, cleanerIds) {
    const schedule = getSchedule();
    const index = schedule.findIndex(s => s.weekKey === weekKey);
    if (index !== -1) {
        schedule[index].cleanerIds = cleanerIds;
    } else {
        schedule.push({
            weekKey,
            dateRange: getWeekRangeText(weekKey),
            cleanerIds,
            status: 'pending',
            completedAt: null
        });
    }
    saveSchedule(schedule);
}

export function completeDuty(weekKey) {
    const schedule = getSchedule();
    const index = schedule.findIndex(s => s.weekKey === weekKey);
    if (index !== -1 && schedule[index].status !== 'completed') {
        schedule[index].status = 'completed';
        schedule[index].completedAt = new Date().toISOString();
        saveSchedule(schedule);

        // 新增至歷史紀錄
        const members = getMembers();
        const cleaners = schedule[index].cleanerIds.map(cid => {
            const m = members.find(member => member.id === cid);
            return m ? { id: m.id, name: m.name } : { id: cid, name: '未知成員' };
        });

        const history = getHistory();
        history.unshift({
            id: generateId(),
            weekKey,
            dateRange: schedule[index].dateRange,
            cleaners,
            completedAt: schedule[index].completedAt
        });
        saveHistory(history);
        return true;
    }
    return false;
}

export function getHistory() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY)) || [];
}

export function saveHistory(history) {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
}
