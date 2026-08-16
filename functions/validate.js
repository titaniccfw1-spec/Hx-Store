const mysql = require('mysql2/promise');

exports.handler = async (event, context) => {
    // CORS Headers
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "text/plain"
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const { ip, t, r } = event.queryStringParameters || {};

    if (!ip || !t || !r) {
        return { statusCode: 400, headers, body: 'Missing Parameters' };
    }

    try {
        const connection = await mysql.createConnection({
            host: "mysql-sub-license-system.j.aivencloud.com",
            user: "avnadmin",
            password: process.env.DB_PASSWORD,
            database: "defaultdb",
            port: 15196,
            ssl: { rejectUnauthorized: false }
        });

        // 1. Check if token exists at all
        const [tokenExists] = await connection.execute(
            "SELECT * FROM tokens WHERE token = ?",
            [t]
        );

        if (tokenExists.length === 0) {
            await connection.end();
            return { statusCode: 404, headers, body: "INVALID_LICENSE" };
        }

        const license = tokenExists[0];

        // 2. Check if resource matches
        if (license.resource !== r) {
            await connection.end();
            return { statusCode: 404, headers, body: "WRONG_RESOURCE" };
        }

        // 3. Check if IP matches
        if (license.ip !== ip) {
            await connection.end();
            return { statusCode: 404, headers, body: "IP_MISMATCH" };
        }

        // 4. Check status
        if (license.status !== 'ACTIVE') {
            await connection.end();
            return { statusCode: 404, headers, body: "LICENSE_INACTIVE" };
        }

        await connection.end();
        return { statusCode: 200, headers, body: "200" };
    } catch (err) {
        console.error('Validation Error:', err.message);
        return { statusCode: 500, headers, body: "Error: " + err.message };
    }
};
