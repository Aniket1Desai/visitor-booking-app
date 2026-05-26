/**
 * Core Front-End Web Application Logic
 * Client-Side Router, Dynamic Scheduling Grid, Live SQL Audit Logger,
 * and Dual-Mode Execution Engine (Node.js API vs. LocalStorage SQL Simulator).
 *
 * FIXES APPLIED:
 * 1. refreshSchemes() now returns SQL trace so refreshData() can include it in the audit log
 * 2. populateSchemesDropdown() is called inside refreshSchemes() after allSchemes is set — no more race condition
 * 3. submitScheme() no longer calls full refreshData() (avoids double-fetch + log overwrite);
 *    it calls refreshSchemes() directly, then logs only the scheme SQL
 * 4. resetBookingForm() no longer calls populateSchemesDropdown() directly (refreshSchemes handles it)
 * 5. Visitor booking form scheme dropdown now always reflects latest DB/LocalStorage state
 * 6. showSection('booking-section') now calls refreshSchemes() so visitor always sees latest schemes
 */

// Global State
let currentStep = 1;
const bookingData = {
    visitor_name: '',
    visitor_email: '',
    visitor_phone: '',
    booking_date: '',
    booking_time: '',
    visitor_count: 2,
    special_requests: ''
};

// Available daily time-slots
const timeSlots = [
    "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
    "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"
];

let allBookings = [];
let isStandaloneMode = false;
let apiBaseUrl = '';
let currentRole = 'visitor';
let allSchemes = [];
let visitorMap = null;
let adminMap = null;
const estateCoords = [18.9543, 72.8088];

// -------------------------------------------------------------
// Initialization & Startup
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initDatePickers();
    initTheme();
    initRole();
    detectEngineModeAndLoad();
    setupNavigationListeners();
    setupScrollEffects();
    setupRoleDropdownCloseListener();
});

function initDatePickers() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 30);

    const tomString = tomorrow.toISOString().split('T')[0];
    const maxString = maxDate.toISOString().split('T')[0];

    const dateInput = document.getElementById('booking_date');
    const reschedInput = document.getElementById('reschedule-date');

    if (dateInput) {
        dateInput.min = tomString;
        dateInput.max = maxString;
        dateInput.value = tomString;
        bookingData.booking_date = tomString;
        dateInput.addEventListener('change', onDateChange);
    }

    if (reschedInput) {
        reschedInput.min = tomString;
        reschedInput.max = maxString;
    }
}

async function detectEngineModeAndLoad() {
    const indicator = document.getElementById('sql-engine-indicator');

    try {
        indicator.textContent = "Connecting...";
        const res = await fetch('/api/stats');
        if (res.ok) {
            isStandaloneMode = false;
            indicator.textContent = "MySQL Server Backend";
            indicator.style.background = "rgba(6, 182, 212, 0.15)";
            indicator.style.borderColor = "var(--accent-cyan)";
            indicator.style.color = "var(--accent-cyan)";
        } else {
            throw new Error("Server returned error status");
        }
    } catch (err) {
        isStandaloneMode = true;
        indicator.textContent = "SQL Simulator (Offline)";
        indicator.style.background = "rgba(236, 72, 153, 0.15)";
        indicator.style.borderColor = "var(--accent-pink)";
        indicator.style.color = "var(--accent-pink)";

        if (!localStorage.getItem('mock_bookings')) {
            localStorage.setItem('mock_bookings', JSON.stringify(getMockSeedData()));
        }
        if (!localStorage.getItem('mock_schemes')) {
            localStorage.setItem('mock_schemes', JSON.stringify(getMockSchemesSeedData()));
        }
    }

    await refreshData();
    renderTimeSlots('booking_date', 'slots-container', 'selected_time');
}

function getMockSeedData() {
    return [];
}

function getOffsetDateString(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

// -------------------------------------------------------------
// Routing & Navigation Systems
// -------------------------------------------------------------
function setupNavigationListeners() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-target');
            showSection(target);
        });
    });
}

