/**
 * Toast 通知模組
 */
import { escapeHtml } from './utils.js';

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
