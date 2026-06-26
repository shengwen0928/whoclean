import { getMembers, getSchedule, addMember, removeMember, updateWeekCleaner, getTeamsWebhookUrl, saveTeamsWebhookUrl, getPersonalTeamsWebhookUrl, savePersonalTeamsWebhookUrl, saveMembers, getRotationAnchor, saveRotationAnchor } from './storage.js';
import { getYearWeekString, getWeekRangeText, escapeHtml, getWeekStartEndDates } from './utils.js';
import { getMicrosoftClientId, saveMicrosoftClientId, getCurrentUser, login, logout, registerWithEmail, loginWithEmail, loginWithGoogle } from './auth.js';
import { initCustomDatePicker } from './datepicker.js';
import { showToast } from './toast.js';
import { playClick, playSuccess, playConfetti, playError, playNotification, playSplashComplete } from './sound.js';
// checkAndShowWeeklyNotification 在 renderAll 中動態 import 以避免循環依賴

// 全域成員顏色調色盤（所有上色功能共用）
const MEMBER_COLORS = ['#8B7CF8','#00E5FF','#FF6B9D','#FFD740','#00E676','#FF5252','#FF8A65','#40C4FF','#CE93D8','#69F0AE','#FFD54F','#4DD0E1'];

let reactivateDatePicker = null;

// DOM 元素快取
const elements = {
    heroAvatar: document.getElementById('hero-avatar'),
    heroCleaners: document.getElementById('hero-cleaners-container'),
    heroWeek: document.getElementById('hero-week-str'),
    heroDate: document.getElementById('hero-date-range'),
    
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

// 取得頭像文字 (頭像圓圈用 1 字，顯示用全名避免同姓氏混淆)
function getAvatarText(name) {
    return name ? Array.from(name)[0] : '?';
}

// 產生頭像 HTML：Emoji > 自訂圖片 > 顏色 + 姓名第一個字
function avatarHtml(member, extraClass = '') {
    if (!member) {
        return `<div class="avatar ${extraClass}" style="background: #C3C8D8">?</div>`;
    }
    // Emoji 優先
    if (member.avatarEmoji) {
        return `<div class="avatar ${extraClass}" style="background: linear-gradient(135deg, var(--accent-deep), var(--accent)); font-size: 1.2rem;" title="${escapeHtml(member.name)}">${member.avatarEmoji}</div>`;
    }
    if (member.avatarImage) {
        return `<div class="avatar ${extraClass} has-img" style="background-image: url('${member.avatarImage}')" title="${escapeHtml(member.name)}">${escapeHtml(getAvatarText(member.name))}</div>`;
    }
    const bg = member.color || '#C3C8D8';
    const text = getAvatarText(member.name);
    return `<div class="avatar ${extraClass}" style="background: ${bg}" title="${escapeHtml(member.name)}">${escapeHtml(text)}</div>`;
}

// 將頭像套用至既有元素 (Hero 大頭貼)，並移除骨架 class
function applyAvatarToElement(el, member) {
    el.classList.remove('skeleton', 'skeleton-circle');
    if (!member) {
        el.classList.remove('has-img');
        el.style.background = '#C3C8D8';
        el.innerText = '?';
        return;
    }
    // Emoji 優先
    if (member.avatarEmoji) {
        el.classList.remove('has-img');
        el.style.background = 'linear-gradient(135deg, var(--accent-deep), var(--accent))';
        el.style.fontSize = '1.8rem';
        el.innerText = member.avatarEmoji;
        return;
    }
    if (member.avatarImage) {
        el.innerText = '';
        el.classList.add('has-img');
        el.style.background = `url('${member.avatarImage}') center / cover no-repeat`;
        el.style.fontSize = '';
        return;
    }
    el.classList.remove('has-img');
    el.style.background = member.color || '#C3C8D8';
    el.style.fontSize = '';
    el.innerText = getAvatarText(member.name);
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
                openMsClientIdModal();
            } else if (res.success) {
                renderAll();
            }
        });
        
        // 在未登入時也提供一個小按鈕直接設定 Microsoft Client ID
        const msClientIdBtn = document.createElement('button');
        msClientIdBtn.className = 'btn btn-secondary btn-sm';
        msClientIdBtn.id = 'btn-open-ms-client-id';
        msClientIdBtn.title = 'Microsoft 登入設定';
        msClientIdBtn.innerHTML = '<i class="fa-brands fa-microsoft"></i>';
        msClientIdBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openMsClientIdModal();
        });
        container.querySelector('div')?.appendChild(msClientIdBtn);
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
    elements.teamsWebhookInput.value = getTeamsWebhookUrl();
    elements.personalTeamsWebhookInput.value = getPersonalTeamsWebhookUrl();
    elements.msSettingsModal.classList.add('active');
    updateNotificationStatus();
}

export function closeMsSettingsModal() {
    elements.msSettingsModal.classList.remove('active');
}

export function openMsClientIdModal() {
    elements.msClientIdInput.value = getMicrosoftClientId();
    document.getElementById('ms-client-id-modal').classList.add('active');
}