function showSection(sectionId) {
    if (currentRole === 'visitor' && (sectionId === 'dashboard-section' || sectionId === 'admin-schemes-section' || sectionId === 'troubleshoot-section')) {
        sectionId = 'hero-section';
    }
    if (currentRole === 'admin' && sectionId === 'booking-section') {
        sectionId = 'dashboard-section';
    }

    document.querySelectorAll('.app-section').forEach(sec => {
        sec.classList.remove('active');
        if (sec.classList.contains('admin-only') && currentRole !== 'admin') {
            sec.style.display = 'none';
        } else if (sec.classList.contains('visitor-only') && currentRole !== 'visitor') {
            sec.style.display = 'none';
        } else {
            sec.style.display = '';
        }
    });

    const activeSec = document.getElementById(sectionId);
    if (activeSec) {
        activeSec.classList.add('active');
        activeSec.style.display = 'block';
    }

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-target') === sectionId) {
            link.classList.add('active');
        }
    });

    if (sectionId === 'dashboard-section') {
        refreshData();
    }

    // FIX: Refresh schemes when visitor navigates to booking section
    // so the dropdown always contains the latest schemes added by admin
    if (sectionId === 'booking-section') {
        refreshSchemes();
    }

    if (sectionId === 'location-section') {
        setTimeout(() => {
            initVisitorMap();
            if (visitorMap) visitorMap.invalidateSize();
        }, 100);
    } else if (sectionId === 'dashboard-section') {
        setTimeout(() => {
            initAdminMap();
            if (adminMap) adminMap.invalidateSize();
        }, 100);
    } else if (sectionId === 'troubleshoot-section') {
        setTimeout(() => runTroubleshootDiagnostic(), 200);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupScrollEffects() {
    window.addEventListener('scroll', () => {
        const nav = document.querySelector('.glass-nav');
        if (window.scrollY > 50) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    });
}

// -------------------------------------------------------------
// Interactive Calendar & Slot Renderer
// -------------------------------------------------------------
function onDateChange(e) {
    bookingData.booking_date = e.target.value;
    renderTimeSlots('booking_date', 'slots-container', 'selected_time');
}

function onRescheduleDateChange() {
    renderTimeSlots('reschedule-date', 'reschedule-slots-container', 'reschedule-selected-time');
}

function renderTimeSlots(dateInputId, containerId, hiddenInputId) {
    const dateVal = document.getElementById(dateInputId).value;
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(hiddenInputId);

    if (!dateVal || !container) return;

    container.innerHTML = '';
    hiddenInput.value = '';

    const bookedTimes = allBookings
        .filter(b => b.booking_date === dateVal && b.status !== 'Cancelled')
        .map(b => b.booking_time);

    timeSlots.forEach(slot => {
        const slotEl = document.createElement('div');
        slotEl.className = 'time-slot';

        const isBooked = bookedTimes.includes(slot);

        if (isBooked) {
            slotEl.classList.add('booked');
            slotEl.innerHTML = `<i class="fa-solid fa-lock"></i> ${slot}`;
        } else {
            slotEl.innerHTML = `<i class="fa-solid fa-clock"></i> ${slot}`;
            slotEl.addEventListener('click', () => {
                container.querySelectorAll('.time-slot').forEach(el => el.classList.remove('selected'));
                slotEl.classList.add('selected');
                hiddenInput.value = slot;
                if (hiddenInputId === 'selected_time') {
                    bookingData.booking_time = slot;
                }
            });
        }

        container.appendChild(slotEl);
    });
}

// -------------------------------------------------------------
// Multi-Step Form Logic
// -------------------------------------------------------------
function nextStep(step) {
    if (step === 2) {
        bookingData.visitor_name = document.getElementById('visitor_name').value.trim();
        bookingData.visitor_email = document.getElementById('visitor_email').value.trim();
        bookingData.visitor_phone = document.getElementById('visitor_phone').value.trim();
        bookingData.visitor_count = parseInt(document.getElementById('visitor_count').value);
        bookingData.scheme_name = document.getElementById('booking_scheme').value;
    }

    if (step === 3) {
        bookingData.special_requests = document.getElementById('special_requests').value.trim();
        document.getElementById('sum-name').textContent = bookingData.visitor_name;
        document.getElementById('sum-count').textContent = bookingData.visitor_count;
        document.getElementById('sum-email').textContent = bookingData.visitor_email;
        document.getElementById('sum-phone').textContent = bookingData.visitor_phone;
        document.getElementById('sum-date').textContent = formatDate(bookingData.booking_date);
        document.getElementById('sum-time').textContent = bookingData.booking_time;
        document.getElementById('sum-scheme').textContent = bookingData.scheme_name || '-';
    }

    currentStep = step;
    updateStepUI();
}

function prevStep(step) {
    currentStep = step;
    updateStepUI();
}

function validateStep2AndContinue() {
    const timeVal = document.getElementById('selected_time').value;
    if (!timeVal) {
        showToast("Time Slot Required", "Please select a preferred viewing time slot before continuing.", "error");
        return;
    }
    nextStep(3);
}

function updateStepUI() {
    document.querySelectorAll('.booking-step').forEach(step => {
        step.classList.remove('active');
    });

    const activeStepEl = document.getElementById(`booking-step-${currentStep}`);
    if (activeStepEl) activeStepEl.classList.add('active');

    for (let i = 1; i <= 3; i++) {
        const dot = document.getElementById(`step-dot-${i}`);
        const line = document.getElementById(`step-line-${i - 1}`);

        if (dot) dot.className = 'step-indicator';
        if (line) line.className = 'step-line';

        if (i < currentStep) {
            if (dot) dot.classList.add('completed');
            if (line) line.classList.add('completed');
        } else if (i === currentStep) {
            if (dot) dot.classList.add('active');
        }
    }
}

// -------------------------------------------------------------
// Core Database Operation Triggers
// -------------------------------------------------------------

async function refreshData() {
    try {
        let bookingsRes, statsRes;
        let sqlTrace = '';
        let engineName = '';

        // FIX: refreshSchemes returns its SQL trace; we append it to the combined audit log
        const schemesSqlTrace = await refreshSchemes();

        if (!isStandaloneMode) {
            const bRes = await fetch('/api/bookings');
            bookingsRes = await bRes.json();

            const sRes = await fetch('/api/stats');
            statsRes = await sRes.json();

            allBookings = bookingsRes.data;
            // FIX: Combined audit log now includes schemes SQL alongside bookings+stats
            sqlTrace = bookingsRes.sqlQuery + '\n\n' + statsRes.sqlQuery + '\n\n' + schemesSqlTrace;
            engineName = bookingsRes.engine;
        } else {
            const mockBookings = JSON.parse(localStorage.getItem('mock_bookings') || '[]');

            mockBookings.sort((a, b) => {
                if (a.booking_date !== b.booking_date) {
                    return b.booking_date.localeCompare(a.booking_date);
                }
                return a.booking_time.localeCompare(b.booking_time);
            });
            allBookings = mockBookings;

            const todayStr = new Date().toISOString().split('T')[0];
            const activeTours = mockBookings.filter(b => b.booking_date >= todayStr && b.status !== 'Cancelled').length;
            const cancelledCount = mockBookings.filter(b => b.status === 'Cancelled').length;
            const visitorTotal = mockBookings.reduce((acc, curr) => acc + (curr.visitor_count || 0), 0);

            statsRes = {
                stats: {
                    totalBookings: mockBookings.length,
                    totalVisitors: visitorTotal,
                    upcomingTours: activeTours,
                    cancelledBookings: cancelledCount
                }
            };

            sqlTrace = `SELECT * FROM bookings ORDER BY booking_date DESC, booking_time ASC;\n\n` +
                `SELECT COUNT(*) as totalBookings, SUM(visitor_count) as totalVisitors,\n` +
                `       SUM(CASE WHEN booking_date >= CAST(GETDATE() AS DATE) AND status != 'Cancelled' THEN 1 ELSE 0 END) as upcomingTours,\n` +
                `       SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelledBookings FROM bookings;\n\n` +
                schemesSqlTrace;
            engineName = 'Simulated SQL Sandbox (LocalStorage)';
        }

        document.getElementById('stat-total-bookings').textContent = statsRes.stats.totalBookings;
        document.getElementById('stat-total-visitors').textContent = statsRes.stats.totalVisitors;
        document.getElementById('stat-upcoming').textContent = statsRes.stats.upcomingTours;
        document.getElementById('stat-cancelled').textContent = statsRes.stats.cancelledBookings;

        renderBookingsTable();
        logSqlQuery(sqlTrace, engineName);

    } catch (err) {
        console.error('Refresh operations failed', err);
        showToast("Sync Error", "Failed to retrieve live bookings information.", "error");
    }
}

async function submitBooking() {
    const btnSubmit = document.getElementById('btn-submit-booking');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Submitting...`;

    try {
        let result;
        if (!isStandaloneMode) {
            const response = await fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData)
            });

            if (response.status === 409) throw new Error("This date and time slot is already booked.");
            if (!response.ok) throw new Error("Server submission error");
            result = await response.json();
        } else {
            const mockBookings = JSON.parse(localStorage.getItem('mock_bookings') || '[]');
            const isConflict = mockBookings.some(b =>
                b.booking_date === bookingData.booking_date &&
                b.booking_time === bookingData.booking_time &&
                b.status !== 'Cancelled'
            );

            if (isConflict) throw new Error("This date and time slot is already booked.");

            const nextId = mockBookings.length > 0 ? Math.max(...mockBookings.map(b => b.id)) + 1 : 1;
            const newRecord = {
                id: nextId,
                ...bookingData,
                status: 'Confirmed',
                created_at: new Date().toISOString()
            };

            mockBookings.push(newRecord);
            localStorage.setItem('mock_bookings', JSON.stringify(mockBookings));

            const simulatedSql = `INSERT INTO bookings (visitor_name, visitor_email, visitor_phone, booking_date, booking_time, visitor_count, scheme_name, special_requests, status)\nVALUES ('${bookingData.visitor_name}', '${bookingData.visitor_email}', '${bookingData.visitor_phone}', '${bookingData.booking_date}', '${bookingData.booking_time}', ${bookingData.visitor_count}, '${bookingData.scheme_name}', ${bookingData.special_requests ? `'${bookingData.special_requests}'` : 'NULL'}, 'Confirmed');`;

            result = {
                booking: newRecord,
                sqlQuery: simulatedSql,
                engine: 'Simulated SQL Sandbox (LocalStorage)'
            };
        }

        document.getElementById('success-date-time').textContent = `${formatDate(bookingData.booking_date)} at ${bookingData.booking_time}`;
        currentStep = 'success';
        updateStepUI();
        showToast("Booking Successful", "Viewing tour successfully reserved.", "success");

        allBookings.push(result.booking);
        refreshData();
        openSqlConsole();

    } catch (err) {
        showToast("Booking Failed", err.message, "error");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i class="fa-solid fa-check"></i> Book Private Tour`;
    }
}

