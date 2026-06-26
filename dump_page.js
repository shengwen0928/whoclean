const puppeteer = require('puppeteer-core');

async function run() {
    try {
        const browser = await puppeteer.connect({
            browserURL: 'http://localhost:9222',
            defaultViewport: null
        });
        const pages = await browser.pages();
        const page = pages.find(p => p.url().includes('powerautomate.com'));
        if (!page) {
            console.error("找不到 Power Automate 網頁！");
            process.exit(1);
        }

        console.log("當前網頁網址: " + page.url());
        
        // 取得所有 inputs 屬性
        const inputs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('input, button, [role="combobox"]')).map(el => ({
                tagName: el.tagName,
                id: el.id,
                placeholder: el.placeholder || '',
                role: el.getAttribute('role') || '',
                ariaLabel: el.getAttribute('aria-label') || '',
                innerText: el.innerText || '',
                value: el.value || ''
            }));
        });

        console.log("--- 網頁中的輸入控制項與按鈕 ---");
        console.log(JSON.stringify(inputs, null, 2));
    } catch (e) {
        console.error("執行出錯:", e);
    }
}

run();
