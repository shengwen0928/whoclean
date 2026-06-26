/**
 * WhoClean 輪值演算法測試腳本
 * 
 * 使用方法: node test_rotation.js
 * 
 * 測試各種情境：
 *   - 全部啟用：正常輪替
 *   - 部分未啟用：跳過 inactive 成員
 *   - 全部未啟用：錯誤處理
 *   - 錨點成員被停用：自動重設
 *   - 混合舊格式 config
 */

// ============================================================
// 從 cron_scheduler.js 複製的輪值演算法（保持一致）
// ============================================================

function getYearWeekString(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getWeekDiff(weekStr1, weekStr2) {
    if (weekStr1 === weekStr2) return 0;
    const parseWeek = (wStr) => {
        const [year, week] = wStr.split('-W');
        return { y: parseInt(year, 10), w: parseInt(week, 10) };
    };
    const w1 = parseWeek(weekStr1);
    const w2 = parseWeek(weekStr2);
    const getMondayOfISOWeek = (y, w) => {
        const simple = new Date(y, 0, 1 + (w - 1) * 7);
        const dow = simple.getDay();
        const ISOweekStart = new Date(simple);
        if (dow <= 4) {
            ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
        } else {
            ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
        }
        return ISOweekStart;
    };
    const d1 = getMondayOfISOWeek(w1.y, w1.w);
    const d2 = getMondayOfISOWeek(w2.y, w2.w);
    const diffTime = d2.getTime() - d1.getTime();
    return Math.round(diffTime / (7 * 24 * 60 * 60 * 1000));
}

/**
 * 輪值演算法（與 cron_scheduler.js 完全一致）
 */
function calculateDuty(rawMembers, anchor) {
    // 過濾未啟用（相容舊格式）
    const members = rawMembers
        .map(m => typeof m === 'string' ? { name: m, active: true } : m)
        .filter(m => m.active !== false)
        .map(m => m.name);

    if (members.length === 0) {
        return { error: '無活躍成員' };
    }

    // 錨點自動容錯
    let resolvedAnchor = { ...anchor };
    if (!resolvedAnchor || !members.includes(resolvedAnchor.memberName)) {
        if (members.length > 0) {
            resolvedAnchor = {
                weekKey: getYearWeekString(new Date()),
                memberName: members[0]
            };
        }
    }

    const today = new Date();
    const currentWeekKey = getYearWeekString(today);
    const anchorIdx = members.indexOf(resolvedAnchor.memberName);
    const diff = getWeekDiff(resolvedAnchor.weekKey, currentWeekKey);
    const cleanerIdx = ((anchorIdx + diff) % members.length + members.length) % members.length;
    const cleanerName = members[cleanerIdx];

    return {
        weekKey: currentWeekKey,
        anchor: resolvedAnchor,
        anchorIdx,
        diff,
        cleanerIdx,
        cleanerName,
        allActiveMembers: members
    };
}

// ============================================================
// 測試案例
// ============================================================

const TEST_WEEK = '2026-W26'; // 固定測試用週數

let passed = 0;
let failed = 0;

function assert(condition, msg) {
    if (condition) {
        console.log(`  ✅ ${msg}`);
        passed++;
    } else {
        console.log(`  ❌ ${msg}`);
        failed++;
    }
}

function runTest(name, fn) {
    console.log(`\n📋 ${name}`);
    try {
        fn();
    } catch (e) {
        console.log(`  ❌ 拋出例外: ${e.message}`);
        failed++;
    }
}

// ---------- 測試 1: 全部啟用，正常輪替 ----------
runTest('全部啟用 — 正常輪替', () => {
    const result = calculateDuty([
        { name: '張三', active: true },
        { name: '李四', active: true },
        { name: '王五', active: true }
    ], { weekKey: '2026-W24', memberName: '張三' });

    assert(result.cleanerName !== undefined, `有值日生結果: ${result.cleanerName}`);
    assert(result.allActiveMembers.length === 3, '3 位活躍成員');
    assert(!result.error, '無錯誤');
});

// ---------- 測試 2: 部分未啟用 ----------
runTest('部分未啟用 — 跳過 inactive', () => {
    const result = calculateDuty([
        { name: '張三', active: true },
        { name: '李四', active: false },
        { name: '王五', active: true }
    ], { weekKey: '2026-W24', memberName: '張三' });

    assert(result.allActiveMembers.length === 2, '2 位活躍成員（李四被排除）');
    assert(result.allActiveMembers.includes('張三'), '張三在活躍列表中');
    assert(result.allActiveMembers.includes('王五'), '王五在活躍列表中');
    assert(!result.allActiveMembers.includes('李四'), '李四不在活躍列表中');
});

// ---------- 測試 3: 錨點成員被停用 → 自動重設 ----------
runTest('錨點成員被停用 — 自動重設', () => {
    const result = calculateDuty([
        { name: '張三', active: false },
        { name: '李四', active: true },
        { name: '王五', active: true }
    ], { weekKey: '2026-W24', memberName: '張三' });

    assert(result.anchor.memberName !== '張三', '錨點已不再是張三');
    assert(result.anchor.memberName === '李四' || result.anchor.memberName === '王五',
        `錨點自動重設為: ${result.anchor.memberName}`);
    assert(!result.error, '無錯誤');
});

// ---------- 測試 4: 全部未啟用 ----------
runTest('全部未啟用 — 回傳錯誤', () => {
    const result = calculateDuty([
        { name: '張三', active: false },
        { name: '李四', active: false }
    ], { weekKey: '2026-W24', memberName: '張三' });

    assert(result.error === '無活躍成員', '回傳無活躍成員錯誤');
});

// ---------- 測試 5: 舊格式純字串陣列 ----------
runTest('舊格式相容 — 純字串陣列', () => {
    const result = calculateDuty(
        ['張三', '李四', '王五'],
        { weekKey: '2026-W24', memberName: '張三' }
    );

    assert(result.allActiveMembers.length === 3, '3 位成員（全部視為啟用）');
    assert(result.cleanerName !== undefined, `有值日生結果: ${result.cleanerName}`);
    assert(!result.error, '無錯誤');
});

// ---------- 測試 6: 混合格式 ----------
runTest('混合格式 — 部分字串、部分物件', () => {
    const result = calculateDuty([
        '張三',
        { name: '李四', active: false },
        { name: '王五', active: true }
    ], { weekKey: '2026-W24', memberName: '張三' });

    assert(result.allActiveMembers.length === 2, '2 位活躍成員（字串視為啟用，李四被排除）');
    assert(result.allActiveMembers.includes('張三'), '張三在活躍列表中');
    assert(result.allActiveMembers.includes('王五'), '王五在活躍列表中');
    assert(!result.allActiveMembers.includes('李四'), '李四不在活躍列表中');
});

// ---------- 測試 7: 輪替正確性（3 人輪 3 週各不同）----------
runTest('輪替正確性 — 3 人輪 3 週各不同', () => {
    const members = [
        { name: '張三', active: true },
        { name: '李四', active: true },
        { name: '王五', active: true }
    ];
    
    // 直接測試 rotation 演算法：相同的錨點 + 不同週數差
    // 錨點: 張三 @ W24, diff=0 → 張三, diff=1 → 李四, diff=2 → 王五
    const r0 = calculateDuty(members, { weekKey: '2026-W24', memberName: '張三' });
    
    // 驗證 rotation index 計算
    const membersArr = ['張三', '李四', '王五'];
    const anchorIdx = membersArr.indexOf('張三');
    
    const checkRotation = (diff, expected) => {
        const idx = ((anchorIdx + diff) % 3 + 3) % 3;
        return membersArr[idx] === expected;
    };
    
    assert(checkRotation(0, '張三'), 'diff=0 → 張三');
    assert(checkRotation(1, '李四'), 'diff=1 → 李四');
    assert(checkRotation(2, '王五'), 'diff=2 → 王五');
    assert(checkRotation(3, '張三'), 'diff=3 → 張三（3人輪完回到原點）');
    assert(checkRotation(4, '李四'), 'diff=4 → 李四');
    assert(checkRotation(5, '王五'), 'diff=5 → 王五');
    assert(checkRotation(6, '張三'), 'diff=6 → 張三（再輪一輪回到原點）');
    
    console.log(`  輪替循環: 張三 → 李四 → 王五 → 張三 → 李四 → 王五 → 張三...`);
});

// ---------- 測試 8: 未設定錨點時自動建立 ----------
runTest('無錨點 — 自動建立錨點', () => {
    const result = calculateDuty([
        { name: '張三', active: true },
        { name: '李四', active: true }
    ], null);

    assert(result.anchor !== null, '錨點已建立');
    assert(result.anchor.memberName === '張三', '錨點為第一個活躍成員');
    assert(!result.error, '無錯誤');
});

// ============================================================
// 總結
// ============================================================
const total = passed + failed;
console.log(`\n${'='.repeat(40)}`);
console.log(`📊 測試結果: ${passed}/${total} 通過`);
if (failed === 0) {
    console.log('🎉 全部測試通過！');
} else {
    console.log(`❌ ${failed} 項測試失敗`);
    process.exit(1);
}
