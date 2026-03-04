// 1. Configuration
const STORAGE_KEY = "my_habits_data";
const LOGIN_KEY = "is_user_logged_in";
const GOOGLE_SCRIPT_URL = "https://zachaminer.github.io/Habit-Tracker/"; 

// Global for calendar and selected date
let currentCalendarDate = new Date(); // For calendar view
let selectedDate = new Date(); // For the currently active date in the date bar
let selectedColor = "#E44332"; // Default color
let datePickerTarget = null; // 'startDate', 'endDate', or null (default)

// 2. Initialization
window.addEventListener('DOMContentLoaded', () => {
    initDates();
    if (checkLogin()) { loadHabits(); }
    renderCalendar(currentCalendarDate); // Render calendar initially (hidden)
    initSwipe(); // Initialize swipe gestures
});

// 3. Authentication Logic
function checkLogin() {
    const isLoggedIn = localStorage.getItem(LOGIN_KEY);
    if (isLoggedIn === "true") return true;

    const pin = prompt("Enter your private PIN to access habits:");
    if (pin === "1234") { // Change your PIN here
        localStorage.setItem(LOGIN_KEY, "true");
        return true;
    } else {
        alert("Wrong PIN");
        window.location.reload();
        return false;
    }
}

// 4. Data Management
async function loadHabits() {
    const container = document.getElementById('habitList');
    
    // Step A: Load from Cache (Immediate)
    const cachedData = localStorage.getItem(STORAGE_KEY);
    if (cachedData) {
        renderAll(JSON.parse(cachedData));
    }

    // Step B: Fetch from Cloud (Background)
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        const freshData = await response.json();
        
        // Only update if data is different or cache was empty
        localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData));
        renderAll(freshData);
    } catch (e) {
        console.warn("Offline mode or Script URL not set. Using cache.");
        if (!cachedData) {
            container.innerHTML = `<p style="text-align:center; color:#999; margin-top:50px;">Connect to internet to load habits.</p>`;
        }
    }
}

function renderAll(habits) {
    const container = document.getElementById('habitList');
    container.innerHTML = ""; 
    habits.forEach(h => {
        // Handle both old array format [name, status] and new object format
        const name = Array.isArray(h) ? h[0] : h.name;
        renderHabitRow(name);
    });
}

// -------------------------------------
// Add Habit Logic
// -------------------------------------

async function addNewHabitFromForm() {
    const nameInput = document.getElementById('newHabitName');
    const name = nameInput.value.trim();
    if (!name) { alert("Habit name cannot be empty."); return; }

    // Gather new fields
    const frequency = document.getElementById('frequencySelect').value;
    const startDate = document.getElementById('startDate').dataset.value; // Use data attribute for ISO date
    const hasEnd = document.getElementById('hasEndDate').checked;
    const endDate = hasEnd ? document.getElementById('endDate').dataset.value : null;
    
    // Gather selected days if frequency is weekly
    let days = [];
    if (frequency === 'weekly') {
        const dayEls = document.querySelectorAll('.day-circle');
        dayEls.forEach((el, index) => {
            if (el.classList.contains('selected')) days.push(index);
        });
    }

    const habitData = {
        name,
        color: selectedColor,
        frequency,
        days,
        startDate,
        endDate,
        status: "Active"
    };

    // 1. Update UI immediately
    renderHabitRow(name);

    // 2. Update Local Cache
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    // Store full object now, but keep backward compatibility if needed by checking type in render
    current.push(habitData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));

    // 3. Send to Google Sheets
    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify({ name: name }),
        });
    } catch (e) {
        console.error("Failed to sync new habit to cloud.");
    }
    nameInput.value = ''; // Clear the input
    toggleAddHabitPopup(); // Close popup
}

function toggleAddHabitPopup() {
    const popup = document.getElementById('addHabitPopup');
    popup.classList.toggle('active');
    
    // Reset form defaults when opening
    if (popup.classList.contains('active')) {
        // Set default start date to today
        updateDateInput('startDate', new Date());
        document.getElementById('hasEndDate').checked = false;
        toggleEndDate(); // Hide end date input
    }
}

function selectColor(el, color) {
    document.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedColor = color;
}

function toggleDaySelection() {
    const val = document.getElementById('frequencySelect').value;
    const daySelector = document.getElementById('daySelection');
    if (val === 'weekly') {
        daySelector.classList.remove('hidden');
    } else {
        daySelector.classList.add('hidden');
    }
}

function toggleDay(el) {
    el.classList.toggle('selected');
}

function openDatePicker(target) {
    datePickerTarget = target;
    toggleCalendarPopup();
}

