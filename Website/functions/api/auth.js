import mysql from 'mysql2/promise';

export async function onRequestPost(context) {
    const { request, env } = context;
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    };

    try {
        const body = await request.json();
        const { code, redirect_uri } = body;

        if (!code || !redirect_uri) {
            return new Response(JSON.stringify({ error: "Missing code or redirect_uri" }), { status: 400, headers: corsHeaders });
        }

        // 1. Exchange code for access token
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: env.DISCORD_CLIENT_ID,
                client_secret: env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirect_uri,
            })
        });

        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok) throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');

        const { access_token } = tokenData;

        // 2. Get User Info
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const user = await userResponse.json();
        if (!userResponse.ok) throw new Error('Failed to fetch user info');

        const discordId = user.id;

        // 3. Connect to Database and Fetch Licenses
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
                id: row.token,
                name: row.resource,
                ip: row.ip,
                status: "ACTIVE",
                downloadUrl: "#"
            }));

            await connection.end();
        } catch (dbErr) {
            console.error('Database Error during auth:', dbErr.message);
        }

        return new Response(JSON.stringify({
            id: user.id,
            username: `${user.username}`,
            avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/${user.id % 5}.png`,
            licenses: licenses
        }), { status: 200, headers: corsHeaders });

    } catch (err) {
        console.error('Auth Error:', err.message);
        return new Response(JSON.stringify({ 
            error: "Authentication failed", 
            details: err.message 
        }), { status: 500, headers: corsHeaders });
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
        },
    });
}
