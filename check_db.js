const mysql = require('mysql2/promise');

async function checkSchema() {
    try {
        const connection = await mysql.createConnection({
            host: "mysql-sub-license-system.j.aivencloud.com",
            user: "avnadmin",
            password: "AVNS_sbXdlazTOVSUU0N9uE8",
            database: "defaultdb",
            port: 15196
        });

        console.log("Connected to Aiven MySQL cloud successfully!");

        // Create table tokens if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                resource VARCHAR(255) NOT NULL,
                discord_id VARCHAR(255) NOT NULL,
                status VARCHAR(50) DEFAULT 'ACTIVE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("Table 'tokens' checked/created successfully!");

        const [tables] = await connection.execute("SHOW TABLES");
        console.log("Tables in defaultdb:", tables);

        const [rows] = await connection.execute("DESCRIBE tokens");
        console.log("Tokens Schema:", JSON.stringify(rows, null, 2));

        await connection.end();
    } catch (err) {
        console.error('Error:', err.message);
    }
}

checkSchema();
