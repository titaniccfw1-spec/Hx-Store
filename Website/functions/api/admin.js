import mysql from 'mysql2/promise';

const BOT_CONFIG_DDL = `
    CREATE TABLE IF NOT EXISTS bot_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bot_name VARCHAR(255) NOT NULL UNIQUE,
        prefix VARCHAR(10) DEFAULT '-',
        manager_ids TEXT,
        allowed_channel_id VARCHAR(255),
        log_channel_id VARCHAR(255),
        status_type VARCHAR(50) DEFAULT 'STREAMING',
        status_name VARCHAR(255) DEFAULT 'Made by ! S A U D',
        status_url VARCHAR(255) DEFAULT 'https://twitch.tv/p8y2',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
`;

function generateToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = 'FS-';
    for (let i = 0; i < 8; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
    return token;
}

async function logToWebhook(action, data, webhookUrl, customConfig = {}) {
    if (!webhookUrl) return;
    const logoUrl = "https://i.ibb.co/kst30cYk/Hx-Logo-512x512.png";
    const name = customConfig.name || "Hx Store Audit";
    const avatar = customConfig.avatar || logoUrl;

    const titles = {
        'CREATE': "🛡️ إنشاء اشتراك بوت جديد",
        'UPDATE_STATUS': "📊 تحديث حالة الاشتراك",
        'UPDATE_DISCORD_ID': "👤 تغيير معرف الحساب (Discord ID)",
        'DELETE': "🗑️ حذف اشتراك",
        'UPDATE_BOT_CONFIG': "⚙️ تحديث إعدادات البوت"
    };
    const colors = {
        'CREATE': 0x00ff00, 'UPDATE_STATUS': 0xffea00,
        'UPDATE_DISCORD_ID': 0x00bcff, 'DELETE': 0xff0000, 'UPDATE_BOT_CONFIG': 0x7289da
    };

    let embed = {
        title: titles[action] || "📢 إشعار جديد",
        color: colors[action] || 0x00ff00,
        author: { name: "Hx Store | نظام الاشتراكات", icon_url: logoUrl },
        thumbnail: { url: logoUrl },
        image: { url: logoUrl },
        fields: [
            { name: "👤 المشرف/المنفذ", value: `<@${data.adminId}>`, inline: false },
            { name: "🤖 البوت", value: `\`${data.resource}\``, inline: false }
        ],
        timestamp: new Date(),
        footer: { text: "نظام إدارة الاشتراكات | Hx Store", icon_url: logoUrl }
    };

    if (action === 'CREATE') {
        embed.fields.push({ name: "👥 العميل", value: `<@${data.targetUser}>`, inline: false });
    } else if (action === 'UPDATE_STATUS') {
        if (data.targetUser) embed.fields.push({ name: "👥 العميل", value: `<@${data.targetUser}>`, inline: false });
        embed.fields.push({ name: "📊 الحالة الجديدة", value: `\`${data.status === 'ACTIVE' ? 'نشط' : 'غير نشط'}\``, inline: false });
    } else if (action === 'UPDATE_DISCORD_ID') {
        embed.fields.push({ name: "⬅️ العميل القديم", value: `<@${data.oldDiscordID}>`, inline: false });
        embed.fields.push({ name: "➡️ العميل الجديد", value: `<@${data.newDiscordID}>`, inline: false });
    } else if (action === 'DELETE') {
        if (data.targetUser) embed.fields.push({ name: "👥 العميل", value: `<@${data.targetUser}>`, inline: false });
    } else if (action === 'UPDATE_BOT_CONFIG') {
        embed.fields.push({ name: "⚙️ الإجراء", value: "تم تحديث إعدادات البوت من لوحة التحكم", inline: false });
    }

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: name, avatar_url: avatar, embeds: [embed] })
        });
    } catch (err) {
        console.error('Webhook Logging Failed:', err.message);
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    };

    try {
        const body = await request.json();
        const { action, userId, targetUser, resource, token, webhookName, webhookAvatar, newDiscordID, bot_name, prefix, manager_ids, allowed_channel_id, log_channel_id, status_type, status_name, status_url } = body;
        const webhookConfig = { name: webhookName, avatar: webhookAvatar };
        const adminIds = (env.ADMIN_IDS || "").split(',');
        const isAdmin = adminIds.includes(userId);

        const connection = await mysql.createConnection({
            host: "mysql-sub-license-system.j.aivencloud.com",
            user: "avnadmin",
            password: env.DB_PASSWORD,
            database: "defaultdb",
            port: 15196,
            ssl: { rejectUnauthorized: false }
        });

        if (action === 'LIST_ALL') {
            let query = "SELECT * FROM tokens";
            let params = [];
            if (!isAdmin) {
                query += " WHERE discord_id = ?";
                params.push(userId);
            }
            const [rows] = await connection.execute(query, params);
            await connection.end();
            return new Response(JSON.stringify({
                licenses: rows.map(r => ({
                    id: String(r.id),
                    name: r.resource,
                    discord_id: r.discord_id,
                    status: r.status || 'ACTIVE'
                }))
            }), { status: 200, headers: corsHeaders });
        }

        // Only admins can CREATE or DELETE
        if (!isAdmin && (action === 'CREATE' || action === 'DELETE')) {
            await connection.end();
            return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: corsHeaders });
        }

        if (action === 'CREATE') {
            const [result] = await connection.execute(
                "INSERT INTO tokens (resource, discord_id, status) VALUES (?, ?, 'ACTIVE')",
                [resource, targetUser]
            );
            const insertedId = String(result.insertId);
            await connection.end();
            await logToWebhook('CREATE', { adminId: userId, targetUser, resource }, env.WEBHOOK_URL, webhookConfig);
            return new Response(JSON.stringify({ success: true, id: insertedId }), { status: 200, headers: corsHeaders });
        }

        if (action === 'DELETE') {
            const [rows] = await connection.execute("SELECT * FROM tokens WHERE id = ?", [token]);
            const resourceName = rows.length > 0 ? rows[0].resource : 'Unknown Bot';
            const targetUser2 = rows.length > 0 ? rows[0].discord_id : 'Unknown';
            await connection.execute("DELETE FROM tokens WHERE id = ?", [token]);
            await connection.end();
            await logToWebhook('DELETE', { adminId: userId, targetUser: targetUser2, resource: resourceName }, env.WEBHOOK_URL, webhookConfig);
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
        }

        if (action === 'UPDATE_DISCORD_ID') {
            if (!isAdmin) {
                await connection.end();
                return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: corsHeaders });
            }
            const [rows] = await connection.execute("SELECT * FROM tokens WHERE id = ?", [token]);
            const resourceName = rows.length > 0 ? rows[0].resource : 'Unknown Bot';
            const oldDiscordID = rows.length > 0 ? rows[0].discord_id : 'Unknown';
            await connection.execute("UPDATE tokens SET discord_id = ? WHERE id = ?", [newDiscordID, token]);
            await connection.end();
            await logToWebhook('UPDATE_DISCORD_ID', { adminId: userId, resource: resourceName, oldDiscordID, newDiscordID }, env.WEBHOOK_URL, webhookConfig);
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
        }

        if (action === 'UPDATE_STATUS') {
            if (!isAdmin) {
                await connection.end();
                return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: corsHeaders });
            }
            const { status: newStatus } = body;
            const [rows] = await connection.execute("SELECT * FROM tokens WHERE id = ?", [token]);
            const resourceName = rows.length > 0 ? rows[0].resource : 'Unknown Bot';
            const targetUser2 = rows.length > 0 ? rows[0].discord_id : 'Unknown';
            await connection.execute("UPDATE tokens SET status = ? WHERE id = ?", [newStatus, token]);
            await connection.end();
            await logToWebhook('UPDATE_STATUS', { adminId: userId, targetUser: targetUser2, resource: resourceName, status: newStatus }, env.WEBHOOK_URL, webhookConfig);
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
        }

        if (action === 'GET_BOT_CONFIG') {
            await connection.execute(BOT_CONFIG_DDL);
            const [rows] = await connection.execute("SELECT * FROM bot_configs WHERE bot_name = ?", [bot_name || 'Broadcast-Sub']);
            await connection.end();
            const configData = rows.length > 0 ? rows[0] : {
                bot_name: bot_name || 'Broadcast-Sub',
                prefix: '-', manager_ids: '', allowed_channel_id: '',
                log_channel_id: '', status_type: 'STREAMING',
                status_name: 'Made by ! S A U D', status_url: 'https://twitch.tv/p8y2'
            };
            return new Response(JSON.stringify({ success: true, config: configData }), { status: 200, headers: corsHeaders });
        }

        if (action === 'UPDATE_BOT_CONFIG') {
            await connection.execute(BOT_CONFIG_DDL);
            await connection.execute(`
                INSERT INTO bot_configs (bot_name, prefix, manager_ids, allowed_channel_id, log_channel_id, status_type, status_name, status_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    prefix = VALUES(prefix), manager_ids = VALUES(manager_ids),
                    allowed_channel_id = VALUES(allowed_channel_id), log_channel_id = VALUES(log_channel_id),
                    status_type = VALUES(status_type), status_name = VALUES(status_name), status_url = VALUES(status_url)
            `, [bot_name || 'Broadcast-Sub', prefix || '-', manager_ids || '', allowed_channel_id || '', log_channel_id || '', status_type || 'STREAMING', status_name || '', status_url || '']);
            await connection.end();
            await logToWebhook('UPDATE_BOT_CONFIG', { adminId: userId, resource: bot_name || 'Broadcast-Sub' }, env.WEBHOOK_URL, webhookConfig);
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
        }

        await connection.end();
        return new Response(JSON.stringify({ error: "Invalid Action" }), { status: 400, headers: corsHeaders });

    } catch (err) {
        console.error('Admin API Error:', err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
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
