/**
 * Microsoft 驗證管理模組 (MSAL.js Integration)
 */

const STORAGE_KEYS = {
    CLIENT_ID: 'whoclean_ms_client_id',
};

// 取得儲存的 Client ID
export function getMicrosoftClientId() {
    return localStorage.getItem(STORAGE_KEYS.CLIENT_ID) || '';
}

// 儲存 Client ID
export function saveMicrosoftClientId(clientId) {
    localStorage.setItem(STORAGE_KEYS.CLIENT_ID, clientId.trim());
}

// 初始化 MSAL 實例
let msalInstance = null;
async function getMsalInstance() {
    const clientId = getMicrosoftClientId();
    if (!clientId) return null;

    if (msalInstance) return msalInstance;

    const msalConfig = {
        auth: {
            clientId: clientId,
            authority: "https://login.microsoftonline.com/common",
            redirectUri: window.location.origin,
        },
        cache: {
            cacheLocation: "localStorage",
            storeAuthStateInCookie: false,
        }
    };

    // MSAL 會在全域載入 (由 CDN 引入)
    if (typeof msal !== 'undefined') {
        msalInstance = new msal.PublicClientApplication(msalConfig);
        await msalInstance.initialize();
        return msalInstance;
    }
    return null;
}

let teamsUser = null;

// 初始化 Teams SDK 並嘗試自動取得使用者身分 (無感登入)
export function initTeamsSdk() {
    return new Promise((resolve) => {
        if (typeof microsoftTeams !== 'undefined') {
            try {
                microsoftTeams.app.initialize().then(() => {
                    microsoftTeams.app.getContext().then((context) => {
                        if (context && context.user) {
                            teamsUser = {
                                name: context.user.displayName || context.user.userPrincipalName.split('@')[0],
                                email: context.user.userPrincipalName,
                                avatar: context.user.displayName ? context.user.displayName.substring(0, 2) : 'TM',
                                isTeams: true
                            };
                            resolve(teamsUser);
                        } else {
                            resolve(null);
                        }
                    }).catch(err => {
                        console.log("取得 Teams Context 失敗 (可能不在 Teams 內執行):", err);
                        resolve(null);
                    });
                }).catch(err => {
                    console.log("初始化 Teams SDK 失敗 (可能不在 Teams 內執行):", err);
                    resolve(null);
                });
            } catch (e) {
                console.log("偵測到 Teams 物件但初始化失敗:", e);
                resolve(null);
            }
        } else {
            resolve(null);
        }
    });
}

let firebaseAuth = null;
let currentFirebaseUser = null;

// 快取 Firebase 模組，避免每次操作都重新下載
let _firebaseAppModule = null;
let _firebaseAuthModule = null;

async function _getFirebaseAppModule() {
    if (!_firebaseAppModule) {
        _firebaseAppModule = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
    }
    return _firebaseAppModule;
}

async function _getFirebaseAuthModule() {
    if (!_firebaseAuthModule) {
        _firebaseAuthModule = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js');
    }
    return _firebaseAuthModule;
}

// 初始化 Firebase Auth
export async function initFirebaseAuth(config) {
    if (!config || !config.apiKey) return;
    try {
        const { initializeApp, getApp } = await _getFirebaseAppModule();
        const { getAuth, onAuthStateChanged } = await _getFirebaseAuthModule();
        
        let app;
        try {
            app = getApp();
        } catch {
            app = initializeApp(config);
        }
        
        firebaseAuth = getAuth(app);
        
        onAuthStateChanged(firebaseAuth, (user) => {
            if (user) {
                currentFirebaseUser = {
                    uid: user.uid,
                    name: user.displayName || user.email || user.phoneNumber || 'Firebase 用戶',
                    email: user.email || '',
                    avatar: (user.displayName || user.email || user.phoneNumber || 'FB').substring(0, 2),
                    phoneNumber: user.phoneNumber || '',
                    isFirebase: true
                };
            } else {
                currentFirebaseUser = null;
            }
            if (window.renderAllAppUI) {
                window.renderAllAppUI();
            }
        });
    } catch (e) {
        console.error("Firebase Auth 初始化失敗:", e);
    }
}

// 取得目前登入的使用者
export async function getCurrentUser() {
    // 0. 優先檢查 Firebase 登入
    if (currentFirebaseUser) {
        return currentFirebaseUser;
    }

    // 1. 優先檢查 Teams 帳戶 (若在 Teams 內執行會自動抓到)
    if (teamsUser) {
        return teamsUser;
    }

    // 2. 其次檢查真實 MSAL 登入
    const instance = await getMsalInstance();
    if (instance) {
        const accounts = instance.getAllAccounts();
        if (accounts.length > 0) {
            return {
                name: accounts[0].name || accounts[0].username,
                email: accounts[0].username,
                avatar: accounts[0].name ? accounts[0].name.substring(0, 2) : 'MS'
            };
        }
    }

    return null;
}

// Firebase - Email 註冊
export async function registerWithEmail(email, password, displayName) {
    if (!firebaseAuth) throw new Error("Firebase Auth 未初始化");
    const { createUserWithEmailAndPassword, updateProfile } = await _getFirebaseAuthModule();
    const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    if (displayName) {
        await updateProfile(userCredential.user, { displayName });
    }
    return userCredential.user;
}

// Firebase - Email 登入
export async function loginWithEmail(email, password) {
    if (!firebaseAuth) throw new Error("Firebase Auth 未初始化");
    const { signInWithEmailAndPassword } = await _getFirebaseAuthModule();
    const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    return userCredential.user;
}

// Firebase - Google 登入
export async function loginWithGoogle() {
    if (!firebaseAuth) throw new Error("Firebase Auth 未初始化");
    const { signInWithPopup, GoogleAuthProvider } = await _getFirebaseAuthModule();
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(firebaseAuth, provider);
    return result.user;
}


// 執行登入
export async function login() {
    const clientId = getMicrosoftClientId();
    
    // 如果沒有設定 Client ID，則回傳 false，讓 UI 提示模擬登入
    if (!clientId) {
        return { success: false, needConfig: true };
    }

    try {
        const instance = await getMsalInstance();
        if (!instance) throw new Error("MSAL 未載入");

        const loginRequest = {
            scopes: ["User.Read"]
        };
        const loginResponse = await instance.loginPopup(loginRequest);
        return {
            success: true,
            user: {
                name: loginResponse.account.name || loginResponse.account.username,
                email: loginResponse.account.username,
                avatar: loginResponse.account.name ? loginResponse.account.name.substring(0, 2) : 'MS'
            }
        };
    } catch (error) {
        console.error("Microsoft 登入失敗:", error);
        return { success: false, error: error.message };
    }
}

// 執行登出
export async function logout() {
    // 優先登出 Firebase
    if (firebaseAuth && firebaseAuth.currentUser) {
        const { signOut } = await _getFirebaseAuthModule();
        await signOut(firebaseAuth);
    }

    const instance = await getMsalInstance();
    if (instance) {
        const accounts = instance.getAllAccounts();
        if (accounts.length > 0) {
            try {
                await instance.logoutPopup({
                    postLogoutRedirectUri: window.location.origin
                });
                return true;
            } catch (error) {
                console.error("Microsoft 登出失敗:", error);
                // 強制清空快取以防卡死
                localStorage.clear();
                window.location.reload();
            }
        }
    }
    return true;
}
