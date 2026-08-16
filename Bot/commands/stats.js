const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const rateLimiter = require('../utils/rateLimiter');

module.exports = {
    name: 'show',
    description: 'عرض إحصائيات البوت والسيرفر',
    usage: '-show',
    
    async execute(message, args) {
        const guild = message.guild;
        
        await guild.members.fetch();
        const totalMembers = guild.memberCount;
        const botMembers = guild.members.cache.filter(member => member.user.bot).size;
        const humanMembers = totalMembers - botMembers;
        
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        
        const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
        
        const memoryUsage = process.memoryUsage();
        const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        
        const statsEmbed = new EmbedBuilder()
            .setTitle('📊 إحصائيات البوت والسيرفر')
            .addFields(
                {
                    name: ' معلومات السيرفر',
                    value: `**اسم السيرفر:** ${guild.name}\n**إجمالي الأعضاء:** ${totalMembers}\n**الأعضاء البشر:** ${humanMembers}\n**البوتات:** ${botMembers}`,
                    inline: true
                },
                {
                    name: ' معلومات البوت',
                    value: `**وقت التشغيل:** ${uptimeString}\n**استخدام الذاكرة:** ${memoryMB} MB\n**البنق:** ${message.client.ws.ping}ms`,
                    inline: true
                },
                {
                    name: ' إعدادات الإرسال',
                    value: `**تأخير بين الرسائل:** ${config.dmDelay}ms\n**حجم المجموعة:** ${config.batchSize}\n**تأخير المجموعات:** ${config.batchDelay}ms`,
                    inline: false
                },
                {
                    name: '📡 حالة الإرسال',
                    value: rateLimiter.isCurrentlyProcessing() 
                        ? `🟡 جاري الإرسال (${rateLimiter.getQueueLength()} في الانتظار)`
                        : '🟢 جاهز للإرسال',
                    inline: false
                }
            )
            .setColor(config.embedColor)
            .setThumbnail(guild.iconURL())
            .setFooter({ text: `طلب بواسطة ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setTimestamp();
        
        await message.reply({ embeds: [statsEmbed] });
    }
};