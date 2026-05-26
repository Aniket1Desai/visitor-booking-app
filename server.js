const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing middlewares
app.use(cors());
app.use(express.json());

// Serve gorgeous Glassmorphism frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// REST API Endpoints - Bookings Operations
// -------------------------------------------------------------

/**
 * GET /api/bookings
 * Retrieves all bookings in descending date order, including SQL trace logs
 */
app.get('/api/bookings', async (req, res) => {
    try {
        const result = await db.getAllBookings();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve bookings', details: err.message });
    }
});

/**
 * POST /api/bookings
 * Creates a new house viewing booking mapped to a scheme
 */
app.post('/api/bookings', async (req, res) => {
    const { visitor_name, visitor_email, visitor_phone, booking_date, booking_time, visitor_count, scheme_name, special_requests } = req.body;

    // Simple validations
    if (!visitor_name || !visitor_email || !visitor_phone || !booking_date || !booking_time || !scheme_name) {
        return res.status(400).json({ error: 'Missing required booking fields (name, email, phone, date, time, scheme_name)' });
    }

    try {
        const result = await db.createBooking({
            visitor_name,
            visitor_email,
            visitor_phone,
            booking_date,
            booking_time,
            visitor_count,
            scheme_name,
            special_requests
        });
        res.status(201).json(result);
    } catch (err) {
        if (err.message.includes('already booked')) {
            return res.status(409).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to create booking', details: err.message });
    }
});

/**
 * PUT /api/bookings/:id
 * Reschedules a viewing with slot checking
 */
app.put('/api/bookings/:id', async (req, res) => {
    const { id } = req.params;
    const { booking_date, booking_time } = req.body;

    if (!booking_date || !booking_time) {
        return res.status(400).json({ error: 'Missing date or time for rescheduling.' });
    }

    try {
        const result = await db.rescheduleBooking(id, booking_date, booking_time);
        res.json(result);
    } catch (err) {
        if (err.message.includes('already booked')) {
            return res.status(409).json({ error: err.message });
        }
        if (err.message.includes('not found')) {
            return res.status(404).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to reschedule booking', details: err.message });
    }
});

/**
 * DELETE /api/bookings/:id
 * Soft cancels a booked house viewing session
 */
app.delete('/api/bookings/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.deleteBooking(id);
        res.json(result);
    } catch (err) {
        if (err.message.includes('not found')) {
            return res.status(404).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to cancel booking', details: err.message });
    }
});

/**
 * GET /api/stats
 * Computes dashboard statistics (visitor tallies, remaining counts)
 */
app.get('/api/stats', async (req, res) => {
    try {
        const result = await db.getStats();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve stats', details: err.message });
    }
});

// -------------------------------------------------------------
// REST API Endpoints - House Scheme Operations
// -------------------------------------------------------------

/**
 * GET /api/schemes
 * Retrieves all registered property viewing schemes
 */
app.get('/api/schemes', async (req, res) => {
    try {
        const result = await db.getAllSchemes();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve schemes', details: err.message });
    }
});

/**
 * POST /api/schemes
 * Creates a new property scheme option (Admin feature)
 */
app.post('/api/schemes', async (req, res) => {
    const { name, price, viewing_rules, description } = req.body;

    if (!name || !price) {
        return res.status(400).json({ error: 'Missing required scheme fields (name, price)' });
    }

    try {
        const result = await db.createScheme({
            name,
            price,
            viewing_rules,
            description
        });
        res.status(201).json(result); // 210 custom status for scheme creation
    } catch (err) {
        if (err.message.includes('already exists')) {
            return res.status(409).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to create scheme', details: err.message });
    }
});

// Serve frontend SPA for all other non-matching routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Open Nest Booking Application running on http://localhost:${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} in your browser to view the Open Nest Tour system.\n`);
});
