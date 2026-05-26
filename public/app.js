/**
 * Core Front-End Web Application Logic
 * Client-Side Router, Dynamic Scheduling Grid, Live SQL Audit Logger,
 * and Dual-Mode Execution Engine (Node.js API vs. LocalStorage SQL Simulator).
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
let apiBaseUrl = ''; // Relative path, same host
let currentRole = 'visitor'; // 'visitor' or 'admin'
let allSchemes = [];
let visitorMap = null;
let adminMap = null;
const estateCoords = [18.9543, 72.8088]; // Malabar Hill, Mumbai, India

// -------------------------------------------------------------
// Initialization & Startup
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initDatePickers();
    initTheme(); // Load saved theme preference
    initRole();  // Load default role setup
    detectEngineModeAndLoad();
    setupNavigationListeners();
    setupScrollEffects();
    setupRoleDropdownCloseListener(); // Close dropdown on outside click
});

// Setup date inputs (restrict range to [tomorrow, tomorrow + 30 days])
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

// Check if Express backend is running. If not, auto-switch to LocalStorage SQL Simulator!
async function detectEngineModeAndLoad() {
    const indicator = document.getElementById('sql-engine-indicator');

    try {
        indicator.textContent = "Connecting...";
        const res = await fetch('https://your-backend.onrender.com/api/stats');
        if (res.ok) {
            isStandaloneMode = false;
            indicator.textContent = "MySQL Server Backend";
            indicator.style.background = "rgba(6, 182, 212, 0.15)";
            indicator.style.borderColor = "var(--accent-cyan)";
            indicator.style.color = "var(--accent-cyan)";
            // Silent connection – no toast
        } else {
            throw new Error("Server returned error status");
        }
    } catch (err) {
        // Fallback to standalone client-side simulator
        isStandaloneMode = true;
        indicator.textContent = "SQL Simulator (Offline)";
        indicator.style.background = "rgba(236, 72, 153, 0.15)";
        indicator.style.borderColor = "var(--accent-pink)";
        indicator.style.color = "var(--accent-pink)";

        // Initialize mock database in LocalStorage if not exists
        if (!localStorage.getItem('mock_bookings')) {
            const initialSeed = getMockSeedData();
            localStorage.setItem('mock_bookings', JSON.stringify(initialSeed));
        }

        // Initialize mock schemes in LocalStorage if not exists
        if (!localStorage.getItem('mock_schemes')) {
            const initialSchemesSeed = getMockSchemesSeedData();
            localStorage.setItem('mock_schemes', JSON.stringify(initialSchemesSeed));
        }
        // Silent fallback – no toast
    }

    // Load initial data
    refreshData();
    // Render time slots for tomorrow
    renderTimeSlots('booking_date', 'slots-container', 'selected_time');
}

// Seed mock records for simulator
function getMockSeedData() {
    return [
        {
            id: 1,
            visitor_name: 'Priya Sharma',
            visitor_email: 'priya.sharma@example.in',
            visitor_phone: '+91 98200 45678',
            booking_date: getOffsetDateString(1),
            booking_time: '10:00 AM',
            visitor_count: 2,
            special_requests: 'Would like to see the sea-view terrace and smart home automation panel.',
            status: 'Confirmed',
            scheme_name: 'Open Nest',
            created_at: new Date(Date.now() - 7200000).toISOString()
        },
        {
            id: 2,
            visitor_name: 'Arjun Mehta',
            visitor_email: 'arjun.mehta@example.in',
            visitor_phone: '+91 91234 56789',
            booking_date: getOffsetDateString(2),
            booking_time: '02:00 PM',
            visitor_count: 1,
            special_requests: 'Interested in solar panel integration and home automation systems.',
            status: 'Confirmed',
            scheme_name: 'Sunset Cliffs Estate',
            created_at: new Date(Date.now() - 18000000).toISOString()
        },
        {
            id: 3,
            visitor_name: 'Rohan Desai',
            visitor_email: 'rohan.desai@example.in',
            visitor_phone: '+91 70450 88888',
            booking_date: getOffsetDateString(-1),
            booking_time: '11:00 AM',
            visitor_count: 3,
            special_requests: 'Require accessibility details for wheelchair-friendly entrance.',
            status: 'Confirmed',
            scheme_name: 'Horizon Penthouse Suite',
            created_at: new Date(Date.now() - 86400000).toISOString()
        }
    ];
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
    // Prevent showing admin-only sections if visitor
    if (currentRole === 'visitor' && (sectionId === 'dashboard-section' || sectionId === 'admin-schemes-section' || sectionId === 'troubleshoot-section')) {
        sectionId = 'hero-section';
    }
    // Prevent admin from accessing the booking section
    if (currentRole === 'admin' && sectionId === 'booking-section') {
        sectionId = 'dashboard-section';
    }

    document.querySelectorAll('.app-section').forEach(sec => {
        sec.classList.remove('active');
        // Ensure role-restricted app-sections display appropriately
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

    // Highlight nav link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-target') === sectionId) {
            link.classList.add('active');
        }
    });

    // Custom actions when showing dashboard
    if (sectionId === 'dashboard-section') {
        refreshData();
    }

    // Initialize or resize maps based on active section
    if (sectionId === 'location-section') {
        setTimeout(() => {
            initVisitorMap();
            if (visitorMap) {
                visitorMap.invalidateSize();
            }
        }, 100);
    } else if (sectionId === 'dashboard-section') {
        setTimeout(() => {
            initAdminMap();
            if (adminMap) {
                adminMap.invalidateSize();
            }
        }, 100);
    } else if (sectionId === 'troubleshoot-section') {
        // Auto-run diagnostic when the troubleshoot tab opens
        setTimeout(() => runTroubleshootDiagnostic(), 200);
    }

    // Auto-scroll to view
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
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

    // Check which slots are already booked on this day
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
                // Remove selected classes
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
    // If transitioning to Step 2, validate Step 1 fields
    if (step === 2) {
        bookingData.visitor_name = document.getElementById('visitor_name').value.trim();
        bookingData.visitor_email = document.getElementById('visitor_email').value.trim();
        bookingData.visitor_phone = document.getElementById('visitor_phone').value.trim();
        bookingData.visitor_count = parseInt(document.getElementById('visitor_count').value);
        bookingData.scheme_name = document.getElementById('booking_scheme').value;
    }

    // If transitioning to Step 3, confirm Date & Time chosen
    if (step === 3) {
        bookingData.special_requests = document.getElementById('special_requests').value.trim();

        // Populate Summary Page details
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
    // Hide all steps
    document.querySelectorAll('.booking-step').forEach(step => {
        step.classList.remove('active');
    });

    // Show current step
    document.getElementById(`booking-step-${currentStep}`).classList.add('active');

    // Update dots styling
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
// Core Database Operation Triggers (Hybrid Client-Server APIs)
// -------------------------------------------------------------

async function refreshData() {
    try {
        let bookingsRes, statsRes;
        let sqlTrace = '';
        let engineName = '';

        // Refresh schemes in real-time concurrently
        await refreshSchemes();

        if (!isStandaloneMode) {
            // Server API calls
            const bRes = await fetch('https://your-backend.onrender.com/api/bookings');
            bookingsRes = await bRes.json();

            const sRes = await fetch('https://your-backend.onrender.com/api/stats');
            statsRes = await sRes.json();

            allBookings = bookingsRes.data;
            sqlTrace = bookingsRes.sqlQuery + '\n\n' + statsRes.sqlQuery;
            engineName = bookingsRes.engine;
        } else {
            // Simulated local storage backend calls
            const mockBookings = JSON.parse(localStorage.getItem('mock_bookings') || '[]');

            // Sort simulated records
            mockBookings.sort((a, b) => {
                if (a.booking_date !== b.booking_date) {
                    return b.booking_date.localeCompare(a.booking_date);
                }
                return a.booking_time.localeCompare(b.booking_time);
            });
            allBookings = mockBookings;

            // Generate simulated stat results
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
                `       SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelledBookings FROM bookings;`;
            engineName = 'Simulated SQL Sandbox (LocalStorage)';
        }

        // Render stats counters
        document.getElementById('stat-total-bookings').textContent = statsRes.stats.totalBookings;
        document.getElementById('stat-total-visitors').textContent = statsRes.stats.totalVisitors;
        document.getElementById('stat-upcoming').textContent = statsRes.stats.upcomingTours;
        document.getElementById('stat-cancelled').textContent = statsRes.stats.cancelledBookings;

        // Render bookings table list
        renderBookingsTable();
        // Update floating audit console log
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
            const response = await fetch('https://your-backend.onrender.com/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData)
            });

            if (response.status === 409) {
                throw new Error("This date and time slot is already booked.");
            }
            if (!response.ok) {
                throw new Error("Server submission error");
            }
            result = await response.json();
        } else {
            // Simulated local storage insertion
            const mockBookings = JSON.parse(localStorage.getItem('mock_bookings') || '[]');
            const isConflict = mockBookings.some(b => b.booking_date === bookingData.booking_date && b.booking_time === bookingData.booking_time && b.status !== 'Cancelled');

            if (isConflict) {
                throw new Error("This date and time slot is already booked.");
            }

            const nextId = mockBookings.length > 0 ? Math.max(...mockBookings.map(b => b.id)) + 1 : 1;
            const newRecord = {
                id: nextId,
                ...bookingData,
                status: 'Confirmed',
                created_at: new Date().toISOString()
            };

            mockBookings.push(newRecord);
            localStorage.setItem('mock_bookings', JSON.stringify(mockBookings));

            const simulatedSql = `
INSERT INTO bookings (visitor_name, visitor_email, visitor_phone, booking_date, booking_time, visitor_count, scheme_name, special_requests, status)
VALUES ('${bookingData.visitor_name}', '${bookingData.visitor_email}', '${bookingData.visitor_phone}', '${bookingData.booking_date}', '${bookingData.booking_time}', ${bookingData.visitor_count}, '${bookingData.scheme_name}', ${bookingData.special_requests ? `'${bookingData.special_requests}'` : 'NULL'}, 'Confirmed');
            `.trim();

            result = {
                booking: newRecord,
                sqlQuery: simulatedSql,
                engine: 'Simulated SQL Sandbox (LocalStorage)'
            };
        }

        // Show Success Page Screen
        document.getElementById('success-date-time').textContent = `${formatDate(bookingData.booking_date)} at ${bookingData.booking_time}`;

        currentStep = 'success';
        updateStepUI();
        showToast("Booking Successful", "Viewing tour successfully reserved.", "success");

        // Refresh local cache and audit
        allBookings.push(result.booking);
        refreshData();

        // Proactively expand SQL logger panel to show query
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

            if (response.status === 409) {
                throw new Error("The selected new time slot is already booked.");
            }
            if (!response.ok) {
                throw new Error("Failed to reschedule viewing on server.");
            }
            result = await response.json();
        } else {
            // Simulated local updates
            const mockBookings = JSON.parse(localStorage.getItem('mock_bookings') || '[]');
            const isConflict = mockBookings.some(b => b.booking_date === newDate && b.booking_time === newTime && b.id !== parseInt(bookingId) && b.status !== 'Cancelled');

            if (isConflict) {
                throw new Error("The selected new time slot is already booked.");
            }

            const recordIdx = mockBookings.findIndex(b => b.id === parseInt(bookingId));
            if (recordIdx === -1) throw new Error("Booking record not found.");

            mockBookings[recordIdx].booking_date = newDate;
            mockBookings[recordIdx].booking_time = newTime;
            mockBookings[recordIdx].status = 'Rescheduled';

            localStorage.setItem('mock_bookings', JSON.stringify(mockBookings));

            const simulatedSql = `
UPDATE bookings 
SET booking_date = '${newDate}', booking_time = '${newTime}', status = 'Rescheduled' 
WHERE id = ${bookingId};
            `.trim();

            result = {
                sqlQuery: simulatedSql,
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
    if (!confirm(`Are you sure you want to cancel the viewing tour scheduled for ${name}?`)) {
        return;
    }

    try {
        let result;
        if (!isStandaloneMode) {
            const response = await fetch(`/api/bookings/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error("Server cancellation request failed.");
            }
            result = await response.json();
        } else {
            // Simulated cancellation
            const mockBookings = JSON.parse(localStorage.getItem('mock_bookings') || '[]');
            const recordIdx = mockBookings.findIndex(b => b.id === parseInt(id));
            if (recordIdx === -1) throw new Error("Record not found.");

            mockBookings[recordIdx].status = 'Cancelled';
            localStorage.setItem('mock_bookings', JSON.stringify(mockBookings));

            const simulatedSql = `
UPDATE bookings 
SET status = 'Cancelled' 
WHERE id = ${id};
            `.trim();

            result = {
                sqlQuery: simulatedSql,
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

        // Format status badge
        let badgeClass = 'badge-confirmed';
        if (booking.status === 'Rescheduled') badgeClass = 'badge-rescheduled';
        if (booking.status === 'Cancelled') badgeClass = 'badge-cancelled';

        // Render special requests with fallback
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
            <td>
                <span class="status-badge ${badgeClass}">${booking.status}</span>
            </td>
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

    const filtered = allBookings.filter(b => {
        return b.visitor_name.toLowerCase().includes(searchVal) ||
            b.visitor_email.toLowerCase().includes(searchVal) ||
            b.booking_date.includes(searchVal) ||
            (b.special_requests && b.special_requests.toLowerCase().includes(searchVal));
    });

    renderBookingsTable(filtered);
}

// -------------------------------------------------------------
// Visual SQL Query Logging Panel Handler
// -------------------------------------------------------------
function toggleSqlConsole() {
    const consoleEl = document.getElementById('sql-console');
    consoleEl.classList.toggle('closed');
}

function openSqlConsole() {
    const consoleEl = document.getElementById('sql-console');
    consoleEl.classList.remove('closed');
}

function logSqlQuery(rawSql, engineName) {
    const codeEl = document.getElementById('sql-console-code');
    const engineIndicator = document.getElementById('sql-engine-indicator');

    if (!codeEl) return;

    engineIndicator.textContent = engineName;

    // Apply basic syntax highlighting markup
    const highlighted = highlightSqlSyntax(rawSql);
    codeEl.innerHTML = highlighted;
}

function highlightSqlSyntax(sqlText) {
    if (!sqlText) return '';

    // Escape HTML first
    let escaped = escapeHtml(sqlText);

    // List of major SQL keywords
    const keywords = [
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'AND', 'OR', 'ORDER BY', 'DESC', 'ASC',
        'VALUES', 'INTO', 'SET', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'SUM', 'COUNT', 'AS', 'OUTPUT', 'INSERTED',
        'CAST', 'GETDATE', 'DATE', 'NVARCHAR', 'VARCHAR', 'INT', 'IDENTITY', 'PRIMARY KEY', 'NOT NULL'
    ];

    // Highlight strings
    escaped = escaped.replace(/(['].*?['])/g, '<span class="sql-string">$1</span>');

    // Highlight comments
    escaped = escaped.replace(/(--.*)/g, '<span class="sql-comment">$1</span>');

    // Highlight numbers (except inside tags)
    escaped = escaped.replace(/\b(\d+)\b(?![^<]*>)/g, '<span class="sql-number">$1</span>');

    // Highlight SQL Keywords (case-insensitive boundary check)
    keywords.forEach(keyword => {
        const regex = new RegExp(`\\b(${keyword})\\b(?![^<]*>)`, 'gi');
        escaped = escaped.replace(regex, '<span class="sql-keyword">$1</span>');
    });

    return escaped;
}

async function copyConsoleSql() {
    const codeEl = document.getElementById('sql-console-code');
    const textToCopy = codeEl.innerText;

    try {
        await navigator.clipboard.writeText(textToCopy);
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

    // Clear global object values
    bookingData.visitor_name = '';
    bookingData.visitor_email = '';
    bookingData.visitor_phone = '';
    bookingData.visitor_count = 2;
    bookingData.special_requests = '';
    bookingData.scheme_name = '';

    // Repopulate schemes select
    populateSchemesDropdown();

    initDatePickers();
    currentStep = 1;
    updateStepUI();
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    // Expected yyyy-mm-dd
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const year = parts[0];
    const month = months[parseInt(parts[1]) - 1];
    const day = parts[2];

    return `${month} ${day}, ${year}`;
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

    // Auto-remove after 4.5 seconds
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            toast.remove();
        }, 400);
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
// Theme Management (☀️ Light / 🌙 Dark Mode)
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
    // Silent theme toggle – no toast
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (!icon) return;
    if (theme === 'dark') {
        icon.className = 'fa-solid fa-sun';
    } else {
        icon.className = 'fa-solid fa-moon';
    }
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
    if (container) {
        container.classList.toggle('open');
    }
}

function setupRoleDropdownCloseListener() {
    document.addEventListener('click', (e) => {
        const container = document.querySelector('.role-selector-container');
        if (container && container.classList.contains('open')) {
            if (!container.contains(e.target)) {
                container.classList.remove('open');
            }
        }
    });
}

function switchRole(role) {
    currentRole = role;

    // Close role selector dropdown
    const container = document.querySelector('.role-selector-container');
    if (container) container.classList.remove('open');

    // Update active label UI
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

    // Apply visibility overrides (no toast – silent switch)
    applyRoleVisibility();

    // Redirect appropriately based on role
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
    const adminNavLinks = document.querySelectorAll('.nav-link.admin-only');
    const visitorNavLinks = document.querySelectorAll('.nav-link.visitor-only');

    adminNavLinks.forEach(link => {
        link.style.display = (currentRole === 'admin') ? 'flex' : 'none';
    });

    visitorNavLinks.forEach(link => {
        link.style.display = (currentRole === 'visitor') ? 'flex' : 'none';
    });

    // Handle sections and regular block visibility
    document.querySelectorAll('.admin-only').forEach(el => {
        if (el.tagName !== 'A') {
            if (currentRole !== 'admin') {
                el.style.display = 'none';
            } else {
                if (el.classList.contains('app-section')) {
                    el.style.display = el.classList.contains('active') ? 'block' : 'none';
                } else {
                    el.style.display = '';
                }
            }
        }
    });

    document.querySelectorAll('.visitor-only').forEach(el => {
        if (el.tagName !== 'A') {
            if (currentRole !== 'visitor') {
                el.style.display = 'none';
            } else {
                if (el.classList.contains('app-section')) {
                    el.style.display = el.classList.contains('active') ? 'block' : 'none';
                } else {
                    el.style.display = '';
                }
            }
        }
    });

    // Handle the header Reserve Tour button specifically
    const reserveBtn = document.getElementById('header-reserve-btn');
    if (reserveBtn) {
        reserveBtn.style.display = (currentRole === 'visitor') ? '' : 'none';
    }
}

// -------------------------------------------------------------
// Property Schemes Management System
// -------------------------------------------------------------
async function refreshSchemes() {
    try {
        let schemesRes;
        let sqlTrace = '';
        let engineName = '';

        if (!isStandaloneMode) {
            const res = await fetch('https://your-backend.onrender.com/api/schemes');
            if (!res.ok) throw new Error("Server returned invalid schemes response.");
            schemesRes = await res.json();
            allSchemes = schemesRes.data;
            sqlTrace = schemesRes.sqlQuery;
            engineName = schemesRes.engine;
        } else {
            // LocalStorage fallback mock schemes database
            const mockSchemes = JSON.parse(localStorage.getItem('mock_schemes') || '[]');
            allSchemes = mockSchemes;
            sqlTrace = `SELECT id, name, price, viewing_rules, description FROM schemes ORDER BY id ASC;`;
            engineName = 'Simulated SQL Sandbox (LocalStorage)';
        }

        // Populate Form select element in step 1
        populateSchemesDropdown();

        // Populate Admin scheme tier table
        renderSchemesTable();

    } catch (err) {
        console.error("Refresh schemes pipeline failed:", err);
        showToast("Schemes Sync Error", "Failed to retrieve active villa schemes from database.", "error");
    }
}

function populateSchemesDropdown() {
    const dropdown = document.getElementById('booking_scheme');
    if (!dropdown) return;

    dropdown.innerHTML = '';

    // Placeholder
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
            const response = await fetch('https://your-backend.onrender.com/api/schemes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, price, viewing_rules, description })
            });

            if (response.status === 409) {
                throw new Error("A scheme with this property name already exists.");
            }
            if (!response.ok) {
                throw new Error("Server rejected property scheme insertion.");
            }
            result = await response.json();
        } else {
            // Local simulator insertion
            const mockSchemes = JSON.parse(localStorage.getItem('mock_schemes') || '[]');
            const isConflict = mockSchemes.some(s => s.name.toLowerCase() === name.toLowerCase());

            if (isConflict) {
                throw new Error("A scheme with this property name already exists.");
            }

            const nextId = mockSchemes.length > 0 ? Math.max(...mockSchemes.map(s => s.id)) + 1 : 1;
            const newRecord = {
                id: nextId,
                name,
                price,
                viewing_rules,
                description
            };

            mockSchemes.push(newRecord);
            localStorage.setItem('mock_schemes', JSON.stringify(mockSchemes));

            const simulatedSql = `
INSERT INTO schemes (name, price, viewing_rules, description)
VALUES ('${name}', '${price}', ${viewing_rules ? `'${viewing_rules}'` : 'NULL'}, ${description ? `'${description}'` : 'NULL'});
            `.trim();

            result = {
                scheme: newRecord,
                sqlQuery: simulatedSql,
                engine: 'Simulated SQL Sandbox (LocalStorage)'
            };
        }

        showToast("Scheme Added", `Property "${name}" successfully registered in system.`, "success");

        // Reset form inputs
        document.getElementById('scheme-creation-form').reset();

        // Dynamic re-sync in dashboard/dropdown lists
        await refreshData();

        // Log SQL trace query
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
    return [
        {
            id: 1,
            name: 'Open Nest',
            price: '\u20B915.5 Crore',
            viewing_rules: 'Pre-cleared VIPs only',
            description: 'Our flagship 12,500 sq ft smart tech architectural villa atop Malabar Hill, Mumbai with panoramic sea views.'
        },
        {
            id: 2,
            name: 'Sunset Cliffs Estate',
            price: '\u20B98.9 Crore',
            viewing_rules: 'Prior identification required',
            description: 'Breathtaking hilltop estate in Lonavala featuring a private infinity pool and lush forest surroundings.'
        },
        {
            id: 3,
            name: 'Horizon Penthouse Suite',
            price: '\u20B94.2 Crore',
            viewing_rules: 'Accompanied agents only',
            description: 'Premium sky penthouse in Bandra Kurla Complex with glass facades and full-floor smart automation.'
        }
    ];
}

// -------------------------------------------------------------
// Leaflet Map Initialization & Rendering Core
// -------------------------------------------------------------
function initVisitorMap() {
    if (visitorMap) return;

    const container = document.getElementById('visitor-map');
    if (!container) return;

    visitorMap = L.map('visitor-map', {
        zoomControl: true,
        attributionControl: true
    }).setView(estateCoords, 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '\u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(visitorMap);

    const marker = L.marker(estateCoords).addTo(visitorMap);
    marker.bindPopup(`
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

    adminMap = L.map('admin-map', {
        zoomControl: true,
        attributionControl: true
    }).setView(estateCoords, 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '\u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(adminMap);

    const marker = L.marker(estateCoords).addTo(adminMap);
    marker.bindPopup(`
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

// Run full health check
async function runTroubleshootDiagnostic() {
    setTsStatus('backend', 'checking', 'Checking...');
    setTsStatus('db', 'checking', 'Checking...');
    setTsStatus('bookings', 'checking', 'Checking...');
    setTsStatus('schemes', 'checking', 'Checking...');

    let backendOk = false;
    let bookingsOk = false;
    let schemesOk = false;

    // 1. Backend ping
    try {
        const r = await fetch('https://your-backend.onrender.com/api/stats');
        if (r.ok) {
            backendOk = true;
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

    // 2. Bookings API
    try {
        if (!isStandaloneMode) {
            const r = await fetch('https://your-backend.onrender.com/api/bookings');
            if (r.ok) {
                bookingsOk = true;
                setTsStatus('bookings', 'ok', 'Responding');
            } else {
                throw new Error(`HTTP ${r.status}`);
            }
        } else {
            const mock = JSON.parse(localStorage.getItem('mock_bookings') || '[]');
            bookingsOk = true;
            setTsStatus('bookings', 'warn', `LocalStorage (${mock.length} records)`);
        }
    } catch (e) {
        setTsStatus('bookings', 'error', 'API Error');
        tsLogError('https://your-backend.onrender.com/api/bookings failed', e.message, 'Check db.js getAllBookings() method and MySQL connection string in .env');
    }

    // 3. Schemes API
    try {
        if (!isStandaloneMode) {
            const r = await fetch('https://your-backend.onrender.com/api/schemes');
            if (r.ok) {
                schemesOk = true;
                setTsStatus('schemes', 'ok', 'Responding');
            } else {
                throw new Error(`HTTP ${r.status}`);
            }
        } else {
            const mock = JSON.parse(localStorage.getItem('mock_schemes') || '[]');
            schemesOk = true;
            setTsStatus('schemes', 'warn', `LocalStorage (${mock.length} schemes)`);
        }
    } catch (e) {
        setTsStatus('schemes', 'error', 'API Error');
        tsLogError('https://your-backend.onrender.com/api/schemes failed', e.message, 'Check db.js getAllSchemes() and verify your MySQL tables match schema.sql');
    }

    // Update SQL query view
    updateTsSqlView();

    // Update system info
    updateTsSysInfo();

    tsLastSyncTime = new Date();
    document.getElementById('ts-info-sync').textContent = tsLastSyncTime.toLocaleTimeString();
}

function setTsStatus(service, state, text) {
    // state: 'ok' | 'warn' | 'error' | 'checking'
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

    // Remove empty placeholder
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

    const rawSql = tsQueries[tsActiveTab] || '-- No query available';
    codeEl.innerHTML = highlightSqlSyntax(rawSql);

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
            if (localStorage.hasOwnProperty(key)) {
                lsSize += localStorage[key].length * 2; // approx bytes
            }
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
        const res = await fetch('https://your-backend.onrender.com/api/stats');
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