export function closeMsClientIdModal() {
    document.getElementById('ms-client-id-modal').classList.remove('active');
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
        elements.heroCleaners.innerHTML = `
            <span class="hero-cleaner-name" style="color: var(--text-muted)">本週尚未安排值日生</span>
            <button class="btn-edit-inline" id="btn-edit-inline" title="安排值日生" aria-label="安排值日生">
                <i class="fa-solid fa-pen-to-square"></i>
            </button>
        `;
        elements.heroWeek.innerHTML = `<i class="fa-regular fa-calendar"></i> ${currentWeekKey}`;
        elements.heroWeek.classList.remove('skeleton');
        elements.heroDate.innerHTML = `<i class="fa-solid fa-clock"></i> ${getWeekRangeText(currentWeekKey)}`;
        elements.heroDate.classList.remove('skeleton');
        document.getElementById('btn-edit-inline').onclick = () => openEditModal(currentWeekKey);
        return;
    }

    // 取得所有本週值日生資料
    const activeCleaners = currentDuty.cleanerIds.map(cid => members.find(m => m.id === cid)).filter(Boolean);

    let cleanersHtml = '';
    if (activeCleaners.length === 0) {
        applyAvatarToElement(elements.heroAvatar, null);
        cleanersHtml = `<span class="hero-cleaner-name" style="color: var(--text-muted)">尚未指派人員</span>`;
    } else {
        // 設定大頭貼 (支援自訂圖片)
        applyAvatarToElement(elements.heroAvatar, activeCleaners[0]);
        
        // 渲染名字 (螢光筆 highlight 效果)
        cleanersHtml = activeCleaners.map(ac =>
            `<span class="hero-cleaner-name">${escapeHtml(ac.name)}</span>`
        ).join(' <span class="hero-cleaner-sep">&amp;</span> ');
    }

    // 在名字右方加上內嵌的編輯按鈕
    elements.heroCleaners.innerHTML = cleanersHtml + `
        <button class="btn-edit-inline" id="btn-edit-inline" title="編輯值日生" aria-label="編輯值日生">
            <i class="fa-solid fa-pen-to-square"></i>
        </button>
    `;

    elements.heroWeek.innerHTML = `<i class="fa-regular fa-calendar"></i> ${currentDuty.weekKey}`;
    elements.heroWeek.classList.remove('skeleton');
    elements.heroDate.innerHTML = `<i class="fa-solid fa-clock"></i> ${currentDuty.dateRange}`;
    elements.heroDate.classList.remove('skeleton');

    // 綁定內嵌編輯按鈕事件
    document.getElementById('btn-edit-inline').onclick = () => openEditModal(currentWeekKey);
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
        item.querySelector('.delete-member-btn').addEventListener('click', async (e) => {
            e.stopPropagation(); // 阻止氣泡事件，避免觸發拖曳相關操作
            const id = e.currentTarget.getAttribute('data-id');
            const memberName = m.name;
            const confirmed = await showConfirmDialog(`確定要刪除成員「${memberName}」嗎？`, `刪除後將同時移除其在排班中的資料。`, '確定刪除');
            if (confirmed) {
                removeMember(id);
                renderAll();
                showToast(`已刪除成員「${memberName}」`, 'info');
            }
        });

        elements.membersContainer.appendChild(item);
    });
}

// 渲染排班列表（支援搜尋過濾）
export function renderSchedule() {
    const schedule = getSchedule();
    const members = getMembers();
    const today = new Date();
    const currentWeekKey = getYearWeekString(today);
    
    // 搜尋過濾
    const searchInput = document.getElementById('schedule-search-input');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    
    elements.scheduleContainer.innerHTML = '';
    
    if (schedule.length === 0) {
        elements.scheduleContainer.innerHTML = `<div class="empty-state"><i class="fa-regular fa-calendar-xmark"></i> 無排班資料，請先新增成員</div>`;
        return;
    }

    // 依週數正序排列 (最早的時間在最上面，本週在最上方)
    let sortedSchedule = [...schedule].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
    
    // 搜尋過濾
    if (searchTerm) {
        sortedSchedule = sortedSchedule.filter(s => {
            const cleaners = s.cleanerIds.map(id => members.find(m => m.id === id)).filter(Boolean);
            const names = cleaners.map(c => c.name).join(' ');
            return s.weekKey.toLowerCase().includes(searchTerm) || 
                   names.toLowerCase().includes(searchTerm);
        });
        
        if (sortedSchedule.length === 0) {
            elements.scheduleContainer.innerHTML = `<div class="empty-state"><i class="fa-regular fa-search"></i> 沒有符合「${escapeHtml(searchTerm)}」的排班</div>`;
            return;
        }
    }

    sortedSchedule.forEach(s => {
        const isCurrent = s.weekKey === currentWeekKey;
        const activeCleaners = s.cleanerIds.map(cid => members.find(m => m.id === cid)).filter(Boolean);
        
        // 整條排班列上色
        const colors = activeCleaners.map(c => {
            const colorIdx = members.findIndex(m => m.id === c.id);
            return MEMBER_COLORS[colorIdx % MEMBER_COLORS.length] || '#8B7CF8';
        });
        let rowBgStyle = '';
        if (colors.length === 1) {
            rowBgStyle = `background:${colors[0]}12; border-left: 4px solid ${colors[0]}88;`;
        } else if (colors.length === 2) {
            rowBgStyle = `background: linear-gradient(135deg, ${colors[0]}12 0%, ${colors[1]}12 100%); border-left: 4px solid ${colors[0]}88;`;
        } else {
            const stops = colors.map((c, i) => `${c}12 ${(i/(colors.length-1))*100}%`).join(', ');
            rowBgStyle = `background: linear-gradient(135deg, ${stops}); border-left: 4px solid ${colors[0]}88;`;
        }
        
        const item = document.createElement('div');
        item.className = `schedule-item ${isCurrent ? 'current-week' : ''}${activeCleaners.length > 0 ? ' has-color' : ''}`;
        item.setAttribute('style', activeCleaners.length > 0 ? rowBgStyle : '');
        
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

// 自定義確認對話框
export function showConfirmDialog(title, description, confirmText = '確定') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-modal-title');
        const msgEl = document.getElementById('confirm-modal-message');
        const okBtn = document.getElementById('btn-confirm-ok');
        const cancelBtn = document.getElementById('btn-confirm-cancel');
        const closeBtn = document.getElementById('btn-close-confirm-modal');

        if (!modal || !msgEl || !okBtn) {
            resolve(false);
            return;
        }

        titleEl.innerText = title;
        msgEl.innerText = description || '';
        okBtn.innerText = confirmText;

        const cleanup = () => {
            modal.classList.remove('active');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onOverlay);
            document.removeEventListener('keydown', onKeydown);
        };

        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };
        const onOverlay = (e) => {
            if (e.target === modal) onCancel();
        };
        const onKeydown = (e) => {
            if (e.key === 'Escape') onCancel();
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onOverlay);
        document.addEventListener('keydown', onKeydown);

        modal.classList.add('active');
        okBtn.focus();
    });
}

