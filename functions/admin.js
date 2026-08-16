const mysql = require('mysql2/promise');
const axios = require('axios');

function generateToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = 'FS-';
    for (let i = 0; i < 8; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
    return token;
}

async function logToWebhook(action, data, webhookUrl, customConfig = {}) {
    if (!webhookUrl) return;

    const name = customConfig.name || "Hx Store Audit";
    const avatar = customConfig.avatar || "https://i.ibb.co/kst30cYk/Hx-Logo-512x512.png";
    const logoUrl = "https://i.ibb.co/kst30cYk/Hx-Logo-512x512.png";

    let titles = {
        'CREATE': "🛡️ إنشاء اشتراك بوت جديد",
        'UPDATE_STATUS': "📊 تحديث حالة الاشتراك",
        'UPDATE_DISCORD_ID': "👤 تغيير معرف الحساب (Discord ID)",
        'DELETE': "🗑️ حذف اشتراك"
    };

    let colors = {
        'CREATE': 0x00ff00,
        'UPDATE_STATUS': 0xffea00,
        'UPDATE_DISCORD_ID': 0x00bcff,
        'DELETE': 0xff0000
    };

    let embed = {
        title: titles[action] || "📢 إشعار جديد",
        color: colors[action] || 0x00ff00,
        author: {
            name: "Hx Store | نظام الاشتراكات",
            icon_url: logoUrl
        },
        thumbnail: {
            url: logoUrl
        },
        image: {
            url: logoUrl
        },
        fields: [
            { name: "👤 المشرف/المنفذ", value: `<@${data.adminId}>`, inline: false },
            { name: "🤖 البوت", value: `\`${data.resource}\``, inline: false }
        ],
        timestamp: new Date(),
        footer: {
            text: "نظام إدارة الاشتراكات | Hx Store",
            icon_url: logoUrl
        }
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
    }

    try {
        await axios.post(webhookUrl, {
            username: name,
            avatar_url: avatar,
            embeds: [embed]
        });
    } catch (err) {
        console.error('Webhook Logging Failed:', err.message);
    }
}