function updateDateInput(id, date) {
    const el = document.getElementById(id);
    // Store ISO string for logic
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    el.dataset.value = `${y}-${m}-${d}`;
    // Show pretty string for user
    el.value = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function toggleEndDate() {
    const checkbox = document.getElementById('hasEndDate');
    const dateInput = document.getElementById('endDate');
    
    if (checkbox.checked) dateInput.classList.remove('hidden');
    else dateInput.classList.add('hidden');
}

function renderHabitRow(name) {
    const row = document.createElement('div');
    row.className = 'habit-row';
    row.innerHTML = `
        <div class="check-circle" onclick="toggleCheck(this)"></div>
        <div style="flex:1">${name}</div>
        <i class="material-icons" style="color:#ddd">more_horiz</i>
    `;
    document.getElementById('habitList').appendChild(row);
}

function toggleCheck(el) {
    el.classList.toggle('completed');
    el.innerHTML = el.classList.contains('completed') ? 
        '<i class="material-icons" style="font-size:14px">done</i>' : '';
}

// 5. UI Logic (Dates & Tabs)
// 5. UI Logic (Dates & Tabs & Calendar)
function initDates(baseDate = new Date()) {
    selectedDate = new Date(baseDate); // Update selectedDate
    const bar = document.getElementById('dateBar');
    bar.innerHTML = '';
    for(let i = -2; i <= 8; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        const item = document.createElement('div');
        // Compare full dates for active state
        const isActive = d.toDateString() === selectedDate.toDateString();
        item.className = 'date-item' + (isActive ? ' active' : '');
        item.onclick = () => {
            document.querySelectorAll('.date-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            selectedDate = new Date(d); // Update selectedDate when a date-item is clicked
            updateTitle(d);
            if (document.getElementById('calendarPopup').classList.contains('active')) { renderCalendar(currentCalendarDate); } // Re-render calendar if open
        };
        item.innerHTML = `<span>${d.toLocaleDateString('en-US',{weekday:'short'})}</span><strong>${d.getDate()}</strong>`;
        bar.appendChild(item);
    }
}

function jumpToDate(val) {
    if(!val) return;
    const newDate = new Date(val + "T00:00:00");
    initDates(newDate);
    updateTitle(newDate);
}

function goToToday() {
    const today = new Date();
    currentCalendarDate = new Date(today);
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    jumpToDate(`${y}-${m}-${d}`);
    toggleCalendarPopup();
}

function updateTitle(date) {
    const today = new Date().toDateString();
    document.getElementById('currentDateLabel').innerText = 
        (date.toDateString() === today) ? "Today" : date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function switchTab(tab) {
    const isH = tab === 'habits'; // Habits tab
    const isS = tab === 'stats';   // Stats tab

    document.getElementById('habitList').classList.toggle('hidden', !isH);
    document.getElementById('statsPage').classList.toggle('hidden', !isS);
    document.getElementById('tabH').classList.toggle('active', isH);
    document.getElementById('tabS').classList.toggle('active', isS);
}


// -------------------------------------
// Calendar Popup Logic
// -------------------------------------

let isAnimating = false;

/**
 * Toggle the visibility of the calendar popup. When opening, ensure
 * the calendar is rendered for the current view date.
 */
function toggleCalendarPopup() {
    const popup = document.getElementById('calendarPopup');
    popup.classList.toggle('active');
    if (popup.classList.contains('active')) {
        // Reset animation state in case it was closed mid-animation
        const daysContainer = document.getElementById('calendarDays');
        daysContainer.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right');
        isAnimating = false;
        renderCalendar(currentCalendarDate);
    }
}

/**
 * Adjust the month being displayed in the calendar.
 * @param {number} dir - +1 to move forward, -1 to move back.
 */
function changeMonth(dir) {
    if (isAnimating) return;
    isAnimating = true;

    const daysContainer = document.getElementById('calendarDays');
    
    // 1. Exit Animation
    const exitClass = dir > 0 ? 'slide-out-left' : 'slide-out-right';
    daysContainer.classList.add(exitClass);

    // 2. Wait for exit to finish
    setTimeout(() => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + dir);
        renderCalendar(currentCalendarDate);

        // 3. Remove Exit, Add Enter
        daysContainer.classList.remove(exitClass);
        const enterClass = dir > 0 ? 'slide-in-right' : 'slide-in-left';
        daysContainer.classList.add(enterClass);

        // 4. Cleanup after enter finishes
        setTimeout(() => {
            daysContainer.classList.remove(enterClass);
            isAnimating = false;
        }, 200); 
    }, 200);
}

/**
 * Build the calendar grid for the given date's month/year.
 * Clicking a day will update the selected date and close the popup.
 * @param {Date} date
 */
function renderCalendar(date) {
    const daysContainer = document.getElementById('calendarDays');
    const monthYearLabel = document.getElementById('currentMonthYear');
    const year = date.getFullYear();
    const month = date.getMonth();

    monthYearLabel.textContent = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    daysContainer.innerHTML = '';

    // Determine start day and total days in month
    const firstDay = new Date(year, month, 1);
    const startDayIndex = firstDay.getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Blank slots for days before the first
    for (let i = 0; i < startDayIndex; i++) {
        const blank = document.createElement('div');
        blank.className = 'calendar-day-item inactive';
        daysContainer.appendChild(blank);
    }

    // Actual days
    for (let d = 1; d <= daysInMonth; d++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day-item';
        if (selectedDate.getFullYear() === year && selectedDate.getMonth() === month && selectedDate.getDate() === d) {
            dayEl.classList.add('selected');
        }
        dayEl.textContent = d;
        dayEl.onclick = () => {
            const clickedDate = new Date(year, month, d);
            if (datePickerTarget) {
                updateDateInput(datePickerTarget, clickedDate);
                datePickerTarget = null; // Reset target
            } else {
                selectedDate = clickedDate;
                initDates(selectedDate);
                updateTitle(selectedDate);
            }
            toggleCalendarPopup(); // Close calendar
        };
        daysContainer.appendChild(dayEl);
    }
}

function initSwipe() {
    const el = document.getElementById('calendarPopup');
    let startX = 0;
    
    el.addEventListener('touchstart', e => {
        startX = e.changedTouches[0].screenX;
    }, {passive: true});

    el.addEventListener('touchend', e => {
        const endX = e.changedTouches[0].screenX;
        if (startX - endX > 50) changeMonth(1); // Swipe Left -> Next Month
        if (endX - startX > 50) changeMonth(-1); // Swipe Right -> Prev Month
    }, {passive: true});
}
