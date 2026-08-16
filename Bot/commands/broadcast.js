const { 
    SlashCommandBuilder,
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('send-setup')
        .setDescription('إرسال لوحة التحكم لبدء إرسال رسائل جماعية'),
    
    async execute(interaction) {
        // التحقق من الروم المسموح
        if (config.allowedChannelId && interaction.channel.id !== config.allowedChannelId) {
            return interaction.reply({ content: '❌ هذا الأمر غير متاح في هذه القناة!', flags: 64 });
        }

        // التحقق من الصلاحيات محصور فقط بالـ MANAGER_IDS
        const isManager = Array.isArray(config.managerIds) 
            ? config.managerIds.includes(interaction.user.id) 
            : interaction.user.id === config.managerIds;

        if (!isManager) {
            return interaction.reply({ content: '❌ ليس لديك صلاحية لاستخدام هذا الأمر!', flags: 64 });
        }

        const iconURL = interaction.guild.iconURL({ dynamic: true });

        const embed = new EmbedBuilder()
            .setAuthor({ name: interaction.guild.name, iconURL: iconURL })
            .setTitle('📢 نظام الإرسال الجماعي')
            .setDescription('اضغط على الزر أدناه لكتابة الرسالة واختيار الأعضاء المستهدفين.')
            .setThumbnail(iconURL)
            .setColor(config.embedColor)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('open_broadcast_modal')
                .setLabel('إنشاء رسالة')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✉️')
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }
};