// -------------------------------------------------------------
// Rescheduling Booking System Modal
// -------------------------------------------------------------
function openRescheduleModal(id, date, time) {
    const modal = document.getElementById('reschedule-modal');
    document.getElementById('reschedule-booking-id').value = id;
    document.getElementById('reschedule-date').value = date;
    modal.classList.add('open');
    renderTimeSlots('reschedule-date', 'reschedule-slots-container', 'reschedule-selected-time');
}

function closeRescheduleModal() {
    document.getElementById('reschedule-modal').classList.remove('open');
}

async function submitReschedule() {
    const bookingId = document.getElementById('reschedule-booking-id').value;
    const newDate = document.getElementById('reschedule-date').value;
    const newTime = document.getElementById('reschedule-selected-time').value;
    const btnRes = document.getElementById('btn-confirm-reschedule');

    if (!newTime) {
        showToast("Time Required", "Please choose an available tour time slot.", "error");
        return;
    }

    btnRes.disabled = true;
    btnRes.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...`;

    try {
        let result;
        if (!isStandaloneMode) {
            const response = await fetch(`/api/bookings/${bookingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ booking_date: newDate, booking_time: newTime })
            });

            if (response.status === 409) throw new Error("The selected new time slot is already booked.");
            if (!response.ok) throw new Error("Failed to reschedule viewing on server.");
            result = await response.json();
        } else {
            const mockBookings = JSON.parse(localStorage.getItem('mock_bookings') || '[]');
            const isConflict = mockBookings.some(b =>
                b.booking_date === newDate &&
                b.booking_time === newTime &&
                b.id !== parseInt(bookingId) &&
                b.status !== 'Cancelled'
            );

            if (isConflict) throw new Error("The selected new time slot is already booked.");

            const recordIdx = mockBookings.findIndex(b => b.id === parseInt(bookingId));
            if (recordIdx === -1) throw new Error("Booking record not found.");

            mockBookings[recordIdx].booking_date = newDate;
            mockBookings[recordIdx].booking_time = newTime;
            mockBookings[recordIdx].status = 'Rescheduled';
            localStorage.setItem('mock_bookings', JSON.stringify(mockBookings));

            result = {
                sqlQuery: `UPDATE bookings\nSET booking_date = '${newDate}', booking_time = '${newTime}', status = 'Rescheduled'\nWHERE id = ${bookingId};`,
                engine: 'Simulated SQL Sandbox (LocalStorage)'
            };
        }

        closeRescheduleModal();
        showToast("Tour Rescheduled", `Rescheduled successfully to ${formatDate(newDate)} at ${newTime}.`, "success");
        refreshData();
        openSqlConsole();

    } catch (err) {
        showToast("Reschedule Failed", err.message, "error");
    } finally {
        btnRes.disabled = false;
        btnRes.innerHTML = `Confirm Reschedule`;
    }
}

