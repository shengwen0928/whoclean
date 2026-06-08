import { getMembers, getSchedule, addMember, removeMember, updateWeekCleaner, moveMemberUp, moveMemberDown } from './storage.js';
import { getYearWeekString, getWeekRangeText } from './utils.js';

// DOM 元素快取
const elements = {
    heroAvatar: document.getElementById('hero-avatar'),
    heroCleaners: document.getElementById('hero-cleaners-container'),
    heroWeek: document.getElementById('hero-week-str'),
    heroDate: document.getElementById('hero-date-range'),
    btnEditCurrent: document.getElementById('btn-edit-current'),
    
    scheduleContainer: document.getElementById('schedule-container'),
    
    membersContainer: document.getElementById('members-container'),
    memberCountBadge: document.getElementById('member-count-badge'),
    addMemberForm: document.getElementById('add-member-form'),
    newMemberName: document.getElementById('new-member-name'),
    
    // 彈出視窗
    editModal: document.getElementById('edit-schedule-modal'),
    modalTitle: document.getElementById('modal-title-text'),
    modalWeekRange: document.getElementById('modal-week-range'),
    modalCheckboxes: document.getElementById('modal-member-checkboxes'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    btnCancelModal: document.getElementById('btn-cancel-modal'),
    btnSaveModal: document.getElementById('btn-save-modal'),
};

let activeEditingWeekKey = null;

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
        elements.btnEditCurrent.innerText = '安排值日生';
        elements.btnEditCurrent.onclick = () => openEditModal(currentWeekKey);
        return;
    }

    elements.btnEditCurrent.innerHTML = `<i class="fa-solid fa-user-pen"></i> 修改人員`;
    elements.btnEditCurrent.onclick = () => openEditModal(currentWeekKey);

    // 取得所有本週值日生資料
    const activeCleaners = currentDuty.cleanerIds.map(cid => members.find(m => m.id === cid)).filter(Boolean);

    if (activeCleaners.length === 0) {
        elements.heroAvatar.innerText = '?';
        elements.heroAvatar.style.background = 'rgba(255, 255, 255, 0.05)';
        elements.heroCleaners.innerHTML = `<span class="hero-cleaner-name" style="color: var(--text-muted)">尚未指派人員</span>`;
    } else {
        // 設定大頭貼
        elements.heroAvatar.innerText = getAvatarText(activeCleaners[0].name);
        elements.heroAvatar.style.background = activeCleaners[0].color;
        
        // 渲染名字
        elements.heroCleaners.innerHTML = activeCleaners.map(ac => 
            `<span class="hero-cleaner-name" style="background: ${ac.color}; -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${ac.name}</span>`
        ).join(' <span style="color: var(--text-muted); font-size: 1.5rem; margin: 0 0.25rem;">&</span> ');
    }

    elements.heroWeek.innerHTML = `<i class="fa-regular fa-calendar"></i> ${currentDuty.weekKey}`;
    elements.heroDate.innerHTML = `<i class="fa-solid fa-clock"></i> ${currentDuty.dateRange}`;
}

// 渲染成員列表
export function renderMembers() {
    const members = getMembers();
    
    elements.memberCountBadge.innerText = `${members.length} 人`;
    elements.membersContainer.innerHTML = '';
    
    if (members.length === 0) {
        elements.membersContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">無成員，請於下方新增</div>`;
        return;
    }

    members.forEach((m, idx) => {
        const item = document.createElement('div');
        item.className = 'member-item';
        item.innerHTML = `
            <div class="member-profile">
                <div class="avatar" style="background: ${m.color}">${getAvatarText(m.name)}</div>
                <div>
                    <div class="member-name">${m.name}</div>
                    <div class="member-count">輪值順序：第 ${idx + 1} 順位</div>
                </div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                <button class="btn-icon move-up-btn" data-id="${m.id}" title="上移順序" ${idx === 0 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}>
                    <i class="fa-solid fa-chevron-up"></i>
                </button>
                <button class="btn-icon move-down-btn" data-id="${m.id}" title="下移順序" ${idx === members.length - 1 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}>
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
                <button class="btn-icon danger delete-member-btn" data-id="${m.id}" title="刪除成員">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
            </div>
        `;
        
        // 綁定上移/下移/刪除事件
        const upBtn = item.querySelector('.move-up-btn');
        const downBtn = item.querySelector('.move-down-btn');
        
        if (upBtn) {
            upBtn.addEventListener('click', () => {
                moveMemberUp(m.id);
                renderAll();
            });
        }
        if (downBtn) {
            downBtn.addEventListener('click', () => {
                moveMemberDown(m.id);
                renderAll();
            });
        }
        
        item.querySelector('.delete-member-btn').addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const memberName = m.name;
            if (confirm(`確定要刪除成員「${memberName}」嗎？`)) {
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
}

// 刷新全部 UI 面板
export function renderAll() {
    renderHero();
    renderMembers();
    renderSchedule();
}
