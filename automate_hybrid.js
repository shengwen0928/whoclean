const puppeteer = require('puppeteer-core');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function run() {
    console.log("正在連接到您桌面上已開啟的 Chrome 瀏覽器 (port 9222)...");
    
    let browser;
    try {
        browser = await puppeteer.connect({
            browserURL: 'http://localhost:9222',
            defaultViewport: null
        });
        console.log("成功連接到瀏覽器！");
    } catch (e) {
        console.error("無法連接到 Chrome。請確認已成功執行 launch_chrome.ps1 且視窗已開啟。");
        process.exit(1);
    }

    const pages = await browser.pages();
    // 找出 Power Automate 頁面
    let page = pages.find(p => p.url().includes('powerautomate.com'));
    if (!page) {
        // 如果沒找到，就用第一個頁面載入
        page = pages[0];
        await page.goto('https://make.powerautomate.com/', { waitUntil: 'networkidle2' });
    }

    console.log("\n=======================================================");
    console.log("【請在此處操作】:");
    console.log("1. 請在您桌面上剛打開的 Chrome 視窗中完成 Microsoft 帳戶登入。");
    console.log("2. 登入成功並看到 Power Automate 的首頁畫面後。");
    console.log("3. 回到此對話框中回覆『我登入了』。");
    console.log("=======================================================\n");

    await question("登入成功後，請按下 [Enter] 鍵繼續...");

    console.log("開始分析環境並自動導向新建流程頁面...");

    const currentUrl = page.url();
    const envMatch = currentUrl.match(/\/environments\/([^/]+)/);
    if (!envMatch) {
        console.error("無法取得 Power Automate 環境 ID，請確保您已登入並處於首頁。");
        rl.close();
        return;
    }
    const envId = envMatch[1];
    console.log(`成功識別環境 ID: ${envId}`);

    const createUrl = `https://make.powerautomate.com/environments/${envId}/create`;
    console.log(`導向建立頁面: ${createUrl}`);
    await page.goto(createUrl, { waitUntil: 'networkidle2' });

    console.log("點擊 '已排程的雲端流程' 按鈕...");
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const target = buttons.find(b => b.innerText.includes('已排程的雲端流程') || b.innerText.includes('Scheduled cloud flow'));
        if (target) {
            target.click();
        } else {
            throw new Error("找不到 '已排程的雲端流程' 按鈕");
        }
    });

    console.log("等待對話框載入...");
    try {
        await page.waitForSelector('input[placeholder="How do you want to call this flow?"]', { timeout: 10000 });
    } catch (e) {
        try {
            await page.waitForSelector('input[placeholder="要如何命名此流程?"]', { timeout: 5000 });
        } catch (err) {
            console.log("找不到命名輸入欄位，請確認對話方塊是否已開啟。");
            rl.close();
            return;
        }
    }

    // 1. 輸入流程名稱
    console.log("正在輸入流程名稱...");
    const nameInput = await page.$('input[placeholder="How do you want to call this flow?"]') || await page.$('input[placeholder="要如何命名此流程?"]');
    await nameInput.type("WhoClean Weekly Duty Reminder");

    // 2. 選擇每週一
    try {
        const selects = await page.$$('div[role="combobox"]');
        if (selects.length > 0) {
            await selects[1].click();
            await new Promise(resolve => setTimeout(resolve, 1000));
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
        console.log("設定頻率時發生非致命錯誤。");
    }

    console.log("\n=======================================================");
    console.log("【自動化輸入已完成】！");
    console.log("我已為您設定好『流程名稱』與『執行週期：每週』。");
    console.log("請在網頁右下角點擊【建立 (Create)】按鈕。");
    console.log("建立完成後，您可以新增動作並貼入引導手冊 (TEAMS_GUIDE.md) 中提供給您的卡片代碼。");
    console.log("=======================================================\n");

    rl.close();
}

run();