// ============================================================
// 紙花 (Confetti) 特效
// ============================================================
export function fireConfetti(count = 40) {
    const container = document.getElementById('confetti-container') || (() => {
        const el = document.createElement('div');
        el.className = 'confetti-container';
        el.id = 'confetti-container';
        document.body.appendChild(el);
        return el;
    })();

    const colors = ['#FF6B9D', '#8B7CF8', '#00E5FF', '#FFD740', '#00E676', '#FF5252', '#FF8A65'];
    const shapes = ['■', '●', '▲', '★', '♦'];

    for (let i = 0; i < count; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.textContent = shapes[Math.floor(Math.random() * shapes.length)];
        piece.style.left = Math.random() * 100 + '%';
        piece.style.color = colors[Math.floor(Math.random() * colors.length)];
        piece.style.fontSize = (Math.random() * 12 + 8) + 'px';
        piece.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
        piece.style.animationDelay = (Math.random() * 0.5) + 's';
        container.appendChild(piece);

        setTimeout(() => piece.remove(), 4000);
    }
}

// ============================================================
// 主題系統
// ============================================================
function applyTheme(themeName, skipSave = false) {
    if (themeName === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'default' : 'ocean');
        if (!skipSave) localStorage.setItem('whoclean_theme', 'auto');
    } else {
        document.documentElement.setAttribute('data-theme', themeName);
        if (!skipSave) localStorage.setItem('whoclean_theme', themeName);
    }
    
    // 更新主題 Modal 中 active 狀態
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.theme === themeName);
    });
}

