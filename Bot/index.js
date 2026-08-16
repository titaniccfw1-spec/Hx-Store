const {
    Client,
    GatewayIntentBits,
    Collection,
    EmbedBuilder,
    ActivityType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    REST,
    Routes
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const Logger = require('./utils/logger');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.DirectMessages
    ]
});

client.commands = new Collection();
const pendingBroadcasts = new Map();

// تحميل الأوامر
const commandsArray = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if (command.data) {
        client.commands.set(command.data.name, command);
        commandsArray.push(command.data.toJSON());
        Logger.info(`Loaded slash command: ${command.data.name}`);
    }
}

async function fetchBotConfigFromDB() {
    try {
        const connection = await mysql.createConnection(DB_CONFIG);
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

        const [rows] = await connection.execute("SELECT * FROM bot_configs WHERE bot_name = 'Broadcast-Sub'");
        await connection.end();

        if (rows.length > 0) {
            const dbConf = rows[0];
            if (dbConf.prefix) config.prefix = dbConf.prefix;
            if (dbConf.manager_ids) config.managerIds = dbConf.manager_ids.split(',').map(id => id.trim());
            if (dbConf.allowed_channel_id !== undefined) config.allowedChannelId = dbConf.allowed_channel_id || null;
            if (dbConf.log_channel_id !== undefined) config.logChannelId = dbConf.log_channel_id || null;
            if (dbConf.status_type) config.botStatus.type = dbConf.status_type;
            if (dbConf.status_name) config.botStatus.name = dbConf.status_name;
            if (dbConf.status_url !== undefined) config.botStatus.url = dbConf.status_url;
        }
    } catch (err) {
        Logger.error(`Failed to sync bot config from DB: ${err.message}`);
    }
}

client.once('ready', async () => {
    Logger.success(`Bot is ready! Logged in as ${client.user.tag}`);

    // Load dynamic config from MySQL DB
    await fetchBotConfigFromDB();

    // تسجيل Slash Commands تلقائياً
    const rest = new REST({ version: '10' }).setToken(config.token);
    try {
        Logger.info('Started refreshing application (/) commands...');
        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: commandsArray }
        );
        Logger.success('Successfully reloaded application (/) commands.');
    } catch (error) {
        Logger.error(`Error registering slash commands: ${error.message}`);
    }

    // ضبط حالة البوت
    const statusType = config.botStatus.type === 'STREAMING' ? ActivityType.Streaming :
        config.botStatus.type === 'PLAYING' ? ActivityType.Playing :
            config.botStatus.type === 'LISTENING' ? ActivityType.Listening :
                ActivityType.Watching;

    const activityOptions = {
        type: statusType,
        name: config.botStatus.name
    };

    if (config.botStatus.type === 'STREAMING' && config.botStatus.url) {
        activityOptions.url = config.botStatus.url;
    }

    client.user.setActivity(activityOptions);

    // Poll DB every 60 seconds to pick up live config changes from website dashboard
    setInterval(async () => {
        try {
            await fetchBotConfigFromDB();
            // Re-apply status in case it changed
            const sType = config.botStatus.type === 'STREAMING' ? ActivityType.Streaming :
                config.botStatus.type === 'PLAYING' ? ActivityType.Playing :
                    config.botStatus.type === 'LISTENING' ? ActivityType.Listening :
                        ActivityType.Watching;
            const opts = { type: sType, name: config.botStatus.name };
            if (config.botStatus.type === 'STREAMING' && config.botStatus.url) opts.url = config.botStatus.url;
            client.user.setActivity(opts);
            Logger.info('✅ Config refreshed from DB');
        } catch (e) {
            Logger.error(`Config poll error: ${e.message}`);
        }
    }, 60 * 1000);
});

const mysql = require('mysql2/promise');

const DB_CONFIG = {
    host: "mysql-sub-license-system.j.aivencloud.com",
    user: "avnadmin",
    password: "AVNS_sbXdlazTOVSUU0N9uE8",
    database: "defaultdb",
    port: 15196
};

async function checkUserSubscription(userId) {
    try {
        const connection = await mysql.createConnection(DB_CONFIG);
        const [rows] = await connection.execute(
            "SELECT * FROM tokens WHERE discord_id = ? AND status = 'ACTIVE'",
            [userId]
        );
        await connection.end();
        return rows.length > 0;
    } catch (err) {
        Logger.error(`Subscription DB check failed: ${err.message}`);
        return false;
    }
}

