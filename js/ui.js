/**
 * UI 渲染與 DOM 操作模組
 */
import { getMembers, getSchedule, getHistory, addMember, removeMember, updateWeekCleaner, completeDuty } from './storage.js';
import { getYearWeekString, getWeekRangeText } from './utils.js';

// DOM 元素快取
const elements = {
    heroAvatar: document.getElementById('hero-avatar'),
    heroCleaners: document.getElementById('hero-cleaners-container'),
    heroWeek: document.getElementById('hero-week-str'),
    heroDate: document.getElementById('hero-date-range'),
    heroStatusBadge: document.getElementById('hero-status-badge'),
    btnCompleteDuty: document.getElementById('btn-complete-duty'),
    btnEditCurrent: document.getElementById('btn-edit-current'),
    
    scheduleContainer: document.getElementById('schedule-container'),
    
    membersContainer: document.getElementById('members-container'),
    memberCountBadge: document.getElementById('member-count-badge'),
    addMemberForm: document.getElementById('add-member-form'),
    newMemberName: document.getElementById('new-member-name'),
    
    historyContainer: document.getElementById('history-container'),
    
    // 彈出視窗
    editModal: document.getElementById('edit-schedule-modal'),
    modalTitle: document.getElementById('modal-title-text'),
    modalWeekRange: document.getElementById('modal-week-range'),
    modalCheckboxes: document.getElementById('modal-member-checkboxes'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    btnCancelModal: document.getElementById('btn-cancel-modal'),
    btnSaveModal: document.getElementById('btn-save-modal'),
    
    // 快速排班
    btnQuickSchedule: document.getElementById('btn-quick-schedule'),
};

let activeEditingWeekKey = null;

// 計算成員打掃次數
function getCleaningCounts() {
    const history = getHistory();
    const counts = {};
    history.forEach(log => {
        log.cleaners.forEach(c => {
            counts[c.id] = (counts[c.id] || 0) + 1;
        });
    });
    return counts;
}

// 取得頭像縮寫文字
function getAvatarText(name) {
    return name ? name.substring(0, 2) : '?';
}

// 渲染本週主卡片
export function renderHero() {
    const today = new Date();
    const currentWeekKey = getYearWeekString(today);
    const schedule = getSchedule();
    const members = getMembers();
    
    let currentDuty = schedule.find(s => s.weekKey === currentWeekKey);
    
    // 若本週沒有排班，點擊快速生成
    if (!currentDuty) {
        elements.heroAvatar.innerText = '?';
        elements.heroAvatar.style.background = 'rgba(255, 255, 255, 0.05)';
        elements.heroCleaners.innerHTML = `<span class="hero-cleaner-name" style="color: var(--text-muted)">本週尚未安排值日生</span>`;
        elements.heroWeek.innerHTML = `<i class="fa-regular fa-calendar"></i> ${currentWeekKey}`;
        elements.heroDate.innerHTML = `<i class="fa-solid fa-clock"></i> ${getWeekRangeText(currentWeekKey)}`;
        elements.heroStatusBadge.className = 'badge badge-pending';
        elements.heroStatusBadge.innerHTML = `<i class="fa-solid fa-circle-question"></i> 未排班`;
        elements.btnCompleteDuty.style.display = 'none';
        elements.btnEditCurrent.innerText = '安排值日生';
        elements.btnEditCurrent.onclick = () => openEditModal(currentWeekKey);
        return;
    }

    elements.btnEditCurrent.innerHTML = `<i class="fa-solid fa-user-pen"></i> 修改人員`;
    elements.btnEditCurrent.onclick = () => openEditModal(currentWeekKey);
    elements.btnCompleteDuty.style.display = currentDuty.status === 'completed' ? 'none' : 'inline-flex';

    // 取得所有本週值日生資料
    const activeCleaners = currentDuty.cleanerIds.map(cid => members.find(m => m.id === cid)).filter(Boolean);

    if (activeCleaners.length === 0) {
        elements.heroAvatar.innerText = '?';
        elements.heroAvatar.style.background = 'rgba(255, 255, 255, 0.05)';
        elements.heroCleaners.innerHTML = `<span class="hero-cleaner-name" style="color: var(--text-muted)">尚未指派人員</span>`;
    } else {
        // 設定大頭貼（取第一個值日生做為主要代表，或若有多人則混合）
        elements.heroAvatar.innerText = getAvatarText(activeCleaners[0].name);
        elements.heroAvatar.style.background = activeCleaners[0].color;
        
        // 渲染名字
        elements.heroCleaners.innerHTML = activeCleaners.map(ac => 
            `<span class="hero-cleaner-name" style="background: ${ac.color}; -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${ac.name}</span>`
        ).join(' <span style="color: var(--text-muted); font-size: 1.5rem; margin: 0 0.25rem;">&</span> ');
    }

    elements.heroWeek.innerHTML = `<i class="fa-regular fa-calendar"></i> ${currentDuty.weekKey}`;
    elements.heroDate.innerHTML = `<i class="fa-solid fa-clock"></i> ${currentDuty.dateRange}`;

    if (currentDuty.status === 'completed') {
        elements.heroStatusBadge.className = 'badge badge-completed';
        elements.heroStatusBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> 已完成打掃`;
    } else {
        elements.heroStatusBadge.className = 'badge badge-pending';
        elements.heroStatusBadge.innerHTML = `<i class="fa-regular fa-circle-play"></i> 本週待打掃`;
    }

    elements.btnCompleteDuty.onclick = () => {
        if (confirm('確定本週打掃工作已完成了嗎？')) {
            completeDuty(currentWeekKey);
            renderAll();
        }
    };
}

// 渲染成員列表
export function renderMembers() {
    const members = getMembers();
    const counts = getCleaningCounts();
    
    elements.memberCountBadge.innerText = `${members.length} 人`;
    elements.membersContainer.innerHTML = '';
    
    if (members.length === 0) {
        elements.membersContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">無成員，請於下方新增</div>`;
        return;
    }

    members.forEach(m => {
        const count = counts[m.id] || 0;
        const item = document.createElement('div');
        item.className = 'member-item';
        item.innerHTML = `
            <div class="member-profile">
                <div class="avatar" style="background: ${m.color}">${getAvatarText(m.name)}</div>
                <div>
                    <div class="member-name">${m.name}</div>
                    <div class="member-count">累計打掃 ${count} 次</div>
                </div>
            </div>
            <button class="btn-icon danger delete-member-btn" data-id="${m.id}" title="刪除成員">
                <i class="fa-regular fa-trash-can"></i>
            </button>
        `;
        
        // 綁定刪除事件
        item.querySelector('.delete-member-btn').addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const memberName = m.name;
            if (confirm(`確定要刪除成員「${memberName}」嗎？這不會刪除歷史紀錄。`)) {
                removeMember(id);
                renderAll();
            }
        });

        elements.membersContainer.appendChild(item);
    });
}

