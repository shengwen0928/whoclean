import { initStorage } from './storage.js';
import { renderAll, setupEventListeners } from './ui.js';
import { initTeamsSdk, initFirebaseAuth } from './auth.js';

async function init() {
    // 0. 讀取 config.json 來載入 Firebase Auth
    try {
        const response = await fetch('./config.json');
        if (response.ok) {
            const config = await response.json();
            if (config.firebaseConfig) {
                await initFirebaseAuth(config.firebaseConfig);
            }
        }
    } catch (e) {
        console.error("載入 Firebase Auth Config 失敗:", e);
    }

    // 1. 初始化資料庫
    await initStorage();
    
    // 2. 嘗試初始化 Teams SDK 並自動取得身分 (無感登入)
    await initTeamsSdk();
    
    // 將渲染函式掛載至全域，以便 auth.js 狀態改變時回呼
    window.renderAllAppUI = renderAll;
    
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
