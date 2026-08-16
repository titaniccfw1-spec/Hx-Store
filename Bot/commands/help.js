const { EmbedBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
    name: 'help',
    description: 'عرض قائمة الأوامر المتاحة',
    usage: '-help',
    
    async execute(message, args) {
        const helpEmbed = new EmbedBuilder()
            .setTitle(' قائمة أوامر البوت')
            .setDescription('بوت إرسال الرسائل الجماعية لأعضاء السيرفر')
            .addFields(
                {
                    name: '📡 -send <message>',
                    value: 'إرسال رسالة لجميع أعضاء السيرفر في الخاص\nمثال: `-send مرحباً بكم جميعاً`',
                    inline: false
                },
                {
                    name: '📊 -show',
                    value: 'عرض إحصائيات البوت والسيرفر',
                    inline: false
                },
                {
                    name: '❓ -help',
                    value: 'لعرض قائمة الاوامر',
                    inline: false
                }
            )
            .setColor(config.embedColor)
            .setFooter({ text: 'Discord Broadcast Bot' })
            .setTimestamp();
        
        await message.reply({ embeds: [helpEmbed] });
    }
};