const mysql = require('mysql2/promise');
const cron = require('node-cron');

async function syncBookings() {

    // Railway Database
    const railwayDb = await mysql.createConnection({
        host: 'mysql.railway.internal',
        user: 'root',
        password: 'nzgkAXvfsLCplVwlHbngmjdZnRERfuGq',
        database: 'railway',
        port: 58721
    });

    // Local MySQL Database
    const localDb = await mysql.createConnection({
        host: 'localhost',
        user: 'Root',
        password: 'Aniket@1331',
        database: 'HouseViewingDB',
        port: 3306
    });

    console.log('Sync started...');

    // Get Railway records
    const [rows] = await railwayDb.execute(`
        SELECT * FROM bookings
    `);

    for (const row of rows) {

        // Check if exists locally
        const [existing] = await localDb.execute(
            `SELECT id FROM bookings WHERE id = ?`,
            [row.id]
        );

        if (existing.length === 0) {

            // Insert locally
            await localDb.execute(`
                INSERT INTO bookings
                (id, visitor_name, visitor_email, visitor_phone,
                 booking_date, booking_time, visitor_count,
                 scheme_name, special_requests, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                row.id,
                row.visitor_name,
                row.visitor_email,
                row.visitor_phone,
                row.booking_date,
                row.booking_time,
                row.visitor_count,
                row.scheme_name,
                row.special_requests,
                row.status,
                row.created_at
            ]);

            console.log(`Synced booking ID ${row.id}`);
        }
    }

    console.log('Sync completed.');
}

// Run every 1 minute
cron.schedule('* * * * *', () => {
    syncBookings().catch(console.error);
});

console.log('Auto-sync service started...');