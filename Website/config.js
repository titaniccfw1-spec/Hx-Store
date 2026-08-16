const CONFIG = {
    // --- Store Metadata ---
    storeName: "Hx Store",
    logoURL: "https://i.ibb.co/kst30cYk/Hx-Logo-512x512.png",
    faviconURL: "https://i.ibb.co/kst30cYk/Hx-Logo-512x512.png",
    discordInvite: "https://discord.gg/hx2",
    enableIPCooldown: true, // Toggle Server ID change cooldown
    ipCooldownTime: 10, // Cooldown time in minutes
    discordClientId: "1538460016573550652", // Your Discord Client ID
    redirectUri: window.location.origin + window.location.pathname, // Auto-detect current URL as redirect

    // --- Admin Settings ---
    adminIds: ["819614557290364980"], // List of Discord IDs that can access the Admin Panel

    // --- Webhook Logging ---
    webhookConfig: {
        url: "https://discord.com/api/webhooks/1538466315822563389/m10wCTQr1IX0moXAmTc1cFMKrH5_uwf_1JXlxZxC5PqVLOf-vKdOp7DHx2n_uEgID_VR",
        name: "Whitelist Store Website Logs",
        avatar: "https://i.ibb.co/kst30cYk/Hx-Logo-512x512.png"
    },

    // --- Section ---
    tagline: "Hx Store",
    heroDescription: "منصة اشتراكات وتراخيص بوتات الديسكورد الاحترافية. قم بإدارة اشتراكات بوتاتك وسيرفراتك بكل سهولة وأمان.",

    // --- Navigation ---
    navItems: [
        { label: "الصفحة الرئيسية", target: "home" },
        { label: "بوتات المتجر", target: "scripts" },
        { label: "اشتراكاتي", target: "license" }
    ],

    // --- Bots Database ---
    scripts: [
        {
            id: 1,
            name: "Broadcast Bot",
            description: "بوت ارسال للاعضاء مع تحكم كامل  .",
            price: "$9.99 / Month - 19.99 / 3 month",
            image: "https://i.ibb.co/j97cvnZt/Bot.png",
            category: "Discord Bot",
            tag: "Broadcast Bot",
            downloadUrl: "https://discord.com/oauth2/authorize?client_id=1538449747915055175&permissions=8&integration_type=0&scope=bot+applications.commands"
        }
    ],

    // --- Footer Text ---
    footerText: "© 2026 Hx Store. جميع الحقوق محفوظة."
};

