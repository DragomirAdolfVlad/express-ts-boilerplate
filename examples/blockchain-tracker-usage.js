/**
 * Example usage of the Blockchain Tracker API
 * 
 * This example demonstrates how to use the various blockchain tracking endpoints
 * to monitor Monad blockchain data and nad.fun trading activity.
 * 
 * To use:
 * 1. Start the API server: npm run dev
 * 2. Replace AUTH_TOKEN with a real JWT token from /api/v1/auth/login
 * 3. Run: node examples/blockchain-tracker-usage.js
 */

const API_BASE = 'http://localhost:3000/api/v1';
const AUTH_TOKEN = 'your-jwt-token-here';

class BlockchainTracker {
    constructor(baseUrl = API_BASE, authToken = null) {
        this.baseUrl = baseUrl;
        this.authToken = authToken;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.authToken && !headers.Authorization) {
            headers.Authorization = `Bearer ${this.authToken}`;
        }

        // Using a simple HTTP client simulation
        console.log(`📡 ${options.method || 'GET'} ${url}`);
        return { 
            success: true, 
            data: { message: 'Example response - implement with actual fetch/axios' }
        };
    }

    // Blockchain Data Methods
    async getLatestBlocks(limit = 10) {
        return this.request(`/blockchain/blocks?limit=${limit}`);
    }

    async getBlock(blockNumber, includeTransactions = false) {
        return this.request(`/blockchain/blocks/${blockNumber}?includeTransactions=${includeTransactions}`);
    }

    async getTransaction(txHash) {
        return this.request(`/blockchain/transactions/${txHash}`);
    }

    async searchBlockchain(query) {
        return this.request(`/blockchain/search?q=${encodeURIComponent(query)}`);
    }

    // Address Tracking Methods (require auth)
    async trackAddress(address, label = null, alerts = null) {
        const data = { address };
        if (label) data.label = label;
        if (alerts) data.alerts = alerts;

        return this.request('/address-tracking/track', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async getTrackedAddresses() {
        return this.request('/address-tracking/tracked');
    }

    // Token Analytics Methods
    async getTopTokens(sortBy = 'volume', limit = 50) {
        return this.request(`/tokens/top?sortBy=${sortBy}&limit=${limit}`);
    }

    async searchTokens(query, limit = 20) {
        return this.request(`/tokens/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    }

    // nad.fun Integration Methods
    async getTrendingPools(sortBy = 'volume', limit = 20) {
        return this.request(`/nad-fun/trending?sortBy=${sortBy}&limit=${limit}`);
    }

    async getTradingStats(hours = 24) {
        return this.request(`/nad-fun/stats?hours=${hours}`);
    }
}

// Example usage
console.log('📚 Blockchain Tracker API Examples');
console.log('==================================\n');

const tracker = new BlockchainTracker();
const authTracker = new BlockchainTracker(API_BASE, AUTH_TOKEN);

// Example API calls
async function runExamples() {
    console.log('🔍 Getting latest blocks...');
    await tracker.getLatestBlocks(5);

    console.log('\n📊 Getting top tokens...');
    await tracker.getTopTokens('volume', 10);

    console.log('\n💹 Getting trending pools...');
    await tracker.getTrendingPools('volume', 5);

    console.log('\n📈 Getting trading stats...');
    await tracker.getTradingStats(24);

    console.log('\n🏠 Tracking address (requires auth)...');
    await authTracker.trackAddress(
        '0x1234567890abcdef1234567890abcdef12345678',
        'Example Wallet',
        { incomingTransactions: true }
    );

    console.log('\n✅ Example API calls completed!');
    console.log('\nReplace the request() method with actual HTTP calls using fetch or axios.');
}

runExamples().catch(console.error);

module.exports = { BlockchainTracker };