/**
 * 應用程式主入口 (Orchestration & Integration)
 */
import { initStorage } from './storage.js';
import { renderAll, setupEventListeners } from './ui.js';
import { initTeamsSdk } from './auth.js';

async function init() {
    // 1. 初始化資料庫
    initStorage();
    
    // 2. 嘗試初始化 Teams SDK 並自動取得身分 (無感登入)
    await initTeamsSdk();
    
    // 3. 綁定按鈕與表單事件
    setupEventListeners();
    
    // 4. 渲染主頁面 UI
    renderAll();
}

// 由於 type="module" 腳本是延遲執行的，此時 DOM 可能已經解析完畢
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
