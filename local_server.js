const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const DB_CONFIG = {
    host: "mysql-sub-license-system.j.aivencloud.com",
    user: "avnadmin",
    password: "AVNS_sbXdlazTOVSUU0N9uE8",
    database: "defaultdb",
    port: 15196
};

const BOT_TOKEN = "MTUzODQ0OTc0NzkxNTA1NTE3NQ.G9U_Et.bIE0oKtaB4axbyp8i8Y1kTa399-tZukgmGkTjc";
const DISCORD_API = "https://discord.com/api/v10";

const WEBHOOK_URL = "https://discord.com/api/webhooks/1538466315822563389/m10wCTQr1IX0moXAmTc1cFMKrH5_uwf_1JXlxZxC5PqVLOf-vKdOp7DHx2n_uEgID_VR";

function generateToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = 'FS-';
    for (let i = 0; i < 8; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
    return token;
}

async function logToWebhook(action, data, customConfig = {}) {
    if (!WEBHOOK_URL) return;
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
        await axios.post(WEBHOOK_URL, {
            username: name,
            avatar_url: avatar,
            embeds: [embed]
        });
    } catch (err) {
        console.error('Webhook error:', err.message);
    }
}

// OAuth Auth Endpoint
app.post('/api/auth', async (req, res) => {
    try {
        const { code, redirect_uri } = req.body;
        if (!code || !redirect_uri) return res.status(400).json({ error: "Missing code or redirect_uri" });

        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token',
            new URLSearchParams({
                client_id: "1538460016573550652",
                client_secret: "LqR_VnAmjBbvjdbHbAM89MOcZU470QjA",
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirect_uri
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const { access_token } = tokenResponse.data;
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const user = userResponse.data;
        let licenses = [];

        try {
            const connection = await mysql.createConnection(DB_CONFIG);
            const [rows] = await connection.execute("SELECT * FROM tokens WHERE discord_id = ?", [user.id]);
            licenses = rows.map(r => ({
                id: String(r.id),
                name: r.resource,
                discord_id: r.discord_id,
                status: r.status || 'ACTIVE'
            }));
            await connection.end();
        } catch (dbErr) {
            console.error("DB Auth error:", dbErr.message);
        }

        res.json({
            id: user.id,
            username: user.username,
            avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
            licenses
        });
    } catch (err) {
        console.error("Auth handler error:", err.message);
        res.status(500).json({ error: "Auth failed", details: err.message });
    }
});

// Admin Endpoint
app.post('/api/admin', async (req, res) => {
    try {
        const { action, userId, targetUser, resource, token, webhookName, webhookAvatar, newDiscordID } = req.body;
        const webhookConfig = { name: webhookName, avatar: webhookAvatar };
        const adminIds = ["819614557290364980"];
        const isAdmin = adminIds.includes(userId);

        const connection = await mysql.createConnection(DB_CONFIG);

        if (action === 'LIST_ALL') {
            let query = "SELECT * FROM tokens";
            let params = [];
            if (!isAdmin) {
                query += " WHERE discord_id = ?";
                params.push(userId);
            }
            const [rows] = await connection.execute(query, params);
            await connection.end();
            return res.json({
                licenses: rows.map(r => ({
                    id: String(r.id),
                    name: r.resource,
                    discord_id: r.discord_id,
                    status: r.status || 'ACTIVE'
                }))
            });
        }

        if (action === 'CREATE') {
            const [result] = await connection.execute(
                "INSERT INTO tokens (resource, discord_id, status) VALUES (?, ?, 'ACTIVE')",
                [resource, targetUser]
            );
            const insertedId = String(result.insertId);
            await connection.end();
            await logToWebhook('CREATE', { adminId: userId, targetUser, resource }, webhookConfig);
            return res.json({ success: true, id: insertedId });
        }

        if (action === 'UPDATE_STATUS') {
            const { status: newStatus, token: id } = req.body;
            const [rows] = await connection.execute("SELECT * FROM tokens WHERE id = ?", [id]);
            const resourceName = rows.length > 0 ? rows[0].resource : 'Unknown Bot';
            const targetUser = rows.length > 0 ? rows[0].discord_id : 'Unknown';
            
            await connection.execute("UPDATE tokens SET status = ? WHERE id = ?", [newStatus, id]);
            await connection.end();
            await logToWebhook('UPDATE_STATUS', { adminId: userId, targetUser, resource: resourceName, status: newStatus }, webhookConfig);
            return res.json({ success: true });
        }

        if (action === 'UPDATE_DISCORD_ID') {
            const [rows] = await connection.execute("SELECT * FROM tokens WHERE id = ?", [token]);
            const resourceName = rows.length > 0 ? rows[0].resource : 'Unknown Bot';
            const oldDiscordID = rows.length > 0 ? rows[0].discord_id : 'Unknown';

            await connection.execute("UPDATE tokens SET discord_id = ? WHERE id = ?", [newDiscordID, token]);
            await connection.end();
            await logToWebhook('UPDATE_DISCORD_ID', { adminId: userId, resource: resourceName, oldDiscordID, newDiscordID }, webhookConfig);
            return res.json({ success: true });
        }

        if (action === 'DELETE') {
            const [rows] = await connection.execute("SELECT * FROM tokens WHERE id = ?", [token]);
            const resourceName = rows.length > 0 ? rows[0].resource : 'Unknown Bot';
            const targetUser = rows.length > 0 ? rows[0].discord_id : 'Unknown';

            await connection.execute("DELETE FROM tokens WHERE id = ?", [token]);
            await connection.end();
            await logToWebhook('DELETE', { adminId: userId, targetUser, resource: resourceName }, webhookConfig);
            return res.json({ success: true });
        }

        if (action === 'GET_BOT_CONFIG') {
            const { bot_name } = req.body;
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
            return res.json({ success: true, config: configData });
        }

        if (action === 'UPDATE_BOT_CONFIG') {
            const { bot_name, prefix, manager_ids, allowed_channel_id, log_channel_id, status_type, status_name, status_url } = req.body;
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
            return res.json({ success: true });
        }

        if (action === 'GET_USER_GUILDS') {
            // Fetch guilds user manages using their access token
            const { access_token } = req.body;
            await connection.end();
            if (!access_token) return res.status(400).json({ error: 'Missing access_token' });
            try {
                const guildRes = await axios.get(`${DISCORD_API}/users/@me/guilds`, {
                    headers: { Authorization: `Bearer ${access_token}` }
                });
                // Filter to guilds where user has ADMINISTRATOR (0x8) or MANAGE_GUILD (0x20)
                const manageable = guildRes.data.filter(g => {
                    const perms = BigInt(g.permissions);
                    return (perms & BigInt(0x8)) !== BigInt(0) || (perms & BigInt(0x20)) !== BigInt(0);
                });
                return res.json({ guilds: manageable });
            } catch(err) {
                return res.status(500).json({ error: err.message });
            }
        }

        if (action === 'GET_BOT_GUILDS') {
            // Return list of guild IDs where the bot is present
            await connection.end();
            try {
                const guildRes = await axios.get(`${DISCORD_API}/users/@me/guilds`, {
                    headers: { Authorization: `Bot ${BOT_TOKEN}` }
                });
                return res.json({ guild_ids: guildRes.data.map(g => g.id) });
            } catch(err) {
                return res.status(500).json({ error: err.message });
            }
        }

        if (action === 'GET_GUILD_CHANNELS') {
            const { guild_id } = req.body;
            await connection.end();
            if (!guild_id) return res.status(400).json({ error: 'Missing guild_id' });
            try {
                const chanRes = await axios.get(`${DISCORD_API}/guilds/${guild_id}/channels`, {
                    headers: { Authorization: `Bot ${BOT_TOKEN}` }
                });
                // Only text channels (type 0) and categories (type 4)
                const channels = chanRes.data
                    .filter(c => c.type === 0 || c.type === 5)
                    .map(c => ({ id: c.id, name: c.name, type: c.type, parent_id: c.parent_id, position: c.position }))
                    .sort((a, b) => a.position - b.position);
                return res.json({ channels });
            } catch(err) {
                return res.status(500).json({ error: err.message });
            }
        }

        if (action === 'GET_GUILD_MEMBERS') {
            const { guild_id } = req.body;
            await connection.end();
            if (!guild_id) return res.status(400).json({ error: 'Missing guild_id' });
            try {
                const memberRes = await axios.get(`${DISCORD_API}/guilds/${guild_id}/members?limit=100`, {
                    headers: { Authorization: `Bot ${BOT_TOKEN}` }
                });
                const members = memberRes.data
                    .filter(m => !m.user.bot)
                    .map(m => ({
                        id: m.user.id,
                        username: m.user.username,
                        display_name: m.nick || m.user.global_name || m.user.username,
                        avatar: m.user.avatar
                            ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png`
                            : `https://cdn.discordapp.com/embed/avatars/${parseInt(m.user.discriminator || '0') % 5}.png`
                    }));
                return res.json({ members });
            } catch(err) {
                return res.status(500).json({ error: err.message });
            }
        }

        await connection.end();
        res.status(400).json({ error: "Invalid action" });
    } catch (err) {
        console.error("Admin API Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🚀 Local Backend Server connected to Aiven Cloud listening on http://localhost:${PORT}`);
});
