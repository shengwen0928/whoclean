/**
 * Teams 通知與桌面提醒模組
 */
import { getMembers, getSchedule, getTeamsWebhookUrl, getPersonalTeamsWebhookUrl, getSlackWebhookUrl } from './storage.js';
import { getYearWeekString } from './utils.js';
import { getCurrentUser } from './auth.js';
import { showToast } from './toast.js';
import { openMsSettingsModal } from './ui.js';

let weeklyNotificationChecked = false;

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

/**
 * 發送 Teams 頻道提醒通知
 */
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

/**
 * 發送個人 Teams 提醒通知
 */
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

/**
 * 發送 Slack 通知
 */
export async function sendSlackNotification() {
    const webhookUrl = getSlackWebhookUrl();
    if (!webhookUrl) {
        showToast('請先在設定中設定 Slack Webhook URL！', 'warning');
        openMsSettingsModal();
        return;
    }

    const duty = getCurrentDutyInfo();
    if (!duty) {
        showToast('本週尚未排定值日生，無法發送通知！', 'warning');
        return;
    }

    const payload = {
        blocks: [
            {
                type: "header",
                text: { type: "plain_text", text: "🧹 WhoClean 本週值日生提醒", emoji: true }
            },
            {
                type: "section",                    text: { type: "mrkdwn", text: `*本週值日生* \n${duty.cleanerNames}` }
            },
            {
                type: "context",
                elements: [
                    { type: "mrkdwn", text: `📅 *${duty.weekKey}*  ·  🗓️ ${duty.dateRange}` }
                ]
            },
            {
                type: "divider"
            },
            {
                type: "section",
                text: { type: "mrkdwn", text: "請值日生記得撥空打掃，大家一起維護環境整潔喔！" }
            }
        ]
    };

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok || res.type === 'opaque') {
            showToast('已發送通知至 Slack！', 'success');
        } else {
            showToast(`Slack 回應異常 (HTTP ${res.status})，請確認 Webhook URL！`, 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('發送失敗，請確認 Slack Webhook URL 是否正確！', 'error');
    }
}

/**
 * 檢查當前登入者是否為本週值日生並顯示桌面通知
 */
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
