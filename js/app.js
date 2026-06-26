import { initStorage } from './storage.js';
import { renderAll, setupEventListeners, setupKeyboardShortcuts } from './ui.js';
import { initTeamsSdk, initFirebaseAuth } from './auth.js';
import { showToast } from './toast.js';

async function init() {
    // 0. 讀取 config.json
    let config = null;
    try {
        const response = await fetch('./config.json');
        if (response.ok) {
            config = await response.json();
            if (config.firebaseConfig) {
                await initFirebaseAuth(config.firebaseConfig);
            }
        }
    } catch (e) {
        console.error("載入 Firebase Auth Config 失敗:", e);
    }

    // 1. 初始化資料庫
    await initStorage(config);
    
    // 2. 初始化 Teams SDK
    await initTeamsSdk();
    
    // 3. 載入儲存的主題（自動跟隨系統偏好）
    const savedTheme = localStorage.getItem('whoclean_theme');
    if (savedTheme && savedTheme !== 'auto') {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
        // auto 模式：跟隨系統
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const systemTheme = prefersDark ? 'default' : 'ocean';
        document.documentElement.setAttribute('data-theme', systemTheme);
        localStorage.setItem('whoclean_theme', 'auto');
        
        // 監聽系統主題變化
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            const currentTheme = localStorage.getItem('whoclean_theme');
            if (currentTheme === 'auto') {
                document.documentElement.setAttribute('data-theme', e.matches ? 'default' : 'ocean');
            }
        });
    }
    
    // 掛載全域渲染
    window.renderAllAppUI = renderAll;
    
    // 4. 綁定事件
    setupEventListeners();
    setupKeyboardShortcuts();
    
    // 5. 渲染 UI
    await renderAll();
    
    // 6. 關閉 Splash Screen（若有）
    dismissSplashScreen();
}

/** 關閉 Splash 啟動畫面 */
function dismissSplashScreen() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
        // 等待 loading bar 動畫跑完 + 一點緩衝
        setTimeout(() => {
            splash.classList.add('hidden');
            // 播放啟動音效
            import('./sound.js').then(({ playSplashComplete }) => {
                setTimeout(playSplashComplete, 100);
            }).catch(() => {});
            // 完成後從 DOM 移除
            setTimeout(() => splash.remove(), 700);
        }, 400);
    }
}

// DOM 準備好後初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// 註冊 PWA Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker 註冊成功，範圍:', reg.scope))
            .catch(err => console.log('Service Worker 註冊失敗:', err));
    });
}
