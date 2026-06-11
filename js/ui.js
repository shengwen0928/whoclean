import { getMembers, getSchedule, addMember, removeMember, updateWeekCleaner, moveMemberUp, moveMemberDown, getTeamsWebhookUrl, saveTeamsWebhookUrl, getPersonalTeamsWebhookUrl, savePersonalTeamsWebhookUrl, saveMembers } from './storage.js';
import { getYearWeekString, getWeekRangeText, escapeHtml } from './utils.js';
import { getMicrosoftClientId, saveMicrosoftClientId, getCurrentUser, login, logout, registerWithEmail, loginWithEmail, loginWithGoogle } from './auth.js';
import { initCustomDatePicker } from './datepicker.js';

let reactivateDatePicker = null;

// DOM 元素快取
const elements = {
    heroAvatar: document.getElementById('hero-avatar'),
    heroCleaners: document.getElementById('hero-cleaners-container'),
    heroWeek: document.getElementById('hero-week-str'),
    heroDate: document.getElementById('hero-date-range'),
    heroActionContainer: document.getElementById('hero-action-container'),
    
    scheduleContainer: document.getElementById('schedule-container'),
    
    membersContainer: document.getElementById('members-container'),
    memberCountBadge: document.getElementById('member-count-badge'),
    addMemberForm: document.getElementById('add-member-form'),
    newMemberName: document.getElementById('new-member-name'),
    newMemberEmail: document.getElementById('new-member-email'),
    
    // 彈出視窗 (排班編輯)
    editModal: document.getElementById('edit-schedule-modal'),
    modalTitle: document.getElementById('modal-title-text'),
    modalWeekRange: document.getElementById('modal-week-range'),
    modalCheckboxes: document.getElementById('modal-member-checkboxes'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    btnCancelModal: document.getElementById('btn-cancel-modal'),
    btnSaveModal: document.getElementById('btn-save-modal'),

    // Microsoft 登入與設定相關
    authStatusContainer: document.getElementById('auth-status-container'),
    btnMsSettings: document.getElementById('btn-ms-settings'),
    msSettingsModal: document.getElementById('ms-settings-modal'),
    msClientIdInput: document.getElementById('ms-client-id-input'),
    teamsWebhookInput: document.getElementById('teams-webhook-input'),
    personalTeamsWebhookInput: document.getElementById('personal-teams-webhook-input'),
    btnCloseMsModal: document.getElementById('btn-close-ms-modal'),
    btnCancelMsModal: document.getElementById('btn-cancel-ms-modal'),
    btnSaveMsSettings: document.getElementById('btn-save-ms-settings'),
    
    // Firebase Auth Modal Elements
    authModal: document.getElementById('firebase-login-modal'),
    authModalTitle: document.getElementById('auth-modal-title'),
    btnCloseAuthModal: document.getElementById('btn-close-auth-modal'),
    btnCancelAuthModal: document.getElementById('btn-cancel-auth-modal'),
    emailSection: document.getElementById('auth-email-section'),
    emailForm: document.getElementById('email-auth-form'),
    regNameField: document.getElementById('reg-name-field'),
    authDisplayName: document.getElementById('auth-display-name'),
    authEmail: document.getElementById('auth-email'),
    authPassword: document.getElementById('auth-password'),
    btnEmailSubmit: document.getElementById('btn-email-submit'),
    authToggleMsg: document.getElementById('auth-toggle-msg'),
    linkToggleRegister: document.getElementById('link-toggle-register'),
    btnGoogleLogin: document.getElementById('btn-google-login'),
    
    // Edit Member Modal Elements
    editMemberModal: document.getElementById('edit-member-modal'),
    btnCloseEditMemberModal: document.getElementById('btn-close-edit-member-modal'),
    btnCancelEditMemberModal: document.getElementById('btn-cancel-edit-member-modal'),
    editMemberName: document.getElementById('edit-member-name'),
    editMemberEmail: document.getElementById('edit-member-email'),
    btnSaveEditMember: document.getElementById('btn-save-edit-member'),
    editMemberActive: document.getElementById('edit-member-active'),

    // 頭像編輯相關
    editMemberAvatarPreview: document.getElementById('edit-member-avatar-preview'),
    editMemberAvatarInput: document.getElementById('edit-member-avatar-input'),
    btnUploadAvatar: document.getElementById('btn-upload-avatar'),
    btnRemoveAvatar: document.getElementById('btn-remove-avatar'),
};

let activeEditingWeekKey = null;
let draggedMemberId = null;
let activeEditingMemberId = null;
// 編輯成員視窗中的頭像變更狀態：undefined = 未變更, null = 移除, string = 新圖片 dataURL
let pendingAvatarImage = undefined;

// 取得頭像文字 (姓名第一個字)
function getAvatarText(name) {
    return name ? Array.from(name)[0] : '?';
}

// 產生頭像 HTML：有自訂圖片用圖片，否則用顏色 + 姓名第一個字
function avatarHtml(member, extraClass = '') {
    if (member && member.avatarImage) {
        return `<div class="avatar ${extraClass} has-img" style="background-image: url('${member.avatarImage}')" title="${escapeHtml(member.name)}">${escapeHtml(getAvatarText(member.name))}</div>`;
    }
    const bg = member ? member.color : '#C3C8D8';
    const text = member ? getAvatarText(member.name) : '?';
    return `<div class="avatar ${extraClass}" style="background: ${bg}" title="${member ? escapeHtml(member.name) : ''}">${escapeHtml(text)}</div>`;
}

// 將頭像套用至既有元素 (Hero 大頭貼)
function applyAvatarToElement(el, member) {
    if (member && member.avatarImage) {
        el.innerText = '';
        el.classList.add('has-img');
        el.style.background = `url('${member.avatarImage}') center / cover no-repeat`;
    } else {
        el.classList.remove('has-img');
        el.style.background = member ? member.color : '#C3C8D8';
        el.innerText = member ? getAvatarText(member.name) : '?';
    }
}

/**
 * 將使用者選擇的圖片置中裁切並壓縮為正方形 dataURL
 * @param {File} file - 圖片檔案
 * @param {number} size - 輸出尺寸 (px)
 * @returns {Promise<string>} JPEG dataURL
 */
function resizeImageToDataUrl(file, size = 128) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                const s = Math.min(img.width, img.height);
                ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            } catch (e) {
                reject(e);
            } finally {
                URL.revokeObjectURL(objectUrl);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('圖片載入失敗'));
        };
        img.src = objectUrl;
    });
}

