const mysql = require('mysql2/promise');
const cron = require('node-cron');

// ─── Railway DB Config ───────────────────────────────────────────
const railwayConfig = {
    host: 'zephyr.proxy.rlwy.net',
    user: 'root',
    password: 'nzgkAXvfsLCplVwlHbngmjdZnRERfuGq',
    database: 'railway',
    port: 58721
};

// ─── Local DB Config ─────────────────────────────────────────────
const localConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Aniket@1331',
    database: 'HouseViewingDB',
    port: 3306
};

// ─── Sync Bookings ───────────────────────────────────────────────
async function syncBookings() {
    const railwayDb = await mysql.createConnection(railwayConfig);
    const localDb = await mysql.createConnection(localConfig);

    console.log('Bookings sync started...');

    const [rows] = await railwayDb.execute(`SELECT * FROM bookings`);

    for (const row of rows) {
        const [existing] = await localDb.execute(
            `SELECT id FROM bookings WHERE id = ?`, [row.id]
        );

        if (existing.length === 0) {
            await localDb.execute(`
                INSERT INTO bookings
                (id, visitor_name, visitor_email, visitor_phone,
                 booking_date, booking_time, visitor_count,
                 scheme_name, special_requests, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                row.id, row.visitor_name, row.visitor_email,
                row.visitor_phone, row.booking_date, row.booking_time,
                row.visitor_count, row.scheme_name, row.special_requests,
                row.status, row.created_at
            ]);
            console.log(`✅ Synced booking ID ${row.id}`);
        }
    }

    console.log('Bookings sync completed.');
    await railwayDb.end();
    await localDb.end();
}

// ─── Sync Schemes ────────────────────────────────────────────────
async function syncSchemes() {
    const railwayDb = await mysql.createConnection(railwayConfig);
    const localDb = await mysql.createConnection(localConfig);

    console.log('Schemes sync started...');

    const [rows] = await railwayDb.execute(`SELECT * FROM schemes`);

    for (const row of rows) {
        const [existing] = await localDb.execute(
            `SELECT id FROM schemes WHERE id = ?`, [row.id]
        );

        if (existing.length === 0) {
            await localDb.execute(`
                INSERT INTO schemes
                (id, name, address, price, viewing_rules, description, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                row.id, row.name, row.address, row.price,
                row.viewing_rules, row.description, row.created_at
            ]);
            console.log(`✅ Synced scheme ID ${row.id}`);
        }
    }

    console.log('Schemes sync completed.');
    await railwayDb.end();
    await localDb.end();
}

// ─── Cron: Run Every 1 Minute ────────────────────────────────────
cron.schedule('* * * * *', async () => {
    await syncBookings().catch(console.error);
    await syncSchemes().catch(console.error);
});

console.log('🚀 Auto-sync service started (bookings + schemes)...');