// معالجة التفاعلات
client.on('interactionCreate', async (interaction) => {
    try {
        const isManager = Array.isArray(config.managerIds)
            ? config.managerIds.includes(interaction.user.id)
            : false;

        // 1. Check database subscription for user
        const hasActiveSub = await checkUserSubscription(interaction.user.id);
        if (!hasActiveSub) {
            return interaction.reply({
                content: '❌ ليس لديك اشتراك نشط لهذا البوت! يرجى تجديد أو شراء الاشتراك من سيرفر الدسكورد عن طريق فتح تذكرة شراء Hx Store.\nhttps://discord.gg/hx2',
                flags: 64
            });
        }

        // 1. معالجة أوامر الـ Slash

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            // التحقق من الروم المخصص
            if (config.allowedChannelId && interaction.channel.id !== config.allowedChannelId) {
                return interaction.reply({ content: `❌ الأوامر تعمل فقط في القناة المخصصة: <#${config.allowedChannelId}>`, flags: 64 });
            }

            await command.execute(interaction);
            return;
        }

        // 2. فتح نافذة كتابة الرسالة عند الضغط على الزر
        if (interaction.isButton() && interaction.customId === 'open_broadcast_modal') {
            if (!isManager) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية لاستخدام هذا البوت!', flags: 64 });
            }

            const modal = new ModalBuilder()
                .setCustomId('broadcast_message_modal')
                .setTitle('محتوى الرسالة');

            const messageInput = new TextInputBuilder()
                .setCustomId('broadcast_text')
                .setLabel('اكتب الرسالة المراد إرسالها')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('أدخل نص الرسالة هنا...')
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(messageInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
        }

        // 3. عرض قائمة اختيار الفئة المستهدفة للإرسال
        if (interaction.isModalSubmit() && interaction.customId === 'broadcast_message_modal') {
            if (!isManager) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية لاستخدام هذا البوت!', flags: 64 });
            }

            const broadcastText = interaction.fields.getTextInputValue('broadcast_text');
            pendingBroadcasts.set(interaction.user.id, { text: broadcastText });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_target_audience')
                .setPlaceholder('اختر الفئة المستهدفة للإرسال...')
                .addOptions([
                    { label: 'جميع الأعضاء', value: 'all', emoji: '👥' },
                    { label: 'الأعضاء المتواجدين (Online)', value: 'online', emoji: '🟢' },
                    { label: 'الأعضاء غير المتواجدين (Offline)', value: 'offline', emoji: '⚪' },
                    { label: 'عضو محدد', value: 'single', emoji: '👤' }
                ]);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.reply({
                content: 'حدد من تريد إرسال الرسالة إليه:',
                components: [row],
                flags: 64
            });
        }

        // 4. معالجة تحديد الفئة المستهدفة من القائمة
        if (interaction.isStringSelectMenu() && interaction.customId === 'select_target_audience') {
            if (!isManager) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية لاستخدام هذا البوت!', flags: 64 });
            }

            const selectedTarget = interaction.values[0];
            const cachedData = pendingBroadcasts.get(interaction.user.id);

            if (!cachedData) {
                return interaction.reply({ content: '❌ انتهت الجلسة. يرجى الضغط على الزر والمحاولة مرة أخرى.', flags: 64 });
            }

            if (selectedTarget === 'single') {
                const singleUserModal = new ModalBuilder()
                    .setCustomId('single_user_modal')
                    .setTitle('تحديد العضو');

                const userInput = new TextInputBuilder()
                    .setCustomId('target_user_id')
                    .setLabel('أدخل ايدي العضو (User ID)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('مثال: 819614557290364980')
                    .setRequired(true);

                const row = new ActionRowBuilder().addComponents(userInput);
                singleUserModal.addComponents(row);

                return await interaction.showModal(singleUserModal);
            }

            await interaction.deferReply({ flags: 64 });
            await startUltraFastBroadcast(interaction, cachedData.text, selectedTarget);
        }

        // 5. إدخال ايدي العضو المحدد
        if (interaction.isModalSubmit() && interaction.customId === 'single_user_modal') {
            if (!isManager) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية لاستخدام هذا البوت!', flags: 64 });
            }

            const userId = interaction.fields.getTextInputValue('target_user_id').trim();
            const cachedData = pendingBroadcasts.get(interaction.user.id);

            if (!cachedData) {
                return interaction.reply({ content: '❌ انتهت الجلسة. يرجى البدء من جديد.', flags: 64 });
            }

            await interaction.deferReply({ flags: 64 });
            await startUltraFastBroadcast(interaction, cachedData.text, 'single', userId);
        }

    } catch (error) {
        Logger.error(`Interaction Error: ${error.message}`);
    }
});