// 渲染排班列表
export function renderSchedule() {
    const schedule = getSchedule();
    const members = getMembers();
    const today = new Date();
    const currentWeekKey = getYearWeekString(today);
    
    elements.scheduleContainer.innerHTML = '';
    
    if (schedule.length === 0) {
        elements.scheduleContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">無排班資料</div>`;
        return;
    }

    // 依週排序（未來在前）
    const sortedSchedule = [...schedule].sort((a, b) => b.weekKey.localeCompare(a.weekKey));

    sortedSchedule.forEach(s => {
        const isCurrent = s.weekKey === currentWeekKey;
        const activeCleaners = s.cleanerIds.map(cid => members.find(m => m.id === cid)).filter(Boolean);
        
        const item = document.createElement('div');
        item.className = `schedule-item ${isCurrent ? 'current-week' : ''}`;
        
        // 頭像重疊區域
        let avatarsHtml = '';
        if (activeCleaners.length === 0) {
            avatarsHtml = `<div class="avatar" style="background: rgba(255,255,255,0.05); font-size: 0.8rem;">?</div>`;
        } else {
            avatarsHtml = `
                <div class="cleaners-avatars">
                    ${activeCleaners.map(ac => `<div class="avatar" style="background: ${ac.color}; width: 32px; height: 32px; font-size: 0.8rem;" title="${ac.name}">${getAvatarText(ac.name)}</div>`).join('')}
                </div>
            `;
        }

        const statusBadgeHtml = s.status === 'completed' 
            ? `<span class="badge badge-completed"><i class="fa-solid fa-check"></i> 已完成</span>`
            : `<span class="badge badge-pending"><i class="fa-regular fa-clock"></i> 待打掃</span>`;

        item.innerHTML = `
            <div class="schedule-info">
                <div class="schedule-week">
                    ${s.weekKey} ${isCurrent ? '<span style="color: var(--accent); font-size: 0.8rem; font-weight: 800;">[本週]</span>' : ''}
                </div>
                <div class="schedule-date">${s.dateRange}</div>
            </div>
            <div class="schedule-cleaners-list">
                ${avatarsHtml}
                <div style="font-size: 0.9rem; font-weight: 500;">
                    ${activeCleaners.length > 0 ? activeCleaners.map(ac => ac.name).join(', ') : '<span style="color: var(--text-muted)">未安排</span>'}
                </div>
            </div>
            <div class="schedule-actions">
                ${statusBadgeHtml}
                <button class="btn btn-secondary btn-edit-week" data-week="${s.weekKey}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
                    <i class="fa-regular fa-pen-to-square"></i> 修改
                </button>
            </div>
        `;

        item.querySelector('.btn-edit-week').addEventListener('click', () => {
            openEditModal(s.weekKey);
        });

        elements.scheduleContainer.appendChild(item);
    });
}