// ============================================================
// 統計儀表板
// ============================================================
function renderStats() {
    const members = getMembers();
    const activeMembers = members.filter(m => m.active !== false);
    const schedule = getSchedule();
    
    // 取得過去所有排班記錄 (從 storage 讀取歷史)
    const history = (() => {
        try {
            return JSON.parse(localStorage.getItem('whoclean_history')) || [];
        } catch { return []; }
    })();

    const statsContainer = document.getElementById('stats-container');
    if (!statsContainer) return;

    const currentWeekKey = getYearWeekString(new Date());
    const currentDuty = schedule.find(s => s.weekKey === currentWeekKey);
    const dutyCount = currentDuty ? currentDuty.cleanerIds.length : 0;
    
    // 計算已輪總週數 (歷史 + 未來已排班的) 
    const historyWeekKeys = new Set(history.map(h => h.weekKey));
    const futureScheduled = schedule.filter(s => s.cleanerIds.length > 0 && !historyWeekKeys.has(s.weekKey)).length;
    const totalWeeks = history.length + futureScheduled;

    statsContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-card-icon">🧹</div>
            <div class="stat-card-value">${dutyCount}</div>
            <div class="stat-card-label">本週值日</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon">👥</div>
            <div class="stat-card-value">${activeMembers.length}</div>
            <div class="stat-card-label">活躍成員</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon">📊</div>
            <div class="stat-card-value">${totalWeeks}</div>
            <div class="stat-card-label">已輪週數</div>
        </div>
    `;
    
    // 個人值日統計圖表
    renderMemberChart(history);
    
    // 圓餅圖
    renderPieChart(history);
    
    // 歷史時間軸
    renderHistoryTimeline(history);
    
    // 值日預測
    renderNextPrediction();
    
    // 本週任務清單
    renderTaskList(currentWeekKey);
}

// ============================================================
// 個人值日統計水平長條圖
// ============================================================
function renderMemberChart(history = []) {
    const members = getMembers();
    const statsCard = document.getElementById('stats-card');
    if (!statsCard) return;
    
    // 移除舊的圖表區
    const oldChart = document.getElementById('member-chart-section');
    if (oldChart) oldChart.remove();
    
    if (members.length === 0 || history.length === 0) return;
    
    // 計算每位成員的值日次數
    const memberCounts = {};
    members.forEach(m => { memberCounts[m.id] = { name: m.name, count: 0, member: m }; });
    history.forEach(h => {
        if (h.cleanerNames) {
            h.cleanerNames.forEach(name => {
                const found = Object.entries(memberCounts).find(([id, data]) => data.name === name);
                if (found) found[1].count++;
            });
        }
    });
    
    const maxCount = Math.max(1, ...Object.values(memberCounts).map(d => d.count));
    
    const chartSection = document.createElement('div');
    chartSection.id = 'member-chart-section';
    chartSection.className = 'chart-section';
    
    let barsHtml = Object.entries(memberCounts)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([id, data]) => {
            const pct = (data.count / maxCount) * 100;
            return `
                <div class="chart-bar-row">
                    ${avatarHtml(data.member, 'chart-bar-avatar')}
                    <div class="chart-bar-track">
                        <div class="chart-bar-fill" style="width: ${pct}%"></div>
                    </div>
                    <div class="chart-bar-count">${data.count}</div>
                </div>
            `;
        }).join('');
    
    chartSection.innerHTML = `
        <div class="chart-title"><i class="fa-solid fa-chart-bar"></i> 個人值日次數統計</div>
        <div class="chart-bar-list">${barsHtml}</div>
    `;
    
    statsCard.querySelector('.board-card-body').appendChild(chartSection);
}

// ============================================================
// 圓餅圖 (Canvas Donut Chart)
// ============================================================
function renderPieChart(history = []) {
    const container = document.getElementById('pie-chart-container');
    if (!container) return;
    
    const members = getMembers();
    const activeMembers = members.filter(m => m.active !== false);
    if (activeMembers.length === 0 || history.length === 0) {
        container.innerHTML = '<div class="chart-title" style="margin-top: 0.8rem;"><i class="fa-solid fa-chart-pie"></i> 值日次數佔比</div><div class="empty-state" style="padding: 1rem; font-size:0.8rem;">尚無足夠資料</div>';
        return;
    }
    
    // 計算每位成員的值日次數
    const memberCounts = {};
    members.forEach(m => { memberCounts[m.id] = { name: m.name, count: 0, member: m }; });
    history.forEach(h => {
        if (h.cleanerNames) {
            h.cleanerNames.forEach(name => {
                const found = Object.entries(memberCounts).find(([id, data]) => data.name === name);
                if (found) found[1].count++;
            });
        }
    });
    
    const total = Object.values(memberCounts).reduce((sum, d) => sum + d.count, 0);
    if (total === 0) {
        container.innerHTML = '<div class="chart-title" style="margin-top: 0.8rem;"><i class="fa-solid fa-chart-pie"></i> 值日次數佔比</div><div class="empty-state" style="padding: 1rem; font-size:0.8rem;">尚無值日記錄</div>';
        return;
    }
    
    // 使用全域 MEMBER_COLORS
    const sorted = Object.entries(memberCounts).filter(([id, d]) => d.count > 0).sort((a, b) => b[1].count - a[1].count);
    
    let html = `
        <div class="chart-title" style="margin-top: 0.8rem;"><i class="fa-solid fa-chart-pie"></i> 值日次數佔比</div>
        <div class="pie-chart-wrapper">
            <canvas class="pie-chart-canvas" id="pie-canvas" width="130" height="130"></canvas>
            <div class="pie-legend">`;
    
    sorted.forEach(([id, data], i) => {
        const color = MEMBER_COLORS[i % MEMBER_COLORS.length];
        const pct = total > 0 ? Math.round((data.count / total) * 100) : 0;
        html += `<div class="pie-legend-item">
            <span class="pie-legend-dot" style="background:${color}"></span>
            <span>${escapeHtml(data.name)}</span>
            <span class="pie-legend-count">${data.count} (${pct}%)</span>
        </div>`;
    });
    
    html += `</div></div>`;
    container.innerHTML = html;
    
    // Canvas 繪圖
    const canvas = document.getElementById('pie-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const cx = 65, cy = 65, radius = 52, innerRadius = 30;
    let startAngle = -Math.PI / 2;
    
    // 外層發光陰影
    ctx.save();
    ctx.shadowColor = 'rgba(139, 124, 248, 0.15)';
    ctx.shadowBlur = 15;
    
    sorted.forEach(([id, data], i) => {
        const sliceAngle = (data.count / total) * Math.PI * 2;
        const color = MEMBER_COLORS[i % MEMBER_COLORS.length];
        
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
        ctx.arc(cx, cy, innerRadius, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        
        startAngle += sliceAngle;
    });
    
    ctx.restore();
    
    // 中心圓
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius - 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 8, 12, 0.85)';
    ctx.fill();
    
    // 中心文字
    ctx.fillStyle = '#EDEEF7';
    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total, cx, cy - 5);
    ctx.fillStyle = '#5C6072';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText('次數', cx, cy + 14);
}

// ============================================================
// 歷史時間軸 (History Timeline)
// ============================================================
function renderHistoryTimeline(history = []) {
    const container = document.getElementById('history-timeline-container');
    if (!container) return;
    
    if (history.length === 0) {
        container.innerHTML = '<div class="chart-title" style="margin-top:0.8rem;"><i class="fa-regular fa-clock"></i> 歷史排班記錄</div><div class="empty-state" style="padding:1rem;font-size:0.8rem;">尚無歷史記錄</div>';
        return;
    }
    
    const members = getMembers();
    const recent = [...history].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 15);
    
    let html = '<div class="chart-title" style="margin-top:0.8rem;"><i class="fa-regular fa-clock"></i> 歷史排班記錄</div><div class="timeline">';
    
    recent.forEach(h => {
        const date = h.updatedAt ? new Date(h.updatedAt).toLocaleDateString('zh-TW', { month:'short', day:'numeric' }) : '';
        let namesHtml = '';
        if (h.cleanerNames) {
            namesHtml = h.cleanerNames.map(n => {
                const m = members.find(m => m.name === n);
                const color = m ? m.color || '#888' : '#888';
                return `<span class="color-tag" style="background:${color}22; color:${color};">${escapeHtml(n)}</span>`;
            }).join(' ');
        }
        html += `<div class="timeline-item">
            <div class="timeline-date">${escapeHtml(h.weekKey)} ${date ? '· ' + date : ''}</div>
            <div class="timeline-content">${namesHtml || '未安排'}</div>
        </div>`;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// ============================================================
// 值日預測 (Next Duty Prediction)
// ============================================================
function renderNextPrediction() {
    const container = document.getElementById('next-duty-container');
    if (!container) return;
    
    const members = getMembers();
    const activeMembers = members.filter(m => m.active !== false);
    const schedule = getSchedule();
    const today = new Date();
    const currentWeekKey = getYearWeekString(today);
    
    // 找出本週之後的排班
    const futureItems = schedule
        .filter(s => s.weekKey > currentWeekKey && s.cleanerIds.length > 0)
        .sort((a, b) => a.weekKey.localeCompare(b.weekKey));
    
    // 如果沒有未來排班，用歷史預測
    let nextItems = futureItems;
    if (nextItems.length === 0) {
        // 從歷史中找規律
        const history = (() => { try { return JSON.parse(localStorage.getItem('whoclean_history')); } catch { return []; } })() || [];
        if (history.length > 0) {
            const latest = history.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
            if (latest && latest.cleanerNames && latest.cleanerNames.length > 0) {
                const nextMember = activeMembers.find(m => m.name === latest.cleanerNames[0]);
                if (nextMember) {
                    // 預測下一輪
                    const nextIdx = (activeMembers.indexOf(nextMember) + 1) % activeMembers.length;
                    const predicted = activeMembers[nextIdx];
                    container.innerHTML = `
                        <div class="prediction-card">
                            <div>
                                <div class="prediction-label"><i class="fa-regular fa-crystal-ball"></i> 預測下次值日</div>
                                <div class="prediction-name">${escapeHtml(predicted.name)}</div>
                            </div>
                            <div class="prediction-week">根據歷史規律推測</div>
                        </div>
                    `;
                    return;
                }
            }
        }
        container.innerHTML = '';
        return;
    }
    
    const next = nextItems[0];
    const cleaners = next.cleanerIds.map(id => members.find(m => m.id === id)).filter(Boolean);
    
    container.innerHTML = `
        <div class="prediction-card">
            <div>
                <div class="prediction-label"><i class="fa-regular fa-calendar-check"></i> 下次值日</div>
                <div class="prediction-name">${escapeHtml(cleaners.map(c => c.name).join(', '))}</div>
            </div>
            <div class="prediction-week">${next.weekKey}<br>${next.dateRange}</div>
        </div>
    `;
}

// ============================================================
// 打掃任務清單 (Task Checklist)
// ============================================================
function getTasks() {
    try { return JSON.parse(localStorage.getItem('whoclean_tasks')) || []; }
    catch { return []; }
}

function saveTasks(tasks) {
    localStorage.setItem('whoclean_tasks', JSON.stringify(tasks));
}

function renderTaskList(weekKey) {
    const container = document.getElementById('task-list-container');
    if (!container || !weekKey) return;
    
    const allTasks = getTasks();
    const weekTasks = allTasks.filter(t => t.weekKey === weekKey);
    
    let html = `<div class="task-section">
        <div class="task-header">
            <div class="task-title"><i class="fa-regular fa-list-check"></i> 本週打掃任務</div>
            <span style="font-size:0.72rem;color:var(--text-3);font-weight:500;">${weekTasks.filter(t => t.done).length}/${weekTasks.length} 完成</span>
        </div>
        <div class="task-input-row">
            <input type="text" class="form-control" id="task-input" placeholder="新增任務，例如：拖地、倒垃圾..." maxlength="50">
            <button class="btn btn-secondary btn-sm" id="btn-add-task" style="flex-shrink:0;"><i class="fa-solid fa-plus"></i> 新增</button>
        </div>`;
    
    if (weekTasks.length > 0) {
        html += `<div class="task-list" id="task-list">`;
        weekTasks.forEach(t => {
            html += `<div class="task-item${t.done ? ' done' : ''}" data-task-id="${t.id}">
                <div class="task-checkbox${t.done ? ' checked' : ''}"></div>
                <span class="task-text">${escapeHtml(t.text)}</span>
                <button class="task-delete" title="刪除任務"><i class="fa-regular fa-trash-can"></i></button>
            </div>`;
        });
        html += `</div>`;
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    // 事件綁定
    const taskInput = document.getElementById('task-input');
    const btnAdd = document.getElementById('btn-add-task');
    
    const addTask = () => {
        const text = taskInput ? taskInput.value.trim() : '';
        if (!text) return;
        const tasks = getTasks();
        tasks.push({ id: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,5), weekKey, text, done: false, createdAt: new Date().toISOString() });
        saveTasks(tasks);
        renderTaskList(weekKey);
        playClick();
    };
    
    if (btnAdd) btnAdd.addEventListener('click', addTask);
    if (taskInput) {
        taskInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addTask();
        });
    }
    
    // 勾選 / 刪除
    document.querySelectorAll('.task-checkbox').forEach(cb => {
        cb.addEventListener('click', () => {
            const item = cb.closest('.task-item');
            if (!item) return;
            const id = item.dataset.taskId;
            const tasks = getTasks();
            const task = tasks.find(t => t.id === id);
            if (task) {
                task.done = !task.done;
                saveTasks(tasks);
                renderTaskList(weekKey);
                if (task.done) showToast('✅ 任務完成！', 'success');
                playClick();
            }
        });
    });
    
    document.querySelectorAll('.task-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = btn.closest('.task-item');
            if (!item) return;
            const id = item.dataset.taskId;
            const tasks = getTasks().filter(t => t.id !== id);
            saveTasks(tasks);
            renderTaskList(weekKey);
            playClick();
        });
    });
}

// ============================================================
// 環形進度圖 — 支援載入動畫
// ============================================================
function renderCircularProgress() {
    const container = document.getElementById('circular-progress');
    if (!container) return;

    const now = new Date();
    const dayIdx = Math.max(0, Math.min(5, (now.getDay() + 6) % 7)); // 0-5, clamp
    const progress = Math.min(dayIdx / 5 * 100, 100);
    const circumference = 2 * Math.PI * 26;
    const offset = circumference - (progress / 100) * circumference;

    container.innerHTML = `
        <div class="circular-progress">
            <svg width="64" height="64" viewBox="0 0 64 64">
                <circle class="bg-circle" cx="32" cy="32" r="26"/>
                <circle class="progress-circle" id="progress-ring" cx="32" cy="32" r="26"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${circumference}"
                />
            </svg>
            <span class="progress-text">${Math.round(progress)}%</span>
        </div>
    `;

    // 動畫觸發：先渲染為完整圓環，再過渡到實際進度
    requestAnimationFrame(() => {
        const ring = document.getElementById('progress-ring');
        if (ring) {
            ring.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.34, 1.4, 0.64, 1)';
            ring.style.strokeDashoffset = offset;
        }
    });
}

// ============================================================
// 資料匯出/匯入
// ============================================================
export function exportData() {
    const data = {
        version: '2.0',
        exportedAt: new Date().toISOString(),
        members: getMembers(),
        anchor: getRotationAnchor(),
        history: (() => {
            try { return JSON.parse(localStorage.getItem('whoclean_history')) || []; }
            catch { return []; }
        })(),
        teamsWebhook: getTeamsWebhookUrl(),
        personalTeamsWebhook: getPersonalTeamsWebhookUrl(),
        tasks: (() => {
            try { return JSON.parse(localStorage.getItem('whoclean_tasks')) || []; }
            catch { return []; }
        })(),
        reminderTime: localStorage.getItem('whoclean_reminder_time') || '',
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whoclean-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📦 資料已匯出！', 'success');
}

// ============================================================
// CSV 匯出
// ============================================================
export function exportCSV() {
    const members = getMembers();
    const schedule = getSchedule();
    
    // 歷史紀錄
    const history = (() => {
        try { return JSON.parse(localStorage.getItem('whoclean_history')) || []; }
        catch { return []; }
    })();
    
    // 建立 CSV 內容
    const rows = [
        ['週數', '日期範圍', '值日生', '記錄時間'],
    ];
    
    // 加入每週排班
    schedule.forEach(s => {
        const cleaners = s.cleanerIds
            .map(id => members.find(m => m.id === id))
            .filter(Boolean)
            .map(m => m.name)
            .join('; ');
        rows.push([s.weekKey, s.dateRange, cleaners || '未安排', '']);
    });
    
    // 加入歷史紀錄
    history.forEach(h => {
        const existing = schedule.some(s => s.weekKey === h.weekKey);
        if (!existing) {
            rows.push([h.weekKey, '', (h.cleanerNames || []).join('; '), h.updatedAt || '']);
        }
    });
    
    const csvContent = rows.map(row => 
        row.map(cell => {
            if (cell == null) return '';
            const str = String(cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }).join(',')
    ).join('\n');
    
    // 加入 BOM 處理中文
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whoclean-schedule-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📊 CSV 已匯出！可用 Excel 開啟', 'success');
    playSuccess();
}

export function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.members || !data.version) {
                showToast('❌ 無效的備份檔案！', 'error');
                return;
            }
            
            if (data.members) saveMembers(data.members);
            if (data.anchor) saveRotationAnchor(data.anchor);
            if (data.history) localStorage.setItem('whoclean_history', JSON.stringify(data.history));
            if (data.teamsWebhook) saveTeamsWebhookUrl(data.teamsWebhook);
            if (data.personalTeamsWebhook) savePersonalTeamsWebhookUrl(data.personalTeamsWebhook);
            if (data.tasks) localStorage.setItem('whoclean_tasks', JSON.stringify(data.tasks));
            if (data.reminderTime) localStorage.setItem('whoclean_reminder_time', data.reminderTime);
            
            showToast('✅ 資料已成功匯入！', 'success');
            renderAll();
            fireConfetti();
        } catch (err) {
            showToast('❌ 匯入失敗: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

// ============================================================
// 快捷鍵系統
// ============================================================
export function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // 不在輸入框中觸發
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case '?':
                showToast('⌨️ ? 快捷鍵 | N: 新增成員 | E: 編輯本週 | T: Teams通知 | D: 匯出 | Esc: 關閉視窗', 'info', 5000);
                break;
            case 'n':
            case 'N':
                document.getElementById('new-member-name')?.focus();
                break;
            case 'e':
            case 'E':
                {
                    const currentWeekKey = getYearWeekString(new Date());
                    openEditModal(currentWeekKey);
                }
                break;
            case 't':
            case 'T':
                // 嘗試發送 Teams 通知
                import('./notifications.js').then(m => m.sendTeamsNotification());
                break;
            case 'd':
            case 'D':
                exportData();
                break;
        }
    });
}

// ============================================================
// 事件監聽器設定
// ============================================================
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

    // 儲存一般設定（僅 Teams Webhook + 通知，不含 Client ID）
    elements.btnSaveMsSettings.addEventListener('click', () => {
        const webhookUrl = elements.teamsWebhookInput.value;
        const personalWebhookUrl = elements.personalTeamsWebhookInput.value;
        
        saveTeamsWebhookUrl(webhookUrl);
        savePersonalTeamsWebhookUrl(personalWebhookUrl);
        
        closeMsSettingsModal();
        renderAll();
        showToast('設定儲存成功！', 'success');
    });

    // Microsoft Client ID 獨立彈窗
    const msClientIdModal = document.getElementById('ms-client-id-modal');
    
    document.getElementById('btn-close-ms-client-id-modal')?.addEventListener('click', closeMsClientIdModal);
    document.getElementById('btn-cancel-ms-client-id-modal')?.addEventListener('click', closeMsClientIdModal);
    if (msClientIdModal) {
        msClientIdModal.addEventListener('click', (e) => {
            if (e.target === msClientIdModal) closeMsClientIdModal();
        });
    }
    document.getElementById('btn-save-ms-client-id')?.addEventListener('click', () => {
        const clientId = elements.msClientIdInput.value;
        saveMicrosoftClientId(clientId);
        closeMsClientIdModal();
        renderAll();
        showToast('Microsoft Client ID 已儲存！', 'success');
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
                    // 移除頭像
                    delete members[memberIdx].avatarImage;
                    delete members[memberIdx].avatarEmoji;
                } else if (typeof pendingAvatarImage === 'string' && pendingAvatarImage.startsWith('emoji:')) {
                    // Emoji 頭像
                    const emoji = pendingAvatarImage.slice(6);
                    members[memberIdx].avatarEmoji = emoji;
                    delete members[memberIdx].avatarImage;
                } else {
                    // 自訂圖片
                    members[memberIdx].avatarImage = pendingAvatarImage;
                    delete members[memberIdx].avatarEmoji;
                }
            }

            saveMembers(members);
            closeEditMemberModal();
            renderAll();
            showToast('成員資料修改成功！', 'success');
            playSuccess();
        }
    });

    // 初始化自訂日期選擇器
    reactivateDatePicker = initCustomDatePicker(
        'edit-member-reactivate-date',
        'reactivate-datepicker-wrapper',
        'reactivate-calendar'
    );

    // ============================================================
    // Emoji 頭像選擇器
    // ============================================================
    const EMOJIS = [
        '😀','😎','🚀','🌈','🌟','🔥','💪','🎯','⚡','🦁','🐯','🦊','🐱','🐶','🐼','🐸',
        '🦄','🐧','🐦','🦋','🌺','🌸','🍀','🎨','🎵','🎸','🏀','⚽','🏆','🎮','💎','🍕',
        '🍔','🌮','🍣','🍩','🎂','🧁','☕','🍺','🎪','🎭','🎬','📸','💻','📱','🎧','⌚'
    ];

    const emojiModal = document.getElementById('emoji-picker-modal');
    const emojiGrid = document.getElementById('emoji-picker-grid');
    
    if (emojiGrid) {
        emojiGrid.innerHTML = EMOJIS.map(emoji => 
            `<div class="emoji-option" data-emoji="${emoji}">${emoji}</div>`
        ).join('');
    }

    // Emoji 選擇按鈕
    document.getElementById('btn-pick-emoji-avatar')?.addEventListener('click', () => {
        if (emojiModal) emojiModal.classList.add('active');
    });

    // 關閉 Emoji Modal
    const closeEmojiModal = () => { if (emojiModal) emojiModal.classList.remove('active'); };
    document.getElementById('btn-close-emoji-modal')?.addEventListener('click', closeEmojiModal);
    document.getElementById('btn-close-emoji-modal-footer')?.addEventListener('click', closeEmojiModal);
    if (emojiModal) {
        emojiModal.addEventListener('click', (e) => { if (e.target === emojiModal) closeEmojiModal(); });
    }

    // 選擇 Emoji
    if (emojiGrid) {
        emojiGrid.addEventListener('click', (e) => {
            const option = e.target.closest('.emoji-option');
            if (!option) return;
            const emoji = option.dataset.emoji;
            
            // 僅更新預覽 + 設定 pending 狀態，不直接儲存
            // 讓「儲存」按鈕一併處理所有變更
            pendingAvatarImage = 'emoji:' + emoji; // 特殊標記表示 emoji
            
            // 更新預覽
            elements.editMemberAvatarPreview.innerText = emoji;
            elements.editMemberAvatarPreview.classList.remove('has-img');
            elements.editMemberAvatarPreview.style.background = 'linear-gradient(135deg, var(--accent-deep), var(--accent))';
            elements.editMemberAvatarPreview.style.fontSize = '1.5rem';
            
            closeEmojiModal();
            playClick();
        });
    }

    // ============================================================
    // 密碼顯示切換
    // ============================================================
    const togglePwBtn = document.getElementById('btn-toggle-password');
    if (togglePwBtn && elements.authPassword) {
        togglePwBtn.addEventListener('click', () => {
            const isPassword = elements.authPassword.type === 'password';
            elements.authPassword.type = isPassword ? 'text' : 'password';
            togglePwBtn.innerHTML = isPassword 
                ? '<i class="fa-regular fa-eye-slash"></i>' 
                : '<i class="fa-regular fa-eye"></i>';
        });
    }

    // ============================================================
    // 全螢幕佈告欄模式
    // ============================================================
    const billboard = document.querySelector('.billboard');
    document.getElementById('qa-fullscreen')?.addEventListener('click', () => {
        if (!billboard) return;
        billboard.classList.toggle('fullscreen');
        const isFull = billboard.classList.contains('fullscreen');
        document.getElementById('qa-fullscreen').innerHTML = isFull
            ? '<i class="fa-solid fa-compress qa-fullscreen"></i><span>離開全螢幕</span>'
            : '<i class="fa-solid fa-expand qa-fullscreen"></i><span>全螢幕</span>';
        showToast(isFull ? '🔲 已進入全螢幕模式，按 Esc 離開' : '已離開全螢幕模式', 'info');
        playClick();
    });

    // Esc 離開全螢幕
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && billboard?.classList.contains('fullscreen')) {
            billboard.classList.remove('fullscreen');
            const qaFs = document.getElementById('qa-fullscreen');
            if (qaFs) qaFs.innerHTML = '<i class="fa-solid fa-expand qa-fullscreen"></i><span>全螢幕</span>';
        }
    });

    // ============================================================
    // 按鈕微音效（playClick 僅 80ms，雙重播放幾乎無感）
    // ============================================================
    document.querySelectorAll('.btn, .btn-icon, .quick-action-btn, .theme-btn').forEach(btn => {
        btn.addEventListener('click', playClick);
    });

    // ============================================================
    // 新功能事件綁定
    // ============================================================

    // 主題切換（含音效）
    const themeBtn = document.getElementById('btn-theme-picker');
    const themeModal = document.getElementById('theme-modal');
    if (themeBtn && themeModal) {
        themeBtn.addEventListener('click', () => themeModal.classList.add('active'));
        document.getElementById('btn-close-theme-modal')?.addEventListener('click', () => themeModal.classList.remove('active'));
        document.getElementById('btn-close-theme-modal-footer')?.addEventListener('click', () => themeModal.classList.remove('active'));
        document.addEventListener('click', (e) => {
            if (e.target === themeModal) themeModal.classList.remove('active');
        });

        document.querySelectorAll('.theme-option').forEach(opt => {
            opt.addEventListener('click', () => {
                applyTheme(opt.dataset.theme);
                themeModal.classList.remove('active');
                showToast(`🎨 主題已切換為 ${opt.querySelector('.theme-option-name').textContent}`);
                fireConfetti(20);
                playConfetti();
            });
        });
    }

    // 匯出按鈕 (頂部)
    document.getElementById('btn-export')?.addEventListener('click', exportData);

    // 匯出按鈕 (統計區)
    document.getElementById('btn-export-data')?.addEventListener('click', exportData);

    // 匯入按鈕
    document.getElementById('btn-import')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            if (e.target.files[0]) importData(e.target.files[0]);
        };
        input.click();
    });
    
    // CSV 匯出按鈕
    document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
    
    // 搜尋輸入即時過濾
    document.getElementById('schedule-search-input')?.addEventListener('input', () => {
        renderSchedule();
    });

    // ============================================================
    // 折疊卡片 (Collapsible)
    // ============================================================
    function setupCollapsible(headerId, bodyId) {
        const header = document.getElementById(headerId);
        const body = document.getElementById(bodyId);
        if (!header || !body) return;
        header.addEventListener('click', () => {
            const isCollapsed = body.classList.toggle('collapsed');
            header.classList.toggle('collapsed');
        });
    }
    setupCollapsible('stats-header', 'stats-body');
    setupCollapsible('schedule-header', 'schedule-body');

    // ============================================================
    // 週跳轉功能
    // ============================================================
    const weekJumpInput = document.getElementById('week-jump-input');
    const btnWeekJump = document.getElementById('btn-week-jump');
    
    const doWeekJump = () => {
        const val = weekJumpInput ? weekJumpInput.value.trim() : '';
        if (!val) return;
        const items = document.querySelectorAll('.schedule-item');
        let target = null;
        items.forEach(item => {
            const text = item.textContent;
            if (text.includes(val)) {
                target = item;
            }
        });
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.style.borderColor = 'var(--accent)';
            target.style.boxShadow = '0 0 15px var(--accent-glow)';
            setTimeout(() => {
                target.style.borderColor = '';
                target.style.boxShadow = '';
            }, 2000);
        } else {
            showToast('❌ 找不到該週數', 'warning');
        }
    };
    
    if (btnWeekJump) btnWeekJump.addEventListener('click', doWeekJump);
    if (weekJumpInput) {
        weekJumpInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doWeekJump();
        });
    }

    // ============================================================
    // Hero 快速操作按鈕
    // ============================================================
    document.getElementById('qa-teams')?.addEventListener('click', async () => {
        const { sendTeamsNotification } = await import('./notifications.js');
        await sendTeamsNotification();
        fireConfetti(15);
        playNotification();
    });

    document.getElementById('qa-personal')?.addEventListener('click', async () => {
        const { sendPersonalTeamsNotification } = await import('./notifications.js');
        await sendPersonalTeamsNotification();
        playNotification();
    });

    document.getElementById('qa-csv')?.addEventListener('click', () => {
        exportCSV();
        playSuccess();
        fireConfetti(15);
    });
}






// 刷新全部 UI 面板
export async function renderAll() {
    try {
        renderAuthStatus();
        renderHero();
    } catch (e) { console.error('renderHero 失敗:', e); }
    try {
        renderMembers();
    } catch (e) { console.error('renderMembers 失敗:', e); }
    try {
        renderSchedule();
    } catch (e) { console.error('renderSchedule 失敗:', e); }
    try {
        renderStats();
    } catch (e) { console.error('renderStats 失敗:', e); }
    try {
        renderCircularProgress();
    } catch (e) { console.error('renderCircularProgress 失敗:', e); }
    try {
        renderCalendarView();
    } catch (e) { console.error('renderCalendarView 失敗:', e); }
    try {
        autoScrollToCurrentWeek();
    } catch (e) { /* ignore */ }
    // 動態 import 以避免循環依賴 (notifications.js import openMsSettingsModal from ui.js)
    try {
        const { checkAndShowWeeklyNotification } = await import('./notifications.js');
        checkAndShowWeeklyNotification();
    } catch (e) { /* ignore */ }
}

// ============================================================
// 月曆檢視
// ============================================================
let calendarViewDate = new Date();

function renderCalendarView() {
    const container = document.getElementById('calendar-view-container');
    if (!container) return;
    
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const today = new Date();
    const schedule = getSchedule();
    const members = getMembers();
    
// MEMBER_COLORS 已定義於 module 層級
    const memberColorMap = {};
    members.forEach((m, i) => { memberColorMap[m.id] = MEMBER_COLORS[i % MEMBER_COLORS.length]; });
    
    // 收集有排班的日期 — 整個格子背景上色
    const dutyMap = {};
    schedule.forEach(s => {
        const { start, end } = getWeekStartEndDates(s.weekKey);
        const cleaners = s.cleanerIds.map(id => members.find(m => m.id === id)).filter(Boolean);
        if (cleaners.length > 0) {
            const fullNames = cleaners.map(c => c.name).join(', ');
            // 整個格子背景顏色：單人直接用該顏色，多人用漸層
            const colors = cleaners.map(c => {
                return c.avatarEmoji ? '#8B7CF8' : (memberColorMap[c.id] || '#888');
            });
            let bgStyle;
            if (colors.length === 1) {
                bgStyle = `background:${colors[0]}55; border-color:${colors[0]}AA; box-shadow: inset 0 0 30px ${colors[0]}44;`;
            } else if (colors.length === 2) {
                bgStyle = `background: linear-gradient(135deg, ${colors[0]}66 0%, ${colors[1]}66 100%); border-color:${colors[0]}AA;`;
            } else {
                const stops = colors.map((c, i) => `${c}55 ${(i/(colors.length-1))*100}%`).join(', ');
                bgStyle = `background: linear-gradient(135deg, ${stops}); border-color:${colors[0]}AA;`;
            }
            let d = new Date(start);
            while (d <= end) {
                const key = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
                dutyMap[key] = { fullNames, bgStyle };
                d.setDate(d.getDate() + 1);
            }
        }
    });
    
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevTotal = new Date(year, month, 0).getDate();
    
    const weekdays = ['日','一','二','三','四','五','六'];
    
    // 顏色圖例
    let legendHtml = '';
    if (members.length > 0) {
        legendHtml = '<div class="calendar-legend">' + 
            members.map((m, i) => {
                const color = m.avatarEmoji ? '#8B7CF8' : (MEMBER_COLORS[i % MEMBER_COLORS.length]);
                return `<span class="calendar-legend-item"><span class="calendar-legend-swatch" style="background:${color}"></span>${escapeHtml(m.name)}</span>`;
            }).join('') +
        '</div>';
    }
    
    let html = `
        <div class="calendar-nav">
            <button class="btn btn-secondary btn-sm" id="cal-prev-month"><i class="fa-solid fa-chevron-left"></i></button>
            <span class="calendar-nav-title">${year} 年 ${month + 1} 月</span>
            <button class="btn btn-secondary btn-sm" id="cal-next-month"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
        ${legendHtml}
        <div class="calendar-view-grid">
            ${weekdays.map(d => `<div class="calendar-view-header">${d}</div>`).join('')}
    `;
    
    // 上個月尾巴
    for (let i = firstDay - 1; i >= 0; i--) {
        html += `<div class="calendar-view-cell other-month">${prevTotal - i}</div>`;
    }
    
    // 當月
    for (let day = 1; day <= totalDays; day++) {
        const key = `${year}-${month+1}-${day}`;
        const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
        const dutyInfo = dutyMap[key];
        let cls = 'calendar-view-cell';
        if (isToday) cls += ' today';
        if (dutyInfo) cls += ' has-duty-colored';
        
        html += `<div class="${cls}"${dutyInfo ? ` title="值日生: ${escapeHtml(dutyInfo.fullNames)}" style="${dutyInfo.bgStyle}"` : ''}>
            <span class="cal-day-num">${day}</span>
            ${dutyInfo ? `<div class="cal-duty-names">${escapeHtml(dutyInfo.fullNames)}</div>` : ''}
        </div>`;
    }
    
    // 下個月開頭
    const rendered = firstDay + totalDays;
    const remaining = 42 - rendered;
    for (let i = 1; i <= remaining; i++) {
        html += `<div class="calendar-view-cell other-month">${i}</div>`;
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    // 事件綁定
    document.getElementById('cal-prev-month')?.addEventListener('click', () => {
        calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
        renderCalendarView();
    });
    document.getElementById('cal-next-month')?.addEventListener('click', () => {
        calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
        renderCalendarView();
    });
}

// ============================================================
// 自動滾動到本週
// ============================================================
function autoScrollToCurrentWeek() {
    const currentWeekItem = document.querySelector('.schedule-item.current-week');
    if (currentWeekItem) {
        setTimeout(() => {
            currentWeekItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
    }
}
