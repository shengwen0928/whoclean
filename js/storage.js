/**
 * 資料存取管理模組 (LocalStorage)
 */
import { getYearWeekString, getWeekRangeText, getRandomGradient, generateId } from './utils.js';

const STORAGE_KEYS = {
    MEMBERS: 'whoclean_members',
    SCHEDULE: 'whoclean_schedule',
    HISTORY: 'whoclean_history',
};

const DEFAULT_MEMBERS = [
    { id: 'm1', name: '小明', color: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)', active: true },
    { id: 'm2', name: '小華', color: 'linear-gradient(135deg, #4E65FF 0%, #92EFFD 100%)', active: true },
    { id: 'm3', name: '小美', color: 'linear-gradient(135deg, #7F00FF 0%, #E100FF 100%)', active: true },
    { id: 'm4', name: '阿強', color: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', active: true },
];

export function initStorage() {
    if (!localStorage.getItem(STORAGE_KEYS.MEMBERS)) {
        localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(DEFAULT_MEMBERS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SCHEDULE)) {
        // 預設生成本週與下週的排班
        const schedule = [];
        const today = new Date();
        const thisWeekStr = getYearWeekString(today);
        
        // 本週
        schedule.push({
            weekKey: thisWeekStr,
            dateRange: getWeekRangeText(thisWeekStr),
            cleanerIds: ['m1'], // 預設小明本週值日
            status: 'pending',
            completedAt: null
        });

        // 下週
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);
        const nextWeekStr = getYearWeekString(nextWeek);
        schedule.push({
            weekKey: nextWeekStr,
            dateRange: getWeekRangeText(nextWeekStr),
            cleanerIds: ['m2'], // 預設小華下週值日
            status: 'pending',
            completedAt: null
        });

        localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(schedule));
    }
    if (!localStorage.getItem(STORAGE_KEYS.HISTORY)) {
        // 歷史紀錄
        const history = [
            {
                id: 'h1',
                weekKey: '2026-W22',
                dateRange: '05/25 ~ 05/31',
                cleaners: [{ id: 'm3', name: '小美' }],
                completedAt: '2026-05-31T18:00:00.000Z'
            },
            {
                id: 'h2',
                weekKey: '2026-W23',
                dateRange: '06/01 ~ 06/07',
                cleaners: [{ id: 'm4', name: '阿強' }],
                completedAt: '2026-06-07T17:30:00.000Z'
            }
        ];
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
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