// 渲染歷史紀錄
export function renderHistory() {
    const history = getHistory();
    elements.historyContainer.innerHTML = '';

    if (history.length === 0) {
        elements.historyContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">尚無歷史完成紀錄</div>`;
        return;
    }

    history.forEach(log => {
        const cleanerNames = log.cleaners.map(c => c.name).join(', ');
        const dateObj = new Date(log.completedAt);
        const formattedTime = `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;

        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div class="history-meta-info">
                <div class="history-week">${log.weekKey}</div>
                <div class="history-date">${log.dateRange}</div>
            </div>
            <div style="text-align: right;">
                <div class="history-cleaner-info">
                    <i class="fa-solid fa-broom" style="color: var(--accent)"></i>
                    <span>${cleanerNames}</span>
                </div>
                <div class="history-completed-time">
                    <i class="fa-regular fa-circle-check"></i> ${formattedTime} 完成
                </div>
            </div>
        `;
        elements.historyContainer.appendChild(item);
    });
}

// 開啟編輯值日生 Modal
export function openEditModal(weekKey) {
    activeEditingWeekKey = weekKey;
    const schedule = getSchedule();
    const members = getMembers();
    
    const weekItem = schedule.find(s => s.weekKey === weekKey) || {
        weekKey,
        dateRange: getWeekRangeText(weekKey),
        cleanerIds: []
    };

    elements.modalTitle.innerText = `編輯值日生`;
    elements.modalWeekRange.innerText = `週數: ${weekItem.weekKey} (${weekItem.dateRange})`;
    elements.modalCheckboxes.innerHTML = '';

    if (members.length === 0) {
        elements.modalCheckboxes.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">請先在右側「成員管理」中新增成員！</p>`;
        elements.btnSaveModal.disabled = true;
        elements.editModal.classList.add('active');
        return;
    }

    elements.btnSaveModal.disabled = false;
    members.forEach(m => {
        const isChecked = weekItem.cleanerIds.includes(m.id);
        const label = document.createElement('label');
        label.className = 'member-checkbox-item';
        label.innerHTML = `
            <input type="checkbox" value="${m.id}" ${isChecked ? 'checked' : ''}>
            <div class="avatar" style="background: ${m.color}; width: 28px; height: 28px; font-size: 0.75rem;">${getAvatarText(m.name)}</div>
            <span>${m.name}</span>
        `;
        elements.modalCheckboxes.appendChild(label);
    });

    elements.editModal.classList.add('active');
}