// دالة الإرسال الفائق السرعة
async function startUltraFastBroadcast(interaction, rawMessage, targetType, targetUserId = null) {
    const guild = interaction.guild;
    const iconURL = guild.iconURL({ dynamic: true });
    await guild.members.fetch();

    let membersToProcess = [];

    if (targetType === 'all') {
        membersToProcess = Array.from(guild.members.cache.filter(m => !m.user.bot).values());
    } else if (targetType === 'online') {
        membersToProcess = Array.from(guild.members.cache.filter(m => !m.user.bot && m.presence && m.presence.status !== 'offline').values());
    } else if (targetType === 'offline') {
        membersToProcess = Array.from(guild.members.cache.filter(m => !m.user.bot && (!m.presence || m.presence.status === 'offline')).values());
    } else if (targetType === 'single') {
        try {
            const singleMember = await guild.members.fetch(targetUserId);
            if (singleMember && !singleMember.user.bot) {
                membersToProcess = [singleMember];
            }
        } catch (e) {
            return interaction.editReply({ content: '❌ لم يتم العثور على هذا العضو! تأكد من صحة الايدي.' });
        }
    }

    if (membersToProcess.length === 0) {
        return interaction.editReply({ content: '❌ لا يوجد أعضاء مطابقين للشروط المحددة!' });
    }

    await interaction.editReply({ content: `🚀 جاري الإرسال بأقصى سرعة لـ (${membersToProcess.length}) عضو...` });

    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;

    const sendPromises = membersToProcess.map(async (member) => {
        try {
            const finalFormattedMessage = `${rawMessage}\n\n\n<@${member.id}>`;
            await member.send(finalFormattedMessage);
            successCount++;
        } catch (err) {
            failCount++;
        }
    });

    await Promise.allSettled(sendPromises);

    const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

    const completionEmbed = new EmbedBuilder()
        .setAuthor({ name: guild.name, iconURL: iconURL })
        .setTitle('✅ تم اكتمال إرسال الرسائل الجماعية')
        .setDescription('تم إرسال جميع الرسائل إلى الأعضاء المستهدفين بنجاح!')
        .setThumbnail(iconURL)
        .addFields(
            { name: '👥 عدد الأعضاء المستهدفين', value: `${membersToProcess.length}`, inline: true },
            { name: '✅ إرسال ناجح', value: `${successCount}`, inline: true },
            { name: '❌ إرسال فاشل (خاص مغلق)', value: `${failCount}`, inline: true },
            { name: '⏱️ الوقت المستغرق', value: `${totalSeconds} ثانية`, inline: false }
        )
        .setColor('#00ff00')
        .setTimestamp();

    await interaction.editReply({
        content: null,
        embeds: [completionEmbed]
    });

    // إرسال اللوج إلى الروم المحدد في الإعدادات
    if (config.logChannelId) {
        try {
            const logChannel = await guild.channels.fetch(config.logChannelId).catch(() => null);
            if (logChannel) {
                const targetLabels = {
                    'all': 'جميع الأعضاء',
                    'online': 'الأعضاء المتواجدين',
                    'offline': 'الأعضاء غير المتواجدين',
                    'single': 'عضو محدد'
                };

                const userAvatar = interaction.user.displayAvatarURL({ dynamic: true });

                let targetValue = targetLabels[targetType] || targetType;
                if (targetType === 'single' && membersToProcess.length > 0) {
                    const recipient = membersToProcess[0];
                    targetValue = `عضو محدد:\n<@${recipient.id}> (${recipient.user.tag})`;
                }

                const logEmbed = new EmbedBuilder()
                    .setAuthor({ name: interaction.user.tag, iconURL: userAvatar })
                    .setTitle('📋 سجل إرسال البرودكاست')
                    .setColor(config.embedColor || '#a6ad3d')
                    .setThumbnail(userAvatar)
                    .addFields(
                        { name: '👤 المرسل', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                        { name: '🎯 الفئة المستهدفة', value: targetValue, inline: true },
                        { name: '📅 الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F> (<t:${Math.floor(Date.now() / 1000)}:R>)`, inline: false },
                        { name: '📊 الإحصائيات', value: `👥 المستهدفين: **${membersToProcess.length}** | ✅ ناجح: **${successCount}** | ❌ فاشل: **${failCount}** | ⏱️ الوقت المستغرق: **${totalSeconds} ثانية**`, inline: false },
                        { name: '📝 محتوى الرسالة', value: rawMessage.length > 1024 ? rawMessage.substring(0, 1021) + '...' : rawMessage, inline: false }
                    )
                    .setFooter({ text: `معرف المستخدم: ${interaction.user.id}`, iconURL: iconURL })
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed] });
            }
        } catch (logError) {
            Logger.error(`Error sending broadcast log: ${logError.message}`);
        }
    }

    pendingBroadcasts.delete(interaction.user.id);
}

client.login(config.token);