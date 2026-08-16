class Logger {
    static info(message) {
        console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
    }
    
    static warn(message) {
        console.log(`[WARN] ${new Date().toISOString()} - ${message}`);
    }
    
    static error(message) {
        console.log(`[ERROR] ${new Date().toISOString()} - ${message}`);
    }
    
    static success(message) {
        console.log(`[SUCCESS] ${new Date().toISOString()} - ${message}`);
    }
}

module.exports = Logger;
