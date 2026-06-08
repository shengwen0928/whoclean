import { getMembers, getSchedule, addMember, removeMember, updateWeekCleaner, moveMemberUp, moveMemberDown, getTeamsWebhookUrl, saveTeamsWebhookUrl } from './storage.js';
import { getYearWeekString, getWeekRangeText } from './utils.js';
import { getMicrosoftClientId, saveMicrosoftClientId, getCurrentUser, login, logout, saveDemoUser } from './auth.js';

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
    btnCloseMsModal: document.getElementById('btn-close-ms-modal'),
    btnCancelMsModal: document.getElementById('btn-cancel-ms-modal'),
    btnSaveMsSettings: document.getElementById('btn-save-ms-settings'),
    btnMsDemoLogin: document.getElementById('btn-ms-demo-login'),
};

let activeEditingWeekKey = null;

// 取得頭像縮寫文字
function getAvatarText(name) {
    return name ? name.substring(0, 2) : '?';
}

// 渲染 Microsoft 登入狀態
export async function renderAuthStatus() {
    const user = await getCurrentUser();
    const container = elements.authStatusContainer;
    
    if (user) {
        container.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.75rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); padding: 0.35rem 0.85rem; border-radius: var(--radius-md);">
                <div class="avatar" style="background: linear-gradient(135deg, #0072ff 0%, #00c6ff 100%); width: 28px; height: 28px; font-size: 0.75rem;">${user.avatar}</div>
                <div style="text-align: left; max-width: 120px;">
                    <div style="font-size: 0.85rem; font-weight: 600; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${user.name}</div>
                    <div style="font-size: 0.7rem; color: var(--text-secondary); line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${user.email} ${user.isDemo ? '<span style="color: var(--warning); font-size: 0.65rem;">(模擬)</span>' : ''}
                    </div>
                </div>
                <button class="btn-icon danger" id="btn-ms-logout" title="登出" style="width: 24px; height: 24px; border: none; background: transparent; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; cursor: pointer;">
                    <i class="fa-solid fa-right-from-bracket" style="font-size: 0.8rem;"></i>
                </button>
            </div>
        `;
        
        document.getElementById('btn-ms-logout').addEventListener('click', async () => {
            await logout();
            renderAll();
        });
    } else {
        container.innerHTML = `
            <button class="btn btn-primary" id="btn-ms-login" style="padding: 0.5rem 1rem; font-size: 0.85rem; background: linear-gradient(135deg, #0078d4 0%, #005a9e 100%);">
                <i class="fa-brands fa-microsoft"></i> Microsoft 登入
            </button>
        `;
        
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

export function openMsSettingsModal() {
    elements.msClientIdInput.value = getMicrosoftClientId();
    elements.teamsWebhookInput.value = getTeamsWebhookUrl();
    elements.msSettingsModal.classList.add('active');
}

export function closeMsSettingsModal() {
    elements.msSettingsModal.classList.remove('active');
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
        elements.heroActionContainer.innerHTML = `
            <button class="btn btn-primary" id="btn-edit-current" style="width: 100%;">
                <i class="fa-solid fa-user-pen"></i> 安排值日生
            </button>
        `;
        document.getElementById('btn-edit-current').onclick = () => openEditModal(currentWeekKey);
        return;
    }

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

    // 動態產生操作按鈕
    let buttonsHtml = `
        <button class="btn btn-primary" id="btn-edit-current">
            <i class="fa-solid fa-user-pen"></i> 修改人員
        </button>
        <button class="btn btn-secondary" id="btn-send-teams" style="background: rgba(98, 100, 167, 0.15); color: #8f92d1; border-color: rgba(98, 100, 167, 0.3);">
            <i class="fa-brands fa-microsoft-teams"></i> 頻道通知
        </button>
    `;

    // 檢查本週值日生是否有設定 Email
    const emails = activeCleaners.map(ac => ac.email).filter(Boolean);
    if (emails.length > 0) {
        const msgText = `🧹 哈囉，溫馨提醒：這週（${currentDuty.dateRange}）輪到您值日打掃囉！記得抽空清潔環境，十分感謝您！`;
        const teamsDeepLink = `https://teams.microsoft.com/l/chat/0/0?users=${emails.join(',')}&message=${encodeURIComponent(msgText)}`;
        buttonsHtml += `
            <a class="btn btn-secondary" href="${teamsDeepLink}" target="_blank" style="background: rgba(0, 120, 212, 0.15); color: #5ca1e6; border-color: rgba(0, 120, 212, 0.3); text-decoration: none; text-align: center; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;">
                <i class="fa-regular fa-comment-dots"></i> Teams 私訊提醒
            </a>
        `;
    }

    elements.heroActionContainer.innerHTML = buttonsHtml;

    // 綁定動態生成的按鈕事件
    document.getElementById('btn-edit-current').onclick = () => openEditModal(currentWeekKey);
    document.getElementById('btn-send-teams').onclick = sendTeamsNotification;
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
        
        let emailHtml = '';
        let directMessageBtn = '';
        if (m.email) {
            emailHtml = `<div style="font-size: 0.75rem; color: var(--text-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${m.email}</div>`;
            const msgText = `🧹 哈囉，溫馨提醒您本週值日輪值已排定，感謝您的配合！`;
            const teamsDeepLink = `https://teams.microsoft.com/l/chat/0/0?users=${m.email}&message=${encodeURIComponent(msgText)}`;
            directMessageBtn = `
                <a class="btn-icon" href="${teamsDeepLink}" target="_blank" title="發送 Teams 私訊" style="color: #5ca1e6; border-color: rgba(0, 120, 212, 0.2); background: rgba(0, 120, 212, 0.05); text-decoration: none; display: inline-flex; align-items: center; justify-content: center;">
                    <i class="fa-regular fa-comment-dots"></i>
                </a>
            `;
        }

        item.innerHTML = `
            <div class="member-profile">
                <div class="avatar" style="background: ${m.color}">${getAvatarText(m.name)}</div>
                <div style="text-align: left;">
                    <div class="member-name">${m.name}</div>
                    <div class="member-count">第 ${idx + 1} 順位</div>
                    ${emailHtml}
                </div>
            </div>
            <div style="display: flex; gap: 0.35rem; align-items: center;">
                ${directMessageBtn}
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
        const email = elements.newMemberEmail ? elements.newMemberEmail.value.trim() : '';
        if (name) {
            addMember(name, email);
            elements.newMemberName.value = '';
            if (elements.newMemberEmail) elements.newMemberEmail.value = '';
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
        
        saveMicrosoftClientId(clientId);
        saveTeamsWebhookUrl(webhookUrl);
        
        closeMsSettingsModal();
        renderAll();
        alert('設定儲存成功！');
    });

    // 模擬 Microsoft 登入
    elements.btnMsDemoLogin.addEventListener('click', () => {
        const mockUser = {
            name: '微軟測試用戶',
            email: 'test_user@outlook.com',
            avatar: '微軟'
        };
        saveDemoUser(mockUser);
        closeMsSettingsModal();
        renderAll();
        alert('成功！已使用模擬 Microsoft 帳戶登入。');
    });
}

// 發送 Teams 提醒通知
export async function sendTeamsNotification() {
    const webhookUrl = getTeamsWebhookUrl();
    if (!webhookUrl) {
        alert('請先在設定中設定 Microsoft Teams Webhook URL！');
        openMsSettingsModal();
        return;
    }

    const today = new Date();
    const currentWeekKey = getYearWeekString(today);
    const schedule = getSchedule();
    const members = getMembers();
    
    const currentDuty = schedule.find(s => s.weekKey === currentWeekKey);
    if (!currentDuty || currentDuty.cleanerIds.length === 0) {
        alert('本週尚未排定值日生，無法發送通知！');
        return;
    }

    const cleanerNames = currentDuty.cleanerIds
        .map(cid => members.find(m => m.id === cid)?.name)
        .filter(Boolean)
        .join(', ');

    const dateRange = currentDuty.dateRange;

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            mode: 'no-cors', // 繞過瀏覽器的跨來源限制 (不需讀取回傳值)
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: `🧹 **WhoClean 本週值日生提醒**\n\n本週值日生是：**${cleanerNames}**\n值日區間：**${dateRange}**\n\n請值日生記得撥空打掃，大家一起維護環境整潔喔！`
            })
        });
        alert('已發送通知要求至 Teams！請至您的 Teams 頻道確認。');
    } catch (err) {
        console.error(err);
        alert('發送失敗，請確認 Webhook URL 是否正確！');
    }
}

// 刷新全部 UI 面板
export function renderAll() {
    renderAuthStatus();
    renderHero();
    renderMembers();
    renderSchedule();
}
