const axios = require('axios');
const mysql = require('mysql2/promise');

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    try {
        const body = JSON.parse(event.body);
        const { code, redirect_uri } = body;

        console.log('--- Auth Request Received ---');
        console.log('Code:', code ? 'exists' : 'MISSING');
        console.log('Redirect URI:', redirect_uri);

        if (!code || !redirect_uri) {
            console.error('Error: Missing parameters');
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing code or redirect_uri" }) };
        }

        // 1. Exchange code
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirect_uri,
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const { access_token } = tokenResponse.data;

        // 2. User Info
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const user = userResponse.data;
        const discordId = user.id;

        // 3. Fetch Licenses
        let licenses = [];
        try {
            const connection = await mysql.createConnection({
                host: "mysql-sub-license-system.j.aivencloud.com",
                user: "avnadmin",
                password: process.env.DB_PASSWORD,
                database: "defaultdb",
                port: 15196
            });

            const [rows] = await connection.execute(
                "SELECT * FROM tokens WHERE discord_id = ?",
                [discordId]
            );
            
            licenses = rows.map(row => ({
                id: String(row.id),
                name: row.resource,
                status: row.status || "ACTIVE"
            }));

            await connection.end();
        } catch (e) {
            console.error('DB Error during auth:', e.message);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                id: user.id,
                username: user.username,
                avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
                licenses: licenses
            })
        };

    } catch (err) {
        if (err.response && err.response.data) {
            console.error('--- Discord API Response Error ---');
            console.error(JSON.stringify(err.response.data, null, 2));
        }
        console.error('Auth Error:', err.message);
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ error: "Authentication failed", details: err.message }) 
        };
    }
};
