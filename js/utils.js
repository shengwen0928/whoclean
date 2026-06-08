/**
 * 實用工具函式
 */

/**
 * 取得指定日期所在的年份與 ISO 週數 (格式: YYYY-Www)
 * @param {Date} d - 日期
 * @returns {string} 格式為 "YYYY-Www" 的字串
 */
export function getYearWeekString(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // 設定到該週的星期四：該日期加上 3 減去星期幾（星期日為 0 轉為 7）
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * 取得指定週數的起始與結束日期文字 (星期一到星期五，排除六日)
 * @param {string} weekStr - "YYYY-Www" 格式的週數
 * @returns {string} 日期範圍字串，例如 "06/08 ~ 06/12"
 */
export function getWeekRangeText(weekStr) {
    const [year, week] = weekStr.split('-W');
    const w = parseInt(week, 10);
    const simple = new Date(year, 0, 1 + (w - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4) {
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    } else {
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    }
    
    const start = new Date(ISOweekStart);
    const end = new Date(ISOweekStart);
    end.setDate(start.getDate() + 4); // 星期一至五，排除六日
    
    const format = (date) => `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
    return `${format(start)} ~ ${format(end)}`;
}

/**
 * 隨生成一組好看的漸層顏色
 * @returns {string} CSS gradient string
 */
export function getRandomGradient() {
    const gradients = [
        'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
        'linear-gradient(135deg, #4E65FF 0%, #92EFFD 100%)',
        'linear-gradient(135deg, #7F00FF 0%, #E100FF 100%)',
        'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
        'linear-gradient(135deg, #F9D423 0%, #FF4E50 100%)',
        'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
        'linear-gradient(135deg, #f80759 0%, #bc4e9c 100%)',
        'linear-gradient(135deg, #1D976C 0%, #93F9B9 100%)',
        'linear-gradient(135deg, #3A1C71 0%, #D76D77 50%, #FFAF7B 100%)',
    ];
    return gradients[Math.floor(Math.random() * gradients.length)];
}

/**
 * 產生隨機 ID
 * @returns {string} Unique ID
 */
export function generateId() {
    return Math.random().toString(36).substr(2, 9);
}
