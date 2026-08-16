import mysql from 'mysql2/promise';

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    
    // FiveM script sends: ip, t (token), r (resource)
    const ip = url.searchParams.get('ip');
    const t = url.searchParams.get('t');
    const r = url.searchParams.get('r');

    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "text/plain"
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers });
    }

    if (!ip || !t || !r) {
        return new Response("Missing Parameters", { status: 400, headers });
    }

    try {
        const connection = await mysql.createConnection({
            host: "mysql-sub-license-system.j.aivencloud.com",
            user: "avnadmin",
            password: env.DB_PASSWORD,
            database: "defaultdb",
            port: 15196,
            ssl: { rejectUnauthorized: false }
        });

        const [rows] = await connection.execute(
            "SELECT * FROM tokens WHERE token = ? AND resource = ? AND ip = ? AND status = 'ACTIVE'",
            [t, r, ip]
        );

        await connection.end();

        if (rows.length > 0) {
            return new Response("200", { status: 200, headers });
        } else {
            return new Response("404", { status: 404, headers });
        }

    } catch (err) {
        console.error('Validation Error:', err);
        return new Response("Error", { status: 500, headers });
    }
}