/**
 * Toast 通知 — 取代干擾性的 alert()
 * @param {string} message - 訊息文字
 * @param {'success'|'error'|'info'|'warning'} type - 通知類型
 * @param {number} duration - 顯示毫秒數
 */
export function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        success: 'fa-solid fa-circle-check',
        error: 'fa-solid fa-circle-xmark',
        warning: 'fa-solid fa-triangle-exclamation',
        info: 'fa-solid fa-circle-info',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `<i class="${icons[type] || icons.info}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('leaving');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
        // 動效被停用 (prefers-reduced-motion) 時的保險移除
        setTimeout(() => toast.remove(), 600);
    }, duration);
}

// 渲染登入狀態
export async function renderAuthStatus() {
    const user = await getCurrentUser();
    const container = elements.authStatusContainer;
    
    if (user) {
        const avatarBg = user.isFirebase
            ? 'linear-gradient(135deg, #f5820d 0%, #e65100 100%)'
            : 'linear-gradient(135deg, #0072ff 0%, #00c6ff 100%)';
        const displaySubText = user.email || user.phoneNumber || '';
        container.innerHTML = `
            <div class="user-chip">
                <div class="avatar sm" style="background: ${avatarBg};">${escapeHtml(getAvatarText(user.name))}</div>
                <div class="user-chip-info">
                    <div class="user-chip-name">${escapeHtml(user.name)}</div>
                    <div class="user-chip-sub">${escapeHtml(displaySubText)}</div>
                </div>
                <button class="btn-logout" id="btn-ms-logout" title="登出" aria-label="登出">
                    <i class="fa-solid fa-right-from-bracket"></i>
                </button>
            </div>
        `;

        document.getElementById('btn-ms-logout').addEventListener('click', async () => {
            await logout();
            renderAll();
        });
    } else {
        container.innerHTML = `
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-primary btn-sm" id="btn-firebase-login">
                    <i class="fa-solid fa-user-shield"></i> 登入 / 註冊
                </button>
                <button class="btn btn-secondary btn-sm" id="btn-ms-login" title="Microsoft 登入" aria-label="Microsoft 登入">
                    <i class="fa-brands fa-microsoft"></i>
                </button>
            </div>
        `;
        
        document.getElementById('btn-firebase-login').addEventListener('click', openAuthModal);
        document.getElementById('btn-ms-login').addEventListener('click', async () => {
            const res = await login();
            if (res.needConfig) {
                openMsSettingsModal();
            } else if (res.success) {
                renderAll();
            }
        });
    }
}

export function openAuthModal() {
    elements.authModal.classList.add('active');
}

export function closeAuthModal() {
    elements.authModal.classList.remove('active');
}

export function openEditMemberModal(memberId) {
    activeEditingMemberId = memberId;
    const members = getMembers();
    const member = members.find(m => m.id === memberId);
    if (member) {
        elements.editMemberName.value = member.name;
        elements.editMemberEmail.value = member.email || '';
        
        const isActive = member.active !== false;
        elements.editMemberActive.checked = isActive;

        // 自動啟用日期顯示
        const autoReactivateRow = document.getElementById('auto-reactivate-row');
        if (autoReactivateRow) {
            if (!isActive) {
                autoReactivateRow.style.display = 'block';
                if (reactivateDatePicker) {
                    reactivateDatePicker.setValue(member.autoReactivateDate || '');
                }
            } else {
                autoReactivateRow.style.display = 'none';
                if (reactivateDatePicker) {
                    reactivateDatePicker.setValue('');
                }
            }
        }

        // 頭像預覽：重設變更狀態並顯示現有頭像
        pendingAvatarImage = undefined;
        elements.editMemberAvatarInput.value = '';
        applyAvatarToElement(elements.editMemberAvatarPreview, member);

        elements.editMemberModal.classList.add('active');
    }
}

export function closeEditMemberModal() {
    elements.editMemberModal.classList.remove('active');
    activeEditingMemberId = null;
    pendingAvatarImage = undefined;

    // 重設日期選擇欄位與日曆
    const autoReactivateRow = document.getElementById('auto-reactivate-row');
    if (autoReactivateRow) autoReactivateRow.style.display = 'none';
    if (reactivateDatePicker) {
        reactivateDatePicker.setValue('');
        reactivateDatePicker.close();
    }
}

// 更新瀏覽器通知狀態顯示
export function updateNotificationStatus() {
    const statusEl = document.getElementById('browser-notification-status');
    const btnEl = document.getElementById('btn-request-notification');
    if (!statusEl || !btnEl) return;

    if (!('Notification' in window)) {
        statusEl.innerText = '您的瀏覽器不支援桌面通知';
        btnEl.style.display = 'none';
        return;
    }

    if (Notification.permission === 'granted') {
        statusEl.innerText = '✅ 已授權（可接收通知）';
        btnEl.innerText = '測試通知';
    } else if (Notification.permission === 'denied') {
        statusEl.innerText = '❌ 已拒絕（請至瀏覽器設定開啟）';
        btnEl.innerText = '重新嘗試';
    } else {
        statusEl.innerText = '⚠️ 尚未授權（點選啟用）';
        btnEl.innerText = '啟用通知';
    }
}

export function openMsSettingsModal() {
    elements.msClientIdInput.value = getMicrosoftClientId();
    elements.teamsWebhookInput.value = getTeamsWebhookUrl();
    elements.personalTeamsWebhookInput.value = getPersonalTeamsWebhookUrl();
    elements.msSettingsModal.classList.add('active');
    updateNotificationStatus();
}

export function closeMsSettingsModal() {
    elements.msSettingsModal.classList.remove('active');
}

// 渲染本週五日方塊 (週一 ~ 週五)
function renderWeekProgress() {
    const container = document.getElementById('hero-progress');
    if (!container) return;

    const now = new Date();
    const dayIdx = (now.getDay() + 6) % 7; // 週一=0 ... 週日=6
    const labels = ['週一', '週二', '週三', '週四', '週五'];

    const blocks = labels.map((label, i) => {
        let cls = 'day-block';
        let tag = '';
        if (i < dayIdx) cls += ' done';
        if (i === dayIdx) { cls += ' today'; tag = '<em>今天</em>'; }
        return `<div class="${cls}"><span>${label}</span>${tag}</div>`;
    }).join('');

    const weekendNote = dayIdx > 4 ? '<div class="day-blocks-note">本週打掃結束，週末愉快！🎉</div>' : '';

    container.innerHTML = `<div class="day-blocks">${blocks}</div>${weekendNote}`;
}

// 渲染本週主卡片
export function renderHero() {
    renderWeekProgress();
    const today = new Date();
    const currentWeekKey = getYearWeekString(today);
    const schedule = getSchedule();
    const members = getMembers();
    
    let currentDuty = schedule.find(s => s.weekKey === currentWeekKey);
    
    // 若本週沒有排班，點擊快速生成
    if (!currentDuty) {
        applyAvatarToElement(elements.heroAvatar, null);
        elements.heroCleaners.innerHTML = `<span class="hero-cleaner-name" style="color: var(--text-muted)">本週尚未安排值日生</span>`;
        elements.heroWeek.innerHTML = `<i class="fa-regular fa-calendar"></i> ${currentWeekKey}`;
        elements.heroDate.innerHTML = `<i class="fa-solid fa-clock"></i> ${getWeekRangeText(currentWeekKey)}`;
        elements.heroActionContainer.innerHTML = `
            <button class="btn btn-primary btn-block" id="btn-edit-current">
                <i class="fa-solid fa-user-pen"></i> 安排值日生
            </button>
        `;
        document.getElementById('btn-edit-current').onclick = () => openEditModal(currentWeekKey);
        return;
    }

    // 取得所有本週值日生資料
    const activeCleaners = currentDuty.cleanerIds.map(cid => members.find(m => m.id === cid)).filter(Boolean);

    if (activeCleaners.length === 0) {
        applyAvatarToElement(elements.heroAvatar, null);
        elements.heroCleaners.innerHTML = `<span class="hero-cleaner-name" style="color: var(--text-muted)">尚未指派人員</span>`;
    } else {
        // 設定大頭貼 (支援自訂圖片)
        applyAvatarToElement(elements.heroAvatar, activeCleaners[0]);
        
        // 渲染名字 (螢光筆 highlight 效果)
        elements.heroCleaners.innerHTML = activeCleaners.map(ac =>
            `<span class="hero-cleaner-name">${escapeHtml(ac.name)}</span>`
        ).join(' <span class="hero-cleaner-sep">&amp;</span> ');
    }

    elements.heroWeek.innerHTML = `<i class="fa-regular fa-calendar"></i> ${currentDuty.weekKey}`;
    elements.heroDate.innerHTML = `<i class="fa-solid fa-clock"></i> ${currentDuty.dateRange}`;

    // 動態產生操作按鈕
    let buttonsHtml = `
        <button class="btn btn-primary" id="btn-edit-current">
            <i class="fa-solid fa-user-pen"></i> 修改人員
        </button>
        <button class="btn btn-teams" id="btn-send-teams">
            <i class="fa-solid fa-paper-plane"></i> 頻道通知
        </button>
    `;

    // 如果使用者設定了個人專屬 Webhook，就多渲染一個「提醒我自己」的按鈕
    const personalWebhook = getPersonalTeamsWebhookUrl();
    if (personalWebhook) {
        buttonsHtml += `
            <button class="btn btn-secondary" id="btn-send-personal-teams">
                <i class="fa-regular fa-bell"></i> 提醒我自己
            </button>
        `;
    }

    elements.heroActionContainer.innerHTML = buttonsHtml;

    // 綁定動態生成的按鈕事件
    document.getElementById('btn-edit-current').onclick = () => openEditModal(currentWeekKey);
    document.getElementById('btn-send-teams').onclick = sendTeamsNotification;
    if (personalWebhook) {
        document.getElementById('btn-send-personal-teams').onclick = sendPersonalTeamsNotification;
    }
}

// 渲染成員列表
export function renderMembers() {
    const members = getMembers();
    
    elements.memberCountBadge.innerText = `${members.length} 人`;
    elements.membersContainer.innerHTML = '';
    
    if (members.length === 0) {
        elements.membersContainer.innerHTML = `<div class="empty-state"><i class="fa-regular fa-face-smile"></i> 無成員，請於下方新增</div>`;
        return;
    }

    members.forEach((m, idx) => {
        const item = document.createElement('div');
        item.className = `member-item${m.active === false ? ' inactive' : ''}`;
        item.setAttribute('draggable', 'true');
        item.setAttribute('data-id', m.id);

        let emailHtml = '';
        if (m.email) {
            emailHtml = `<div class="member-email">${escapeHtml(m.email)}</div>`;
        }

        const activeStatusHtml = m.active !== false ? '' : '<span class="badge-muted" style="margin-left: 0.4rem;">(已停用)</span>';

        item.innerHTML = `
            <div class="member-profile">
                ${avatarHtml(m)}
                <div style="text-align: left;">
                    <div class="member-name">${escapeHtml(m.name)}${activeStatusHtml}</div>
                    <div class="member-count">第 ${idx + 1} 順位</div>
                    ${emailHtml}
                </div>
            </div>
            <div class="member-actions-wrapper">
                <button class="btn-icon edit-member-btn" data-id="${m.id}" title="修改成員資訊" aria-label="修改成員資訊">
                    <i class="fa-regular fa-pen-to-square"></i>
                </button>
                <button class="btn-icon danger delete-member-btn" data-id="${m.id}" title="刪除成員" aria-label="刪除成員">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
            </div>
        `;
        
        // --- 拖曳事件綁定 ---
        item.addEventListener('dragstart', (e) => {
            item.classList.add('dragging');
            elements.membersContainer.classList.add('is-dragging');
            draggedMemberId = m.id;
            e.dataTransfer.setData('text/plain', m.id);
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            elements.membersContainer.classList.remove('is-dragging');
            setTimeout(() => {
                draggedMemberId = null;
            }, 100);
            document.querySelectorAll('.member-item').forEach(el => el.classList.remove('drag-over'));
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        item.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (!item.classList.contains('dragging')) {
                item.classList.add('drag-over');
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
            
            const sourceId = draggedMemberId || e.dataTransfer.getData('text/plain');
            const targetId = m.id;
            
            if (sourceId && sourceId !== targetId) {
                const draggedIdx = members.findIndex(mem => mem.id === sourceId);
                const targetIdx = members.findIndex(mem => mem.id === targetId);
                
                if (draggedIdx !== -1 && targetIdx !== -1) {
                    const reordered = [...members];
                    const [removed] = reordered.splice(draggedIdx, 1);
                    reordered.splice(targetIdx, 0, removed);
                    
                    saveMembers(reordered);
                    renderAll();
                }
            }
        });

        // 避免內部的按鈕與連結影響拖曳抓取滑鼠行為
        const actionsWrapper = item.querySelector('.member-actions-wrapper');
        actionsWrapper.addEventListener('mouseenter', () => {
            item.setAttribute('draggable', 'false');
        });
        actionsWrapper.addEventListener('mouseleave', () => {
            item.setAttribute('draggable', 'true');
        });

        // 修改事件
        item.querySelector('.edit-member-btn').addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止氣泡事件，避免觸發拖曳相關操作
            const id = e.currentTarget.getAttribute('data-id');
            openEditMemberModal(id);
        });

        // 刪除事件
        item.querySelector('.delete-member-btn').addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止氣泡事件，避免觸發拖曳相關操作
            const id = e.currentTarget.getAttribute('data-id');
            const memberName = m.name;
            if (confirm(`確定要刪除成員「${memberName}」嗎？`)) {
                removeMember(id);
                renderAll();
                showToast(`已刪除成員「${memberName}」`, 'info');
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
        elements.scheduleContainer.innerHTML = `<div class="empty-state"><i class="fa-regular fa-calendar-xmark"></i> 無排班資料，請先新增成員</div>`;
        return;
    }

    // 依週數正序排列 (最早的時間在最上面，本週在最上方)
    const sortedSchedule = [...schedule].sort((a, b) => a.weekKey.localeCompare(b.weekKey));

    sortedSchedule.forEach(s => {
        const isCurrent = s.weekKey === currentWeekKey;
        const activeCleaners = s.cleanerIds.map(cid => members.find(m => m.id === cid)).filter(Boolean);
        
        const item = document.createElement('div');
        item.className = `schedule-item ${isCurrent ? 'current-week' : ''}`;
        
        // 頭像重疊區域
        let avatarsHtml = '';
        if (activeCleaners.length === 0) {
            avatarsHtml = `<div class="avatar md" style="background: #A39B89;">?</div>`;
        } else {
            avatarsHtml = `
                <div class="cleaners-avatars">
                    ${activeCleaners.map(ac => avatarHtml(ac, 'md')).join('')}
                </div>
            `;
        }

        item.innerHTML = `
            <div class="rota-num">W${s.weekKey.split('-W')[1] || '--'}</div>
            <div class="schedule-info">
                <div class="schedule-week">
                    ${s.weekKey} ${isCurrent ? '<span class="current-tag">本週</span>' : ''}
                </div>
                <div class="schedule-date">${s.dateRange}</div>
            </div>
            <div class="schedule-cleaners-list">
                ${avatarsHtml}
                <div class="schedule-cleaner-names">
                    ${activeCleaners.length > 0 ? escapeHtml(activeCleaners.map(ac => ac.name).join(', ')) : '<span class="text-muted">未安排</span>'}
                </div>
            </div>
            <div class="schedule-actions">
                <button class="btn btn-secondary btn-sm btn-edit-week" data-week="${s.weekKey}">
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

    // 僅顯示啟用狀態的成員；若該成員已是本週值日生，即使為非啟用也顯示出來，以便取消或檢視
    const displayMembers = members.filter(m => m.active || weekItem.cleanerIds.includes(m.id));

    if (displayMembers.length === 0) {
        elements.modalCheckboxes.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">無可用的啟用成員，請先啟用成員或新增成員！</p>`;
        elements.btnSaveModal.disabled = true;
        elements.editModal.classList.add('active');
        return;
    }

    elements.btnSaveModal.disabled = false;

    // 新增「無值日生」的單選選項
    const isNoneChecked = weekItem.cleanerIds.length === 0;
    const labelNone = document.createElement('label');
    labelNone.className = 'member-checkbox-item';
    labelNone.innerHTML = `
        <input type="radio" name="cleaner-select" value="" ${isNoneChecked ? 'checked' : ''}>
        <span class="custom-checkbox" style="border-radius: 50%;"></span>
        <div class="avatar sm" style="background: rgba(255,255,255,0.05); border: 1px dashed var(--border-strong); color: var(--text-muted); display: inline-flex; align-items: center; justify-content: center;">
            <i class="fa-solid fa-ban" style="font-size: 0.8rem;"></i>
        </div>
        <span>無值日生</span>
    `;
    elements.modalCheckboxes.appendChild(labelNone);

    displayMembers.forEach(m => {
        const isChecked = weekItem.cleanerIds.includes(m.id);
        const label = document.createElement('label');
        label.className = 'member-checkbox-item';
        const inactiveTag = m.active ? '' : ' <span style="font-size: 0.75rem; color: var(--text-danger); background: rgba(239, 83, 80, 0.1); padding: 1px 4px; border-radius: 3px;">已停用</span>';
        label.innerHTML = `
            <input type="radio" name="cleaner-select" value="${m.id}" ${isChecked ? 'checked' : ''}>
            <span class="custom-checkbox" style="border-radius: 50%;"></span>
            ${avatarHtml(m, 'sm')}
            <span>${escapeHtml(m.name)}${inactiveTag}</span>
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
    let isRegisterMode = false;

    // 關閉 Firebase Auth Modal
    elements.btnCloseAuthModal.addEventListener('click', closeAuthModal);
    elements.btnCancelAuthModal.addEventListener('click', closeAuthModal);
    elements.authModal.addEventListener('click', (e) => {
        if (e.target === elements.authModal) closeAuthModal();
    });



    // 切換 登入 / 註冊 模式
    elements.linkToggleRegister.addEventListener('click', (e) => {
        e.preventDefault();
        isRegisterMode = !isRegisterMode;
        if (isRegisterMode) {
            elements.authModalTitle.innerText = '註冊帳戶';
            elements.regNameField.style.display = 'block';
            elements.btnEmailSubmit.innerText = '註冊';
            elements.authToggleMsg.innerText = '已經有帳戶了嗎？';
            elements.linkToggleRegister.innerText = '立即登入';
        } else {
            elements.authModalTitle.innerText = '帳戶登入';
            elements.regNameField.style.display = 'none';
            elements.btnEmailSubmit.innerText = '登入';
            elements.authToggleMsg.innerText = '還沒有帳號嗎？';
            elements.linkToggleRegister.innerText = '立即註冊';
        }
    });

    // Email/Password 登入與註冊表單提交
    elements.emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = elements.authEmail.value.trim();
        const password = elements.authPassword.value.trim();
        const displayName = elements.authDisplayName.value.trim();

        try {
            if (isRegisterMode) {
                await registerWithEmail(email, password, displayName);
                showToast('註冊成功！歡迎加入 WhoClean。', 'success');
            } else {
                await loginWithEmail(email, password);
                showToast('登入成功！', 'success');
            }
            closeAuthModal();
            renderAll();
        } catch (err) {
            console.error(err);
            showToast(`驗證失敗: ${err.message}`, 'error');
        }
    });

    // Google 登入
    elements.btnGoogleLogin.addEventListener('click', async () => {
        try {
            await loginWithGoogle();
            showToast('Google 登入成功！', 'success');
            closeAuthModal();
            renderAll();
        } catch (err) {
            console.error(err);
            showToast(`Google 登入失敗: ${err.message}`, 'error');
        }
    });



    // 新增成員
    elements.addMemberForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = elements.newMemberName.value.trim();
        const email = elements.newMemberEmail ? elements.newMemberEmail.value.trim() : '';
        if (name) {
            addMember(name, email);
            elements.newMemberName.value = '';
            if (elements.newMemberEmail) elements.newMemberEmail.value = '';
            renderAll();
            showToast(`已新增成員「${name}」`, 'success');
        }
    });

    // Esc 鍵關閉任何開啟中的 Modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                modal.classList.remove('active');
            });
            activeEditingWeekKey = null;
            activeEditingMemberId = null;
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
        const selectedRadio = elements.modalCheckboxes.querySelector('input[name="cleaner-select"]:checked');
        const selectedId = selectedRadio ? selectedRadio.value : '';
        const selectedIds = selectedId ? [selectedId] : [];
        
        updateWeekCleaner(activeEditingWeekKey, selectedIds);
        closeEditModal();
        renderAll();
    });

    // Microsoft 設定 Modal 事件開關
    elements.btnMsSettings.addEventListener('click', openMsSettingsModal);
    elements.btnCloseMsModal.addEventListener('click', closeMsSettingsModal);
    elements.btnCancelMsModal.addEventListener('click', closeMsSettingsModal);
    elements.msSettingsModal.addEventListener('click', (e) => {
        if (e.target === elements.msSettingsModal) closeMsSettingsModal();
    });

    // 儲存 Microsoft 設定
    elements.btnSaveMsSettings.addEventListener('click', () => {
        const clientId = elements.msClientIdInput.value;
        const webhookUrl = elements.teamsWebhookInput.value;
        const personalWebhookUrl = elements.personalTeamsWebhookInput.value;
        
        saveMicrosoftClientId(clientId);
        saveTeamsWebhookUrl(webhookUrl);
        savePersonalTeamsWebhookUrl(personalWebhookUrl);
        
        closeMsSettingsModal();
        renderAll();
        showToast('設定儲存成功！', 'success');
    });

    // 瀏覽器桌面通知啟用按鈕
    const btnReqNotification = document.getElementById('btn-request-notification');
    if (btnReqNotification) {
        btnReqNotification.addEventListener('click', async () => {
            if (!('Notification' in window)) return;
            if (Notification.permission === 'granted') {
                new Notification('🧹 WhoClean 測試通知', {
                    body: '太棒了！您已成功啟用桌面通知。',
                    icon: 'color.png'
                });
            } else {
                const permission = await Notification.requestPermission();
                updateNotificationStatus();
                if (permission === 'granted') {
                    new Notification('🧹 WhoClean 測試通知', {
                        body: '太棒了！您已成功啟用桌面通知，當您需要打掃時將會提醒您。',
                        icon: 'color.png'
                    });
                }
            }
        });
    }
    updateNotificationStatus();

    // 編輯成員 Modal 事件開關
    elements.btnCloseEditMemberModal.addEventListener('click', closeEditMemberModal);
    elements.btnCancelEditMemberModal.addEventListener('click', closeEditMemberModal);
    elements.editMemberModal.addEventListener('click', (e) => {
        if (e.target === elements.editMemberModal) closeEditMemberModal();
    });

    // 當切換啟用/停用狀態時，動態顯示/隱藏自動啟用日期欄位
    elements.editMemberActive.addEventListener('change', (e) => {
        const autoReactivateRow = document.getElementById('auto-reactivate-row');
        const reactivateDateInput = document.getElementById('edit-member-reactivate-date');
        if (autoReactivateRow) {
            if (!e.target.checked) {
                autoReactivateRow.style.display = 'block';
            } else {
                autoReactivateRow.style.display = 'none';
                if (reactivateDateInput) reactivateDateInput.value = '';
            }
        }
    });

    // 上傳自訂頭像圖片
    elements.btnUploadAvatar.addEventListener('click', () => elements.editMemberAvatarInput.click());
    elements.editMemberAvatarInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast('請選擇圖片檔案 (JPG / PNG)！', 'warning');
            return;
        }
        try {
            pendingAvatarImage = await resizeImageToDataUrl(file);
            elements.editMemberAvatarPreview.classList.add('has-img');
            elements.editMemberAvatarPreview.innerText = '';
            elements.editMemberAvatarPreview.style.background = `url('${pendingAvatarImage}') center / cover no-repeat`;
        } catch (err) {
            console.error(err);
            showToast('圖片處理失敗，請換一張試試！', 'error');
        }
    });

    // 移除自訂頭像，改回姓名第一個字
    elements.btnRemoveAvatar.addEventListener('click', () => {
        pendingAvatarImage = null;
        elements.editMemberAvatarInput.value = '';
        const member = getMembers().find(m => m.id === activeEditingMemberId);
        applyAvatarToElement(elements.editMemberAvatarPreview, member ? { ...member, avatarImage: null } : null);
    });

    // 儲存修改的成員資料
    elements.btnSaveEditMember.addEventListener('click', () => {
        if (!activeEditingMemberId) return;
        const newName = elements.editMemberName.value.trim();
        const newEmail = elements.editMemberEmail.value.trim();
        const newActive = elements.editMemberActive.checked;
        
        if (!newName) {
            showToast('姓名不能為空！', 'warning');
            return;
        }

        const members = getMembers();
        const memberIdx = members.findIndex(m => m.id === activeEditingMemberId);
        if (memberIdx !== -1) {
            members[memberIdx].name = newName;
            members[memberIdx].email = newEmail;
            members[memberIdx].active = newActive;

            // 儲存自動啟用日期
            if (reactivateDatePicker) {
                const dateVal = reactivateDatePicker.getValue();
                if (!newActive && dateVal) {
                    members[memberIdx].autoReactivateDate = dateVal;
                } else {
                    delete members[memberIdx].autoReactivateDate;
                }
            }

            // 套用頭像變更 (undefined = 未變更)
            if (pendingAvatarImage !== undefined) {
                if (pendingAvatarImage === null) {
                    delete members[memberIdx].avatarImage;
                } else {
                    members[memberIdx].avatarImage = pendingAvatarImage;
                }
            }

            saveMembers(members);
            closeEditMemberModal();
            renderAll();
            showToast('成員資料修改成功！', 'success');
        }
    });

    // 初始化自訂日期選擇器
    reactivateDatePicker = initCustomDatePicker(
        'edit-member-reactivate-date',
        'reactivate-datepicker-wrapper',
        'reactivate-calendar'
    );
}

// 取得本週值日資訊 (供通知共用)；無排班或無人員時回傳 null
function getCurrentDutyInfo() {
    const currentWeekKey = getYearWeekString(new Date());
    const schedule = getSchedule();
    const members = getMembers();

    const currentDuty = schedule.find(s => s.weekKey === currentWeekKey);
    if (!currentDuty || currentDuty.cleanerIds.length === 0) return null;

    const cleanerNames = currentDuty.cleanerIds
        .map(cid => members.find(m => m.id === cid)?.name)
        .filter(Boolean)
        .join(', ');

    return { cleanerNames, dateRange: currentDuty.dateRange, weekKey: currentWeekKey };
}

// 共用的 Teams Webhook 發送邏輯 (Adaptive Card)
async function sendDutyWebhook(webhookUrl, { title, titleColor, containerStyle, rangeLabel, footerText, successMsg, cardIcon = "🧹" }) {
    const duty = getCurrentDutyInfo();
    if (!duty) {
        showToast('本週尚未排定值日生，無法發送通知！', 'warning');
        return;
    }

    const adaptiveCard = {
        type: "AdaptiveCard",
        version: "1.2",
        msteams: { width: "Full" },
        body: [
            {
                type: "Container",
                style: containerStyle,
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
                                    { type: "TextBlock", text: cardIcon, size: "ExtraLarge" }
                                ]
                            },
                            {
                                type: "Column",
                                width: "stretch",
                                verticalContentAlignment: "Center",
                                items: [
                                    {
                                        type: "TextBlock",
                                        text: title,
                                        weight: "Bolder",
                                        size: "Large",
                                        color: titleColor
                                    },
                                    {
                                        type: "TextBlock",
                                        text: "WhoClean · 值日生排班助手",
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
                        text: duty.cleanerNames,
                        size: "ExtraLarge",
                        weight: "Bolder",
                        color: titleColor,
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
                            { type: "TextBlock", text: duty.weekKey, weight: "Bolder", spacing: "None" }
                        ]
                    },
                    {
                        type: "Column",
                        width: 1,
                        items: [
                            { type: "TextBlock", text: `🗓️ ${rangeLabel.replace(':', '')}`, size: "Small", isSubtle: true },
                            { type: "TextBlock", text: duty.dateRange, weight: "Bolder", spacing: "None" }
                        ]
                    }
                ]
            },
            {
                type: "TextBlock",
                text: footerText,
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
        const res = await fetch(webhookUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok || res.type === 'opaque') {
            showToast(successMsg, 'success');
        } else {
            showToast(`Teams 回應異常 (HTTP ${res.status})，請確認 Webhook URL！`, 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('發送失敗，請確認 Webhook URL 是否正確！', 'error');
    }
}

// 發送 Teams 頻道提醒通知
export async function sendTeamsNotification() {
    const webhookUrl = getTeamsWebhookUrl();
    if (!webhookUrl) {
        showToast('請先在設定中設定 Microsoft Teams Webhook URL！', 'warning');
        openMsSettingsModal();
        return;
    }

    await sendDutyWebhook(webhookUrl, {
        title: "WhoClean 本週值日生提醒",
        titleColor: "Accent",
        containerStyle: "accent",
        rangeLabel: "值日區間:",
        footerText: "請值日生記得撥空打掃，大家一起維護環境整潔喔！",
        successMsg: '已發送通知至 Teams 頻道！請至頻道確認。'
    });
}

// 發送個人 Teams 提醒通知
export async function sendPersonalTeamsNotification() {
    const webhookUrl = getPersonalTeamsWebhookUrl();
    if (!webhookUrl) {
        showToast('請先在設定中設定您的個人 Teams Webhook URL！', 'warning');
        openMsSettingsModal();
        return;
    }

    await sendDutyWebhook(webhookUrl, {
        title: "WhoClean 值日生個人通知",
        titleColor: "Good",
        containerStyle: "good",
        rangeLabel: "打掃區間:",
        footerText: "這是您自己設定的個人通知，提醒您注意打掃輪值！",
        successMsg: '已發送個人提醒至您的 Teams！',
        cardIcon: "🔔"
    });
}

let weeklyNotificationChecked = false;

// 檢查當前登入者是否為本週值日生並顯示桌面通知
export async function checkAndShowWeeklyNotification() {
    if (weeklyNotificationChecked) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const user = await getCurrentUser();
    if (!user) return;

    const currentWeekKey = getYearWeekString(new Date());
    const schedule = getSchedule();
    const members = getMembers();
    const currentDuty = schedule.find(s => s.weekKey === currentWeekKey);
    if (!currentDuty) return;

    // 檢查目前登入的使用者是否為本週值日生
    const activeCleaners = currentDuty.cleanerIds.map(cid => members.find(m => m.id === cid)).filter(Boolean);
    const isCurrentUserCleaner = activeCleaners.some(c => 
        c.name === user.name || (user.email && c.email === user.email)
    );

    if (isCurrentUserCleaner) {
        const notifiedKey = `whoclean_notified_week_${currentWeekKey}`;
        if (!localStorage.getItem(notifiedKey)) {
            new Notification('🧹 WhoClean 值日生提醒', {
                body: `嗨 ${user.name}！這週輪到您當值日生囉，請記得撥空打掃！`,
                icon: 'color.png'
            });
            localStorage.setItem(notifiedKey, 'true');
        }
    }
    weeklyNotificationChecked = true;
}

// 刷新全部 UI 面板
export function renderAll() {
    renderAuthStatus();
    renderHero();
    renderMembers();
    renderSchedule();
    checkAndShowWeeklyNotification();
}