// -------------------------------------------------------------
// Soft Cancellation Trigger
// -------------------------------------------------------------
async function cancelBooking(id, name) {
    if (!confirm(`Are you sure you want to cancel the viewing tour scheduled for ${name}?`)) return;

    try {
        let result;
        if (!isStandaloneMode) {
            const response = await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error("Server cancellation request failed.");
            result = await response.json();
        } else {
            const mockBookings = JSON.parse(localStorage.getItem('mock_bookings') || '[]');
            const recordIdx = mockBookings.findIndex(b => b.id === parseInt(id));
            if (recordIdx === -1) throw new Error("Record not found.");

            mockBookings[recordIdx].status = 'Cancelled';
            localStorage.setItem('mock_bookings', JSON.stringify(mockBookings));

            result = {
                sqlQuery: `UPDATE bookings\nSET status = 'Cancelled'\nWHERE id = ${id};`,
                engine: 'Simulated SQL Sandbox (LocalStorage)'
            };
        }

        showToast("Tour Cancelled", `Viewing tour for ${name} has been soft-cancelled.`, "info-theme");
        refreshData();
        openSqlConsole();

    } catch (err) {
        showToast("Cancellation Failed", err.message, "error");
    }
}

// -------------------------------------------------------------
// Dashboard Rendering & Filters
// -------------------------------------------------------------
function renderBookingsTable(filteredBookings = allBookings) {
    const tbody = document.getElementById('bookings-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (filteredBookings.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-5 text-muted">
                    <i class="fa-solid fa-folder-open" style="font-size: 2rem; margin-bottom: 10px; display:block; opacity: 0.5;"></i>
                    No viewing bookings match your search query.
                </td>
            </tr>
        `;
        return;
    }

    filteredBookings.forEach(booking => {
        const tr = document.createElement('tr');

        let badgeClass = 'badge-confirmed';
        if (booking.status === 'Rescheduled') badgeClass = 'badge-rescheduled';
        if (booking.status === 'Cancelled') badgeClass = 'badge-cancelled';

        const requestsStr = booking.special_requests
            ? (booking.special_requests.length > 50 ? booking.special_requests.substring(0, 47) + '...' : booking.special_requests)
            : '<span class="text-muted">None</span>';

        const isCancelled = booking.status === 'Cancelled';

        tr.innerHTML = `
            <td>
                <strong>${formatDate(booking.booking_date)}</strong>
                <div class="input-helper">${booking.booking_time}</div>
            </td>
            <td><strong>${escapeHtml(booking.visitor_name)}</strong></td>
            <td>
                <div><i class="fa-solid fa-envelope text-muted" style="width:16px;"></i> ${escapeHtml(booking.visitor_email)}</div>
                <div class="input-helper"><i class="fa-solid fa-phone text-muted" style="width:16px;"></i> ${escapeHtml(booking.visitor_phone)}</div>
            </td>
            <td><span class="spec-tag">${booking.visitor_count} Guest/s</span></td>
            <td><span class="spec-tag" style="background: rgba(6, 182, 212, 0.08); border-color: rgba(6, 182, 212, 0.2); color: var(--accent-cyan); font-weight: 600;">${escapeHtml(booking.scheme_name || 'Open Nest')}</span></td>
            <td title="${escapeHtml(booking.special_requests || '')}">${escapeHtml(requestsStr)}</td>
            <td><span class="status-badge ${badgeClass}">${booking.status}</span></td>
            <td>
                <div class="actions-cell">
                    <button class="btn-icon btn-resched" title="Reschedule Tour"
                            onclick="openRescheduleModal(${booking.id}, '${booking.booking_date}', '${booking.booking_time}')"
                            ${isCancelled ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
                        <i class="fa-solid fa-clock-rotate-left"></i>
                    </button>
                    <button class="btn-icon btn-cancel" title="Cancel Tour"
                            onclick="cancelBooking(${booking.id}, '${escapeHtml(booking.visitor_name)}')"
                            ${isCancelled ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function filterBookings() {
    const searchVal = document.getElementById('search-input').value.toLowerCase().trim();

    if (!searchVal) {
        renderBookingsTable(allBookings);
        return;
    }

    const filtered = allBookings.filter(b =>
        b.visitor_name.toLowerCase().includes(searchVal) ||
        b.visitor_email.toLowerCase().includes(searchVal) ||
        b.booking_date.includes(searchVal) ||
        (b.special_requests && b.special_requests.toLowerCase().includes(searchVal))
    );

    renderBookingsTable(filtered);
}

// -------------------------------------------------------------
// Visual SQL Query Logging Panel Handler
// -------------------------------------------------------------
function toggleSqlConsole() {
    document.getElementById('sql-console').classList.toggle('closed');
}

function openSqlConsole() {
    document.getElementById('sql-console').classList.remove('closed');
}

function logSqlQuery(rawSql, engineName) {
    const codeEl = document.getElementById('sql-console-code');
    const engineIndicator = document.getElementById('sql-engine-indicator');
    if (!codeEl) return;
    engineIndicator.textContent = engineName;
    codeEl.innerHTML = highlightSqlSyntax(rawSql);
}

function highlightSqlSyntax(sqlText) {
    if (!sqlText) return '';

    let escaped = escapeHtml(sqlText);

    const keywords = [
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'AND', 'OR', 'ORDER BY', 'DESC', 'ASC',
        'VALUES', 'INTO', 'SET', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'SUM', 'COUNT', 'AS', 'OUTPUT', 'INSERTED',
        'CAST', 'GETDATE', 'DATE', 'NVARCHAR', 'VARCHAR', 'INT', 'IDENTITY', 'PRIMARY KEY', 'NOT NULL'
    ];

    escaped = escaped.replace(/(['].*?['])/g, '<span class="sql-string">$1</span>');
    escaped = escaped.replace(/(--.*)/g, '<span class="sql-comment">$1</span>');
    escaped = escaped.replace(/\b(\d+)\b(?![^<]*>)/g, '<span class="sql-number">$1</span>');

    keywords.forEach(keyword => {
        const regex = new RegExp(`\\b(${keyword})\\b(?![^<]*>)`, 'gi');
        escaped = escaped.replace(regex, '<span class="sql-keyword">$1</span>');
    });

    return escaped;
}

async function copyConsoleSql() {
    const codeEl = document.getElementById('sql-console-code');
    try {
        await navigator.clipboard.writeText(codeEl.innerText);
        showToast("Copied!", "SQL statement copied to clipboard.", "success");
    } catch (err) {
        showToast("Copy Failed", "Unable to copy SQL automatically.", "error");
    }
}

// -------------------------------------------------------------
// Interactive UI Helpers
// -------------------------------------------------------------
function resetBookingForm() {
    document.getElementById('details-form').reset();
    document.getElementById('special_requests').value = '';

    bookingData.visitor_name = '';
    bookingData.visitor_email = '';
    bookingData.visitor_phone = '';
    bookingData.visitor_count = 2;
    bookingData.special_requests = '';
    bookingData.scheme_name = '';

    // FIX: Call refreshSchemes() — it fetches fresh data then calls populateSchemesDropdown()
    // internally, eliminating the race condition from the old approach
    refreshSchemes();

    initDatePickers();
    currentStep = 1;
    updateStepUI();
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(parts[1]) - 1]} ${parts[2]}, ${parts[0]}`;
}

function showToast(title, message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-exclamation';
    if (type === 'info-theme') icon = 'fa-circle-info';

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <div class="toast-info">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 400);
    }, 4500);
}

function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// -------------------------------------------------------------
// Theme Management
// -------------------------------------------------------------
function initTheme() {
    const savedTheme = localStorage.getItem('app-theme') || 'dark';
    document.body.className = savedTheme + '-theme';
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');
    const newTheme = isDark ? 'light' : 'dark';
    document.body.className = newTheme + '-theme';
    localStorage.setItem('app-theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (!icon) return;
    icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

// -------------------------------------------------------------
// Role Selection & UI Visibility Routing
// -------------------------------------------------------------
function initRole() {
    applyRoleVisibility();
}

function toggleRoleDropdown(event) {
    event.stopPropagation();
    const container = document.querySelector('.role-selector-container');
    if (container) container.classList.toggle('open');
}

function setupRoleDropdownCloseListener() {
    document.addEventListener('click', (e) => {
        const container = document.querySelector('.role-selector-container');
        if (container && container.classList.contains('open')) {
            if (!container.contains(e.target)) container.classList.remove('open');
        }
    });
}

function switchRole(role) {
    currentRole = role;

    const container = document.querySelector('.role-selector-container');
    if (container) container.classList.remove('open');

    const activeText = document.getElementById('active-role-text');
    const roleIcon = document.getElementById('role-icon');

    if (role === 'admin') {
        if (activeText) activeText.textContent = "Admin Role";
        if (roleIcon) roleIcon.className = "fa-solid fa-user-shield";
        document.getElementById('role-opt-admin').classList.add('active');
        document.getElementById('role-opt-visitor').classList.remove('active');
    } else {
        if (activeText) activeText.textContent = "Visitor Role";
        if (roleIcon) roleIcon.className = "fa-solid fa-user-circle";
        document.getElementById('role-opt-visitor').classList.add('active');
        document.getElementById('role-opt-admin').classList.remove('active');
    }

    applyRoleVisibility();

    const activeLink = document.querySelector('.nav-link.active');
    if (activeLink) {
        const target = activeLink.getAttribute('data-target');
        if (role === 'visitor' && (target === 'dashboard-section' || target === 'admin-schemes-section' || target === 'troubleshoot-section')) {
            showSection('hero-section');
        } else if (role === 'admin' && target === 'booking-section') {
            showSection('dashboard-section');
        }
    }
}

function applyRoleVisibility() {
    document.querySelectorAll('.nav-link.admin-only').forEach(link => {
        link.style.display = (currentRole === 'admin') ? 'flex' : 'none';
    });

    document.querySelectorAll('.nav-link.visitor-only').forEach(link => {
        link.style.display = (currentRole === 'visitor') ? 'flex' : 'none';
    });

    document.querySelectorAll('.admin-only').forEach(el => {
        if (el.tagName !== 'A') {
            if (currentRole !== 'admin') {
                el.style.display = 'none';
            } else {
                el.style.display = el.classList.contains('app-section') ? (el.classList.contains('active') ? 'block' : 'none') : '';
            }
        }
    });

    document.querySelectorAll('.visitor-only').forEach(el => {
        if (el.tagName !== 'A') {
            if (currentRole !== 'visitor') {
                el.style.display = 'none';
            } else {
                el.style.display = el.classList.contains('app-section') ? (el.classList.contains('active') ? 'block' : 'none') : '';
            }
        }
    });

    const reserveBtn = document.getElementById('header-reserve-btn');
    if (reserveBtn) reserveBtn.style.display = (currentRole === 'visitor') ? '' : 'none';
}

// -------------------------------------------------------------
// Property Schemes Management System
// -------------------------------------------------------------

// FIX: refreshSchemes() now returns the SQL trace string.
// - populateSchemesDropdown() is called synchronously right after allSchemes is set
// - No more race condition: dropdown always reflects current data
// - Callers decide whether/how to surface the SQL in the audit log
async function refreshSchemes() {
    let sqlTrace = '';
    try {
        if (!isStandaloneMode) {
            const res = await fetch('/api/schemes');
            if (!res.ok) throw new Error("Server returned invalid schemes response.");
            const schemesRes = await res.json();
            allSchemes = schemesRes.data;
            sqlTrace = schemesRes.sqlQuery;
        } else {
            const mockSchemes = JSON.parse(localStorage.getItem('mock_schemes') || '[]');
            allSchemes = mockSchemes;
            sqlTrace = `SELECT id, name, price, viewing_rules, description FROM schemes ORDER BY id ASC;`;
        }

        // FIX: Always populate dropdown immediately after allSchemes is updated
        populateSchemesDropdown();
        renderSchemesTable();

    } catch (err) {
        console.error("Refresh schemes pipeline failed:", err);
        showToast("Schemes Sync Error", "Failed to retrieve active villa schemes from database.", "error");
    }

    return sqlTrace;
}

function populateSchemesDropdown() {
    const dropdown = document.getElementById('booking_scheme');
    if (!dropdown) return;

    // FIX: Preserve existing selection if that scheme still exists
    const previousValue = dropdown.value;

    dropdown.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = 'Select House Scheme / Property *';
    dropdown.appendChild(placeholder);

    allSchemes.forEach(s => {
        const option = document.createElement('option');
        option.value = s.name;
        option.textContent = `${s.name} (${s.price})`;
        dropdown.appendChild(option);
    });

    // Restore prior selection if still valid
    if (previousValue && allSchemes.some(s => s.name === previousValue)) {
        dropdown.value = previousValue;
    }
}

function renderSchemesTable() {
    const tbody = document.getElementById('schemes-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (allSchemes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-4 text-muted">
                    No active property viewing tiers mapped in database.
                </td>
            </tr>
        `;
        return;
    }

    allSchemes.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(s.name)}</strong></td>
            <td><span class="spec-tag" style="font-weight:600; color:var(--accent-cyan); border-color:rgba(6,182,212,0.25); background:rgba(6,182,212,0.06);">${escapeHtml(s.price)}</span></td>
            <td>
                <span class="status-badge" style="background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.2); color: var(--accent-violet); font-size: 0.78rem;">
                    <i class="fa-solid fa-shield-halved" style="font-size:0.75rem; margin-right:3px;"></i> ${escapeHtml(s.viewing_rules || 'Pre-cleared VIPs')}
                </span>
            </td>
            <td><div class="input-helper" style="white-space: normal; line-height: 1.4; font-size:0.8rem; color:var(--text-secondary); max-width:280px;">${escapeHtml(s.description || 'Exclusive accompanied tour tier.')}</div></td>
        `;
        tbody.appendChild(tr);
    });
}

async function submitScheme(e) {
    e.preventDefault();

    const nameInput = document.getElementById('scheme_name_input');
    const priceInput = document.getElementById('scheme_price_input');
    const rulesInput = document.getElementById('scheme_rules_input');
    const descInput = document.getElementById('scheme_desc_input');
    const btnSubmit = document.getElementById('btn-submit-scheme');

    const name = nameInput.value.trim();
    const price = priceInput.value.trim();
    const viewing_rules = rulesInput.value.trim();
    const description = descInput.value.trim();

    if (!name || !price) {
        showToast("Validation Error", "Property scheme name and pricing label are required fields.", "error");
        return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Registering...`;

    try {
        let result;
        if (!isStandaloneMode) {
            const response = await fetch('/api/schemes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, price, viewing_rules, description })
            });

            if (response.status === 409) throw new Error("A scheme with this property name already exists.");
            if (!response.ok) throw new Error("Server rejected property scheme insertion.");
            result = await response.json();
        } else {
            const mockSchemes = JSON.parse(localStorage.getItem('mock_schemes') || '[]');
            const isConflict = mockSchemes.some(s => s.name.toLowerCase() === name.toLowerCase());

            if (isConflict) throw new Error("A scheme with this property name already exists.");

            const nextId = mockSchemes.length > 0 ? Math.max(...mockSchemes.map(s => s.id)) + 1 : 1;
            const newRecord = { id: nextId, name, price, viewing_rules, description };

            mockSchemes.push(newRecord);
            localStorage.setItem('mock_schemes', JSON.stringify(mockSchemes));

            const simulatedSql = `INSERT INTO schemes (name, price, viewing_rules, description)\nVALUES ('${name}', '${price}', ${viewing_rules ? `'${viewing_rules}'` : 'NULL'}, ${description ? `'${description}'` : 'NULL'});`;

            result = {
                scheme: newRecord,
                sqlQuery: simulatedSql,
                engine: 'Simulated SQL Sandbox (LocalStorage)'
            };
        }

        showToast("Scheme Added", `Property "${name}" successfully registered in system.`, "success");
        document.getElementById('scheme-creation-form').reset();

        // FIX: Only call refreshSchemes() — not full refreshData()
        // This avoids double-fetching bookings AND prevents the INSERT SQL from being
        // overwritten by the SELECT audit log that refreshData() would emit
        await refreshSchemes();

        // Show only the scheme INSERT SQL in the audit console
        logSqlQuery(result.sqlQuery, result.engine);
        openSqlConsole();

    } catch (err) {
        showToast("Creation Failed", err.message, "error");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i class="fa-solid fa-plus-circle"></i> Create New Scheme`;
    }
}

function getMockSchemesSeedData() {
    return [];
}

// -------------------------------------------------------------
// Leaflet Map Initialization & Rendering Core
// -------------------------------------------------------------
function initVisitorMap() {
    if (visitorMap) return;
    const container = document.getElementById('visitor-map');
    if (!container) return;

    visitorMap = L.map('visitor-map', { zoomControl: true, attributionControl: true }).setView(estateCoords, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '\u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(visitorMap);

    L.marker(estateCoords).addTo(visitorMap).bindPopup(`
        <div style="font-family: 'Outfit', sans-serif; color: #1e293b; padding: 4px;">
            <h5 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #0f172a;">Open Nest Estate</h5>
            <p style="margin: 0; font-size: 11px; color: #64748b;">Malabar Hill, Mumbai, Maharashtra 400006</p>
        </div>
    `).openPopup();
}

function initAdminMap() {
    if (adminMap) return;
    const container = document.getElementById('admin-map');
    if (!container) return;

    adminMap = L.map('admin-map', { zoomControl: true, attributionControl: true }).setView(estateCoords, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '\u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(adminMap);

    L.marker(estateCoords).addTo(adminMap).bindPopup(`
        <div style="font-family: 'Outfit', sans-serif; color: #1e293b; padding: 4px;">
            <h5 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #0f172a;">Open Nest Estate</h5>
            <p style="margin: 0; font-size: 11px; color: #64748b;">Malabar Hill, Mumbai, Maharashtra 400006</p>
        </div>
    `).openPopup();
}

// -------------------------------------------------------------
// Troubleshoot Tab System
// -------------------------------------------------------------
const tsQueries = {
    bookings: `SELECT * FROM bookings ORDER BY booking_date DESC, booking_time ASC;`,
    stats: `SELECT\n  COUNT(*) AS totalBookings,\n  SUM(visitor_count) AS totalVisitors,\n  SUM(CASE WHEN booking_date >= CAST(GETDATE() AS DATE)\n       AND status != 'Cancelled' THEN 1 ELSE 0 END) AS upcomingTours,\n  SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) AS cancelledBookings\nFROM bookings;`,
    schemes: `SELECT id, name, price, viewing_rules, description\nFROM schemes\nORDER BY id ASC;`
};
let tsActiveTab = 'bookings';
let tsLastSyncTime = null;

async function runTroubleshootDiagnostic() {
    setTsStatus('backend', 'checking', 'Checking...');
    setTsStatus('db', 'checking', 'Checking...');
    setTsStatus('bookings', 'checking', 'Checking...');
    setTsStatus('schemes', 'checking', 'Checking...');

    try {
        const r = await fetch('/api/stats');
        if (r.ok) {
            setTsStatus('backend', 'ok', 'Online');
            setTsStatus('db', 'ok', 'MySQL Connected');
        } else {
            throw new Error(`HTTP ${r.status}`);
        }
    } catch (e) {
        setTsStatus('backend', 'error', 'Offline / Unreachable');
        setTsStatus('db', 'warn', 'Using LocalStorage');
        tsLogError('Backend server unreachable', e.message, 'Try restarting the Node.js server with `npm run dev`. If offline, data is simulated via LocalStorage.');
    }

    try {
        if (!isStandaloneMode) {
            const r = await fetch('/api/bookings');
            if (r.ok) {
                setTsStatus('bookings', 'ok', 'Responding');
            } else {
                throw new Error(`HTTP ${r.status}`);
            }
        } else {
            const mock = JSON.parse(localStorage.getItem('mock_bookings') || '[]');
            setTsStatus('bookings', 'warn', `LocalStorage (${mock.length} records)`);
        }
    } catch (e) {
        setTsStatus('bookings', 'error', 'API Error');
        tsLogError('/api/bookings failed', e.message, 'Check db.js getAllBookings() method and MySQL connection string in .env');
    }

    try {
        if (!isStandaloneMode) {
            const r = await fetch('/api/schemes');
            if (r.ok) {
                setTsStatus('schemes', 'ok', 'Responding');
            } else {
                throw new Error(`HTTP ${r.status}`);
            }
        } else {
            const mock = JSON.parse(localStorage.getItem('mock_schemes') || '[]');
            setTsStatus('schemes', 'warn', `LocalStorage (${mock.length} schemes)`);
        }
    } catch (e) {
        setTsStatus('schemes', 'error', 'API Error');
        tsLogError('/api/schemes failed', e.message, 'Check db.js getAllSchemes() and verify your MySQL tables match schema.sql');
    }

    updateTsSqlView();
    updateTsSysInfo();

    tsLastSyncTime = new Date();
    document.getElementById('ts-info-sync').textContent = tsLastSyncTime.toLocaleTimeString();
}

function setTsStatus(service, state, text) {
    const badge = document.getElementById(`ts-${service}-badge`);
    const icon = document.getElementById(`ts-${service}-icon`);
    if (!badge) return;

    badge.textContent = text;
    badge.className = 'ts-badge';
    if (state === 'ok') badge.classList.add('ts-badge-ok');
    else if (state === 'warn') badge.classList.add('ts-badge-warn');
    else if (state === 'error') badge.classList.add('ts-badge-error');
    else badge.classList.add('ts-badge-checking');

    if (icon) {
        icon.className = 'ts-status-icon';
        if (state === 'ok') icon.classList.add('ts-icon-ok');
        else if (state === 'warn') icon.classList.add('ts-icon-warn');
        else if (state === 'error') icon.classList.add('ts-icon-error');
    }
}

function tsLogError(title, detail, fix) {
    const log = document.getElementById('ts-error-log');
    if (!log) return;

    const empty = log.querySelector('.ts-log-empty');
    if (empty) empty.remove();

    const entry = document.createElement('div');
    entry.className = 'ts-log-entry';
    entry.innerHTML = `
        <div class="ts-log-header">
            <i class="fa-solid fa-circle-exclamation" style="color: var(--accent-pink);"></i>
            <strong>${escapeHtml(title)}</strong>
            <span class="ts-log-time">${new Date().toLocaleTimeString()}</span>
        </div>
        <div class="ts-log-detail">${escapeHtml(detail)}</div>
        ${fix ? `<div class="ts-log-fix"><i class="fa-solid fa-lightbulb" style="color: var(--accent-cyan); margin-right:5px;"></i>${escapeHtml(fix)}</div>` : ''}
    `;
    log.prepend(entry);
}

function clearTsLog() {
    const log = document.getElementById('ts-error-log');
    if (!log) return;
    log.innerHTML = `
        <div class="ts-log-empty">
            <i class="fa-solid fa-circle-check" style="color: var(--accent-cyan); font-size:2rem; margin-bottom:10px;"></i>
            <p>Error log cleared. System appears healthy.</p>
        </div>
    `;
}

function switchTsTab(tab) {
    tsActiveTab = tab;
    document.querySelectorAll('.ts-sql-tab').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`ts-tab-${tab}`);
    if (activeBtn) activeBtn.classList.add('active');
    updateTsSqlView();
}

function updateTsSqlView() {
    const codeEl = document.getElementById('ts-sql-code');
    const engineLabel = document.getElementById('ts-engine-label');
    if (!codeEl) return;

    codeEl.innerHTML = highlightSqlSyntax(tsQueries[tsActiveTab] || '-- No query available');

    if (engineLabel) {
        engineLabel.innerHTML = isStandaloneMode
            ? `<i class="fa-solid fa-microchip"></i> Simulated SQL Sandbox (LocalStorage)`
            : `<i class="fa-solid fa-microchip"></i> MySQL Server Backend`;
    }
}

async function copyTsSql() {
    const codeEl = document.getElementById('ts-sql-code');
    if (!codeEl) return;
    try {
        await navigator.clipboard.writeText(codeEl.innerText);
        showToast('Copied!', 'SQL query copied to clipboard.', 'success');
    } catch (e) {
        showToast('Copy Failed', 'Unable to copy SQL.', 'error');
    }
}

function updateTsSysInfo() {
    const modeEl = document.getElementById('ts-info-mode');
    const bookingsEl = document.getElementById('ts-info-bookings');
    const schemesEl = document.getElementById('ts-info-schemes');
    const lsEl = document.getElementById('ts-info-ls');
    const browserEl = document.getElementById('ts-info-browser');

    if (modeEl) modeEl.textContent = isStandaloneMode ? 'LocalStorage Simulator' : 'MySQL Server Backend';
    if (bookingsEl) bookingsEl.textContent = allBookings.length;
    if (schemesEl) schemesEl.textContent = allSchemes.length;

    if (lsEl) {
        let lsSize = 0;
        for (const key in localStorage) {
            if (localStorage.hasOwnProperty(key)) lsSize += localStorage[key].length * 2;
        }
        lsEl.textContent = lsSize < 1024 ? `${lsSize} B` : `${(lsSize / 1024).toFixed(1)} KB`;
    }

    if (browserEl) {
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Google Chrome';
        else if (ua.includes('Firefox')) browser = 'Mozilla Firefox';
        else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Apple Safari';
        else if (ua.includes('Edg')) browser = 'Microsoft Edge';
        browserEl.textContent = browser;
    }
}

// Quick Fix Buttons
function tsFixClearLocalStorage() {
    if (!confirm('This will delete all locally stored bookings and schemes. Continue?')) return;
    localStorage.removeItem('mock_bookings');
    localStorage.removeItem('mock_schemes');
    clearTsLog();
    showToast('Cache Cleared', 'LocalStorage data removed. Reload to reseed.', 'success');
}

function tsFixReseedData() {
    localStorage.setItem('mock_bookings', JSON.stringify(getMockSeedData()));
    localStorage.setItem('mock_schemes', JSON.stringify(getMockSchemesSeedData()));
    refreshData();
    showToast('Data Reseeded', 'Mock bookings and schemes have been restored to defaults.', 'success');
}

async function tsFixReconnect() {
    const indicator = document.getElementById('sql-engine-indicator');
    if (indicator) indicator.textContent = 'Reconnecting...';
    try {
        const res = await fetch('/api/stats');
        if (res.ok) {
            isStandaloneMode = false;
            indicator.textContent = 'MySQL Server Backend';
            indicator.style.background = 'rgba(6, 182, 212, 0.15)';
            indicator.style.borderColor = 'var(--accent-cyan)';
            indicator.style.color = 'var(--accent-cyan)';
            showToast('Reconnected', 'Successfully connected to backend server.', 'success');
            refreshData();
        } else {
            throw new Error(`Server responded with HTTP ${res.status}`);
        }
    } catch (e) {
        showToast('Reconnect Failed', 'Backend server still unreachable. Staying in offline mode.', 'error');
        tsLogError('Reconnect attempt failed', e.message, 'Make sure the Node.js server is running: npm run dev');
    }
    runTroubleshootDiagnostic();
}

function tsFixExportData() {
    const exportData = {
        exportedAt: new Date().toISOString(),
        mode: isStandaloneMode ? 'LocalStorage Simulator' : 'MySQL Server Backend',
        bookings: allBookings,
        schemes: allSchemes
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `opennest-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Export Complete', 'Data exported as JSON file.', 'success');
}
