const config = require('../config');

class RateLimiter {
    constructor() {
        this.isProcessing = false;
        this.queue = [];
    }
    
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;
        
        this.isProcessing = true;
        
        while (this.queue.length > 0) {
            const batch = this.queue.splice(0, config.batchSize);
            
            await Promise.all(batch.map(async (task) => {
                try {
                    await task();
                } catch (error) {
                    console.error('Error processing task:', error);
                }
            }));

            await this.delay(config.dmDelay);
            
            if (this.queue.length > 0 && config.batchDelay > 0) {
                await this.delay(config.batchDelay);
            }
        }
        
        this.isProcessing = false;
    }
    
    addTask(task) {
        this.queue.push(task);
        this.processQueue();
    }
    
    getQueueLength() {
        return this.queue.length;
    }
    
    isCurrentlyProcessing() {
        return this.isProcessing;
    }
}

module.exports = new RateLimiter();