// 關閉 Modal
export function closeEditModal() {
    elements.editModal.classList.remove('active');
    activeEditingWeekKey = null;
}

// 快速自動排班演算法
// 依據歷史打掃次數最少，且不是上一週打掃的人，優先排班
export function runQuickSchedule() {
    const members = getMembers();
    if (members.length === 0) {
        alert('請先新增成員再進行排班！');
        return;
    }

    const schedule = getSchedule();
    const counts = getCleaningCounts();
    const today = new Date();
    
    // 生成接下來 4 週的排班
    for (let i = 0; i < 4; i++) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + (i * 7));
        const weekKey = getYearWeekString(targetDate);
        
        // 若該週已有排班且已指派人員，則跳過，不重複覆蓋已確定的排班
        const existing = schedule.find(s => s.weekKey === weekKey);
        if (existing && existing.cleanerIds.length > 0) {
            continue;
        }

        // 決定該週的值日生：
        // 1. 先計算此時所有成員的預計打掃次數 (累計歷史 + 這次已排班但未完成的次數)
        const currentAssignedCounts = { ...counts };
        schedule.forEach(s => {
            if (s.weekKey !== weekKey) { // 排除當前計算的這一週
                s.cleanerIds.forEach(cid => {
                    currentAssignedCounts[cid] = (currentAssignedCounts[cid] || 0) + 0.8; // 給予未完成排班較小權重
                });
            }
        });

        // 2. 取得上一週排的值日生 ID (避免連續兩週打掃)
        let prevWeekCleaners = [];
        const prevDate = new Date(targetDate);
        prevDate.setDate(targetDate.getDate() - 7);
        const prevWeekKey = getYearWeekString(prevDate);
        const prevWeekDuty = schedule.find(s => s.weekKey === prevWeekKey);
        if (prevWeekDuty) {
            prevWeekCleaners = prevWeekDuty.cleanerIds;
        }

        // 3. 排序成員
        const sortedMembers = [...members].sort((a, b) => {
            const countA = currentAssignedCounts[a.id] || 0;
            const countB = currentAssignedCounts[b.id] || 0;
            
            // 優先排次數少的
            if (countA !== countB) return countA - countB;
            
            // 其次避免排上一週剛打掃完的人
            const wasAPrev = prevWeekCleaners.includes(a.id) ? 1 : 0;
            const wasBPrev = prevWeekCleaners.includes(b.id) ? 1 : 0;
            return wasAPrev - wasBPrev;
        });

        // 選擇第一位作為該週值日生
        const selectedCleanerId = sortedMembers[0].id;
        updateWeekCleaner(weekKey, [selectedCleanerId]);
    }

    renderAll();
    alert('已成功為您自動生成未來四週的排班表！');
}

// 註冊所有 UI 事件監聽器
export function setupEventListeners() {
    // 新增成員
    elements.addMemberForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = elements.newMemberName.value.trim();
        if (name) {
            addMember(name);
            elements.newMemberName.value = '';
            renderAll();
        }
    });

    // 關閉 Modal 事件
    elements.btnCloseModal.addEventListener('click', closeEditModal);
    elements.btnCancelModal.addEventListener('click', closeEditModal);
    elements.editModal.addEventListener('click', (e) => {
        if (e.target === elements.editModal) closeEditModal();
    });

    // 儲存變更
    elements.btnSaveModal.addEventListener('click', () => {
        if (!activeEditingWeekKey) return;
        const checkboxes = elements.modalCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
        const selectedIds = Array.from(checkboxes).map(cb => cb.value);
        
        updateWeekCleaner(activeEditingWeekKey, selectedIds);
        closeEditModal();
        renderAll();
    });

    // 快速排班按鈕
    elements.btnQuickSchedule.addEventListener('click', runQuickSchedule);
}

// 刷新全部 UI 面板
export function renderAll() {
    renderHero();
    renderMembers();
    renderSchedule();
    renderHistory();
}
