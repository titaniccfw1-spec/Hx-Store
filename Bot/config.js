require('dotenv').config();

module.exports = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    prefix: process.env.PREFIX || '-',
    managerIds: process.env.MANAGER_IDS ? process.env.MANAGER_IDS.split(',').map(id => id.trim()) : [],
    allowedChannelId: process.env.ALLOWED_CHANNEL_ID || null,
    logChannelId: process.env.LOG_CHANNEL_ID || null,
    
    dmDelay: parseInt(process.env.DM_DELAY) || 500,
    batchSize: parseInt(process.env.BATCH_SIZE) || 5,
    batchDelay: parseInt(process.env.BATCH_DELAY) || 1000,
    
    embedColor: '#89CFF0',
    maxMessageLength: 2000,
    
    botStatus: {
        type: 'STREAMING',
        name: 'Made by ! S A U D',
        url: 'https://twitch.tv/p8y2'
    },
    
    requiredPermissions: ['SendMessages', 'EmbedLinks', 'ReadMessageHistory']
};