require('dotenv').config();
const mysql = require('mysql2/promise');
const axios = require('axios');
const https = require('https');

// ─── SSL Agent (fixes Power Automate certificate issue) ──────────
const agent = new https.Agent({ rejectUnauthorized: false });

// ─── Railway DB Config ───────────────────────────────────────────
const railwayConfig = {
    host: process.env.RAILWAY_HOST,
    user: process.env.RAILWAY_USER,
    password: process.env.RAILWAY_PASSWORD,
    database: process.env.RAILWAY_DATABASE,
    port: parseInt(process.env.RAILWAY_PORT)
};

// ─── Sync Bookings ───────────────────────────────────────────────
async function syncBookings() {
    const railwayDb = await mysql.createConnection(railwayConfig);
    console.log('Bookings sync started...');

    const [rows] = await railwayDb.execute(`SELECT * FROM bookings`);
    console.log(`Found ${rows.length} bookings`);

    for (const row of rows) {
        try {
            await axios.post(process.env.POWER_AUTOMATE_BOOKINGS_URL, {
                table: 'bookings',
                data: row
            }, {
                httpsAgent: agent
            });
            console.log(`✅ Sent booking ID ${row.id}`);
        } catch (err) {
            console.error(`❌ Failed booking ID ${row.id}:`, err.message);
        }
    }

    await railwayDb.end();
    console.log('Bookings sync completed.');
}

// ─── Sync Schemes ────────────────────────────────────────────────
async function syncSchemes() {
    const railwayDb = await mysql.createConnection(railwayConfig);
    console.log('Schemes sync started...');

    const [rows] = await railwayDb.execute(`SELECT * FROM schemes`);
    console.log(`Found ${rows.length} schemes`);

    for (const row of rows) {
        try {
            await axios.post(process.env.POWER_AUTOMATE_SCHEMES_URL, {
                table: 'schemes',
                data: {
                    ...row,
                    id: String(row.id),
                    price: String(row.price)
                }
            }, {
                httpsAgent: agent
            });
            console.log(`✅ Sent scheme ID ${row.id}`);
        } catch (err) {
            console.error(`❌ Failed scheme ID ${row.id}:`, err.message);
        }
    }

    await railwayDb.end();
    console.log('Schemes sync completed.');
}

module.exports = { syncBookings, syncSchemes };