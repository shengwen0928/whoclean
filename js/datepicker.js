/**
 * 客製化日期選擇器元件
 */
export function initCustomDatePicker(inputId, wrapperId, calendarId, onSelectCallback = null) {
    const inputEl = document.getElementById(inputId);
    const wrapperEl = document.getElementById(wrapperId);
    const calendarEl = document.getElementById(calendarId);

    if (!inputEl || !wrapperEl || !calendarEl) return null;

    let currentDate = new Date(); // 目前檢視的年、月
    let selectedDate = null; // 目前選擇的日期

    // 建立日曆 HTML 結構 (包裝在 .calendar-card 容器中以實現彈窗置中)
    calendarEl.innerHTML = `
        <div class="calendar-card">
            <div class="calendar-header">
                <button type="button" class="calendar-btn" id="${calendarId}-prev-month"><i class="fa-solid fa-chevron-left"></i></button>
                <span class="calendar-title" id="${calendarId}-title">2026 年 6 月</span>
                <button type="button" class="calendar-btn" id="${calendarId}-next-month"><i class="fa-solid fa-chevron-right"></i></button>
            </div>
            <div class="calendar-weekdays">
                <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
            </div>
            <div class="calendar-days" id="${calendarId}-days"></div>
            <div class="calendar-footer">
                <button type="button" class="btn btn-secondary btn-sm" id="${calendarId}-btn-clear" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">清除</button>
                <button type="button" class="btn btn-primary btn-sm" id="${calendarId}-btn-today" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">今天</button>
            </div>
        </div>
    `;

    const titleEl = document.getElementById(`${calendarId}-title`);
    const daysContainer = document.getElementById(`${calendarId}-days`);
    const btnPrev = document.getElementById(`${calendarId}-prev-month`);
    const btnNext = document.getElementById(`${calendarId}-next-month`);
    const btnClear = document.getElementById(`${calendarId}-btn-clear`);
    const btnToday = document.getElementById(`${calendarId}-btn-today`);

    // 渲染日曆格子
    function renderDays() {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth(); // 0-11

        titleEl.innerText = `${year} 年 ${month + 1} 月`;
        daysContainer.innerHTML = '';

        // 取得該月的第一天是星期幾
        const firstDayIndex = new Date(year, month, 1).getDay();
        // 取得該月總天數
        const totalDays = new Date(year, month + 1, 0).getDate();
        // 取得上個月總天數
        const prevTotalDays = new Date(year, month, 0).getDate();

        // 渲染上個月的尾巴
        for (let i = firstDayIndex - 1; i >= 0; i--) {
            const dayNum = prevTotalDays - i;
            const cell = document.createElement('div');
            cell.className = 'calendar-day-cell prev-next-month-day';
            cell.style.opacity = '0.3';
            cell.innerText = dayNum;
            // 點擊上個月的日期也可以選擇
            cell.onclick = () => selectDateAndClose(new Date(year, month - 1, dayNum));
            daysContainer.appendChild(cell);
        }

        // 渲染當月的所有天
        const today = new Date();
        for (let day = 1; day <= totalDays; day++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day-cell current-month';
            cell.innerText = day;

            const cellDate = new Date(year, month, day);

            // 判斷是否為「今天」
            if (cellDate.toDateString() === today.toDateString()) {
                cell.classList.add('today-cell');
            }

            // 判斷是否被選中
            if (selectedDate && cellDate.toDateString() === selectedDate.toDateString()) {
                cell.classList.add('selected');
            }

            cell.onclick = () => selectDateAndClose(cellDate);
            daysContainer.appendChild(cell);
        }

        // 渲染下個月的開頭 (補滿整排，通常日曆有 42 格)
        const renderedCount = firstDayIndex + totalDays;
        const totalGridCells = 42;
        for (let i = 1; i <= (totalGridCells - renderedCount); i++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day-cell prev-next-month-day';
            cell.style.opacity = '0.3';
            cell.innerText = i;
            cell.onclick = () => selectDateAndClose(new Date(year, month + 1, i));
            daysContainer.appendChild(cell);
        }
    }

    function selectDateAndClose(date) {
        selectedDate = date;
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        inputEl.value = `${yyyy}-${mm}-${dd}`;
        
        closeCalendar();
        if (onSelectCallback) onSelectCallback(`${yyyy}-${mm}-${dd}`);
    }

    function clearDate() {
        selectedDate = null;
        inputEl.value = '';
        closeCalendar();
        if (onSelectCallback) onSelectCallback('');
    }

    function selectToday() {
        selectDateAndClose(new Date());
    }

    function toggleCalendar() {
        calendarEl.classList.toggle('active');
    }

    function closeCalendar() {
        calendarEl.classList.remove('active');
    }

    // 點選輸入框開啟日曆
    inputEl.addEventListener('click', (e) => {
        e.stopPropagation();
        // 如果輸入框有值，嘗試將選取點對齊該日期
        if (inputEl.value) {
            const parts = inputEl.value.split('-');
            if (parts.length === 3) {
                const parseDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                if (!isNaN(parseDate)) {
                    selectedDate = parseDate;
                    currentDate = new Date(parseDate.getFullYear(), parseDate.getMonth(), 1);
                }
            }
        }
        renderDays();
        toggleCalendar();
    });

    // 防止點擊日曆主體關閉日曆
    calendarEl.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // 點擊外面任何地方關閉日曆
    document.addEventListener('click', () => {
        closeCalendar();
    });

    // 月份切換事件
    btnPrev.onclick = () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderDays();
    };

    btnNext.onclick = () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderDays();
    };

    btnClear.onclick = clearDate;
    btnToday.onclick = selectToday;

    // 提供外部方法設定或清除值
    return {
        setValue: (dateStr) => {
            if (dateStr) {
                inputEl.value = dateStr;
                const parts = dateStr.split('-');
                if (parts.length === 3) {
                    const parseDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                    if (!isNaN(parseDate)) {
                        selectedDate = parseDate;
                        currentDate = new Date(parseDate.getFullYear(), parseDate.getMonth(), 1);
                        return;
                    }
                }
            }
            selectedDate = null;
            inputEl.value = '';
        },
        getValue: () => inputEl.value,
        close: closeCalendar
    };
}
