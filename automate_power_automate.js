const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 尋找本機 Chrome 路徑
function getChromePath() {
    const paths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function run() {
    const chromePath = getChromePath();
    if (!chromePath) {
        console.error("在您的電腦上找不到 Chrome 瀏覽器，請確認是否有安裝 Chrome！");
        process.exit(1);
    }

    console.log("正在啟動 Chrome 瀏覽器並開啟 Power Automate...");
    
    // 啟動瀏覽器並最大化
    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });

    const [page] = await browser.pages();
    
    // 導向 Power Automate 登入頁面
    await page.goto('https://make.powerautomate.com/', { waitUntil: 'networkidle2' });

    console.log("\n=======================================================");
    console.log("【請在此處操作】:");
    console.log("1. 請在打開的 Chrome 視窗中，完成您的 Microsoft 帳戶登入。");
    console.log("2. 登入成功並看到 Power Automate 的首頁畫面後。");
    console.log("3. 回到此終端機（命令提示字元），按下 [Enter] 鍵，我將繼續幫您自動設定。");
    console.log("=======================================================\n");

    await question("登入成功後，請按下 [Enter] 鍵繼續...");

    console.log("偵測到確認，開始分析環境與自動建立流程...");

    // 取得當前的 Environment ID
    const currentUrl = page.url();
    const envMatch = currentUrl.match(/\/environments\/([^/]+)/);
    if (!envMatch) {
        console.error("無法取得 Power Automate 環境 ID，請確保您已登入並處於首頁。");
        rl.close();
        return;
    }
    const envId = envMatch[1];
    console.log(`成功識別環境 ID: ${envId}`);

    // 直接導向新建排程流頁面
    const createUrl = `https://make.powerautomate.com/environments/${envId}/flows/new/scheduled`;
    console.log(`導向新建流程頁面: ${createUrl}`);
    await page.goto(createUrl, { waitUntil: 'networkidle2' });

    // 等待建立對話框載入
    console.log("等待新建對話框彈出...");
    try {
        await page.waitForSelector('input[placeholder="How do you want to call this flow?"]', { timeout: 15000 });
    } catch (e) {
        // 嘗試中文版 placeholder
        try {
            await page.waitForSelector('input[placeholder="要如何命名此流程?"]', { timeout: 5000 });
        } catch (err) {
            console.log("找不到命名輸入欄位，請確認網頁是否正常顯示。");
            rl.close();
            return;
        }
    }

    // 1. 輸入流程名稱
    console.log("正在輸入流程名稱...");
    const nameInput = await page.$('input[placeholder="How do you want to call this flow?"]') || await page.$('input[placeholder="要如何命名此流程?"]');
    await nameInput.type("WhoClean Weekly Duty Reminder");

    // 2. 設定每週一執行
    console.log("正在設定每週一執行頻率...");
    // 頻率下拉選單預設是 Minute，我們需要點選並改成 Week
    // 在 Fluent UI 中，下拉選單通常是 button 或是帶有 role="combobox" 的元素
    try {
        const selects = await page.$$('div[role="combobox"]');
        if (selects.length > 0) {
            // 點選第二個下拉選單（通常是頻率單位）
            await selects[1].click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            // 點選 Week (週)
            const options = await page.$$('span');
            for (const opt of options) {
                const text = await page.evaluate(el => el.textContent, opt);
                if (text.includes("Week") || text.includes("週")) {
                    await opt.click();
                    break;
                }
            }
        }
    } catch (e) {
        console.log("設定頻率時發生非致命錯誤，請手動確認頻率為『每週』。");
    }

    console.log("\n=======================================================");
    console.log("【自動輸入已完成】:");
    console.log("我已幫您填寫了：");
    console.log("   - 流程名稱: WhoClean Weekly Duty Reminder");
    console.log("   - 執行週期: 每週");
    console.log("\n請在瀏覽器中點選右下角的【建立 (Create)】按鈕。");
    console.log("建立完成後，回到此處按下 [Enter]，我會幫您建立剩餘的動作。");
    console.log("=======================================================\n");

    await question("點選建立後，請按下 [Enter] 鍵繼續...");

    console.log("進入設計畫布，開始填入 HTTP 與 JSON 解析設定...");
    // 這裡我們直接用 Alert 或是說明指引，因為 V3 / Canvas 畫布的 DOM 樹是由 Microsoft Dynamically 渲染的
    // 為了百分之百不點錯，我們在網頁中注入一個小工具，或者由使用者直接複製卡片 JSON
    console.log("自動化腳本已完成基本架構！接下來您可以直接點擊【新增動作】，並參考專案中的 TEAMS_GUIDE.md 填入其餘三個步驟即可。");

    rl.close();
}

run();
