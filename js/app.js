/**
 * 應用程式主入口 (Orchestration & Integration)
 */
import { initStorage } from './storage.js';
import { renderAll, setupEventListeners } from './ui.js';

// 當 DOM 載入完成後初始化應用程式
document.addEventListener('DOMContentLoaded', () => {
    // 1. 初始化資料庫
    initStorage();
    
    // 2. 綁定按鈕與表單事件
    setupEventListeners();
    
    // 3. 渲染主頁面 UI
    renderAll();
});