async function ensureSchema(connection) {
    try {
        const [rows] = await connection.execute("SHOW COLUMNS FROM tokens LIKE 'status'");
        if (rows.length === 0) {
            await connection.execute("ALTER TABLE tokens ADD COLUMN status VARCHAR(20) DEFAULT 'ACTIVE'");
        }
    } catch (e) {
        console.error('Migration failed:', e.message);
    }
}

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
        const { action, userId, targetUser, resource, ip, token, webhookName, webhookAvatar } = body;
        const webhookConfig = { name: webhookName, avatar: webhookAvatar };
        const adminIds = (process.env.ADMIN_IDS || "").split(',');
        const isAdmin = adminIds.includes(userId);

        const connection = await mysql.createConnection({
            host: "mysql-sub-license-system.j.aivencloud.com",
            user: "avnadmin",
            password: process.env.DB_PASSWORD,
            database: "defaultdb",
            port: 15196,
            ssl: { rejectUnauthorized: false }
        });

        // Run migrations on every admin request for safety
        if (isAdmin) {
            await ensureSchema(connection);
        }

        if (action === 'LIST_ALL') {
            let query = "SELECT * FROM tokens";
            let params = [];
            if (!isAdmin) {
                query += " WHERE discord_id = ?";
                params.push(userId);
            }
            const [rows] = await connection.execute(query, params);
            await connection.end();
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    licenses: rows.map(r => ({ 
                        id: String(r.id), 
                        name: r.resource, 
                        discord_id: r.discord_id,
                        status: r.status || 'ACTIVE'
                    })) 
                })
            };
        }

        if (!isAdmin && (action === 'CREATE' || action === 'DELETE' || action === 'UPDATE_STATUS')) {
            await connection.end();
            return { statusCode: 403, headers, body: JSON.stringify({ error: "Access Denied" }) };
        }

        if (action === 'CREATE') {
            const [result] = await connection.execute(
                "INSERT INTO tokens (resource, discord_id, status) VALUES (?, ?, 'ACTIVE')",
                [resource, targetUser]
            );
            const insertedId = String(result.insertId);
            await connection.end();
            await logToWebhook('CREATE', { adminId: userId, targetUser, resource }, process.env.WEBHOOK_URL, webhookConfig);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, id: insertedId }) };
        }

        if (action === 'UPDATE_STATUS') {
            const { status: newStatus, token: targetId } = body;
            const [rows] = await connection.execute("SELECT * FROM tokens WHERE id = ?", [targetId]);
            if (rows.length === 0) {
                await connection.end();
                return { statusCode: 404, headers, body: JSON.stringify({ error: "Subscription not found" }) };
            }
            
            await connection.execute("UPDATE tokens SET status = ? WHERE id = ?", [newStatus, targetId]);
            await connection.end();
            await logToWebhook('UPDATE_STATUS', { adminId: userId, resource: rows[0].resource, status: newStatus }, process.env.WEBHOOK_URL, webhookConfig);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        if (action === 'UPDATE_DISCORD_ID') {
            const { newDiscordID, token: targetId } = body;
            const [rows] = await connection.execute("SELECT * FROM tokens WHERE id = ?", [targetId]);
            if (rows.length === 0) {
                await connection.end();
                return { statusCode: 404, headers, body: JSON.stringify({ error: "Subscription not found" }) };
            }
            
            await connection.execute("UPDATE tokens SET discord_id = ? WHERE id = ?", [newDiscordID, targetId]);
            await connection.end();
            await logToWebhook('UPDATE_DISCORD_ID', { adminId: userId, resource: rows[0].resource, newDiscordID }, process.env.WEBHOOK_URL, webhookConfig);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        if (action === 'DELETE') {
            const { token: targetId } = body;
            const [rows] = await connection.execute("SELECT * FROM tokens WHERE id = ?", [targetId]);
            if (rows.length > 0) {
                await connection.execute("DELETE FROM tokens WHERE id = ?", [targetId]);
                await logToWebhook('DELETE', { adminId: userId, resource: rows[0].resource }, process.env.WEBHOOK_URL, webhookConfig);
            }
            await connection.end();
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        if (action === 'GET_BOT_CONFIG') {
            const { bot_name } = body;
            await connection.execute(`
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
            `);
            const [rows] = await connection.execute("SELECT * FROM bot_configs WHERE bot_name = ?", [bot_name || 'Broadcast-Sub']);
            await connection.end();
            const configData = rows.length > 0 ? rows[0] : {
                bot_name: bot_name || 'Broadcast-Sub',
                prefix: '-',
                manager_ids: '',
                allowed_channel_id: '',
                log_channel_id: '',
                status_type: 'STREAMING',
                status_name: 'Made by ! S A U D',
                status_url: 'https://twitch.tv/p8y2'
            };
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, config: configData }) };
        }

        if (action === 'UPDATE_BOT_CONFIG') {
            const { bot_name, prefix, manager_ids, allowed_channel_id, log_channel_id, status_type, status_name, status_url } = body;
            await connection.execute(`
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
            `);
            await connection.execute(`
                INSERT INTO bot_configs (bot_name, prefix, manager_ids, allowed_channel_id, log_channel_id, status_type, status_name, status_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    prefix = VALUES(prefix),
                    manager_ids = VALUES(manager_ids),
                    allowed_channel_id = VALUES(allowed_channel_id),
                    log_channel_id = VALUES(log_channel_id),
                    status_type = VALUES(status_type),
                    status_name = VALUES(status_name),
                    status_url = VALUES(status_url)
            `, [bot_name || 'Broadcast-Sub', prefix || '-', manager_ids || '', allowed_channel_id || '', log_channel_id || '', status_type || 'STREAMING', status_name || '', status_url || '']);
            await connection.end();
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        if (action === 'UPDATE_IP') {
            const [rows] = await connection.execute("SELECT * FROM tokens WHERE token = ?", [token]);
            if (rows.length === 0) {
                await connection.end();
                return { statusCode: 404, headers, body: JSON.stringify({ error: "License not found" }) };
            }
            const license = rows[0];
            if (!isAdmin && license.discord_id !== userId) {
                await connection.end();
                return { statusCode: 403, headers, body: JSON.stringify({ error: "Unauthorized" }) };
            }
            await connection.execute("UPDATE tokens SET ip = ? WHERE token = ?", [ip, token]);
            await logToWebhook('UPDATE_IP', { adminId: userId, token, resource: license.resource, oldIp: license.ip, newIp: ip }, process.env.WEBHOOK_URL, webhookConfig);
            await connection.end();
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        await connection.end();
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid Action" }) };

    } catch (err) {
        console.error('Admin API Error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
