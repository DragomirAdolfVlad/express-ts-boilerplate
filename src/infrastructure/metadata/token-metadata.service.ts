/**
 * Token Metadata Service
 * 
 * Fetches comprehensive token metadata from multiple sources:
 * 1. Creation event data
 * 2. ERC-20 contract calls
 * 3. Off-chain metadata (IPFS/HTTP)
 * 4. Monad-specific contract methods
 */

import { ethers } from 'ethers';

export interface TokenMetadata {
    // Basic ERC-20 metadata
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: string;

    // Extended metadata
    description?: string;
    image?: string;
    website?: string;
    twitter?: string;
    telegram?: string;

    // Contract info
    owner?: string;
    tokenURI?: string;

    // Monad-specific
    bondingCurve?: string;
    creator?: string;

    // Metadata source tracking
    sources: {
        erc20: boolean;
        offchain: boolean;
        event: boolean;
    };
}

export class TokenMetadataService {
    private provider: ethers.JsonRpcProvider;
    private cache = new Map<string, TokenMetadata>();

    // nad.fun API configuration
    private readonly NAD_FUN_API_BASE = process.env['NAD_FUN_API_BASE'] || 'https://testnet-v3-api.nad.fun';

    // Standard ERC-20 ABI
    private readonly ERC20_ABI = [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
        'function totalSupply() view returns (uint256)',
        'function owner() view returns (address)',
        'function getOwner() view returns (address)',
        'function tokenURI() view returns (string)',
        'function tokenURI(uint256) view returns (string)'
    ];

    constructor(rpcUrl: string) {
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
    }

    /**
     * Get comprehensive token metadata from all available sources
     */
    async getTokenMetadata(tokenAddress: string, creationEventData?: any): Promise<TokenMetadata> {
        // Check cache first
        if (this.cache.has(tokenAddress)) {
            return this.cache.get(tokenAddress)!;
        }

        console.log(`[🔍 METADATA] Fetching metadata for token: ${tokenAddress}`);

        const metadata: TokenMetadata = {
            name: '',
            symbol: '',
            decimals: 18,
            totalSupply: '0',
            sources: {
                erc20: false,
                offchain: false,
                event: false
            }
        };

        try {
            // 1. Extract from creation event data (if available)
            if (creationEventData) {
                await this.extractFromEvent(metadata, creationEventData);
            }

            // 2. Try nad.fun API first (they have better metadata)
            const nadFunSuccess = await this.fetchNadFunMetadata(metadata, tokenAddress);

            // 3. If nad.fun didn't work, fetch from ERC-20 contract
            if (!nadFunSuccess) {
                await this.fetchERC20Metadata(metadata, tokenAddress);
            }

            // 4. Fetch off-chain metadata if tokenURI is available and we don't have nad.fun data
            if (metadata.tokenURI && !nadFunSuccess) {
                await this.fetchOffChainMetadata(metadata);
            }

            // Cache the result
            this.cache.set(tokenAddress, metadata);

            console.log(`[✅ METADATA] Successfully fetched metadata for ${tokenAddress}:`, {
                name: metadata.name,
                symbol: metadata.symbol,
                hasImage: !!metadata.image,
                hasDescription: !!metadata.description,
                sources: metadata.sources
            });

            return metadata;

        } catch (error) {
            console.error(`[❌ METADATA] Failed to fetch metadata for ${tokenAddress}:`, error);

            // Return minimal metadata with fallbacks
            metadata.name = metadata.name || 'Unknown Token';
            metadata.symbol = metadata.symbol || 'UNKNOWN';

            return metadata;
        }
    }

    /**
     * Fetch metadata from nad.fun API
     */
    private async fetchNadFunMetadata(metadata: TokenMetadata, tokenAddress: string): Promise<boolean> {
        try {
            const url = `${this.NAD_FUN_API_BASE}/token/metadata/${tokenAddress}`;
            console.log(`[🎯 NAD.FUN] Fetching metadata from: ${url}`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Monad-Token-Tracker/1.0'
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 404) {
                    console.log(`[🎯 NAD.FUN] Token not found in nad.fun API: ${tokenAddress}`);
                    return false;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json() as any;
            const tokenMetadata = data?.token_metadata;

            if (!tokenMetadata) {
                console.log(`[🎯 NAD.FUN] No token_metadata in response for: ${tokenAddress}`);
                return false;
            }

            // Extract metadata from nad.fun API response based on docs format
            if (tokenMetadata.name) metadata.name = tokenMetadata.name;
            if (tokenMetadata.symbol) metadata.symbol = tokenMetadata.symbol;
            if (tokenMetadata.description) metadata.description = tokenMetadata.description;
            if (tokenMetadata.image_uri) metadata.image = tokenMetadata.image_uri;
            if (tokenMetadata.website) metadata.website = tokenMetadata.website;
            if (tokenMetadata.twitter) metadata.twitter = tokenMetadata.twitter;
            if (tokenMetadata.telegram) metadata.telegram = tokenMetadata.telegram;
            if (tokenMetadata.creator) metadata.creator = tokenMetadata.creator;
            if (tokenMetadata.total_supply) metadata.totalSupply = tokenMetadata.total_supply;
            if (tokenMetadata.token_address) metadata.owner = tokenMetadata.token_address;

            // Mark as successful nad.fun fetch
            metadata.sources.offchain = true;

            console.log(`[✅ NAD.FUN] Successfully fetched metadata from nad.fun API:`, {
                name: metadata.name,
                symbol: metadata.symbol,
                hasImage: !!metadata.image,
                hasDescription: !!metadata.description,
                creator: metadata.creator
            });

            return true;

        } catch (error) {
            console.warn(`[⚠️ NAD.FUN] Failed to fetch from nad.fun API for ${tokenAddress}:`, error);
            return false;
        }
    }

    /**
     * Extract metadata from creation event data
     */
    private async extractFromEvent(metadata: TokenMetadata, eventData: any): Promise<void> {
        try {
            if (eventData.name) metadata.name = eventData.name;
            if (eventData.symbol) metadata.symbol = eventData.symbol;
            if (eventData.creator) metadata.creator = eventData.creator;
            if (eventData.bondingCurve) metadata.bondingCurve = eventData.bondingCurve;
            if (eventData.tokenURI) metadata.tokenURI = eventData.tokenURI;

            metadata.sources.event = true;
            console.log(`[📋 METADATA] Extracted from event:`, {
                name: metadata.name,
                symbol: metadata.symbol,
                creator: metadata.creator
            });
        } catch (error) {
            console.warn(`[⚠️ METADATA] Failed to extract from event:`, error);
        }
    }

    /**
     * Fetch standard ERC-20 metadata from contract
     */
    private async fetchERC20Metadata(metadata: TokenMetadata, tokenAddress: string): Promise<void> {
        try {
            const contract = new ethers.Contract(tokenAddress, this.ERC20_ABI, this.provider);

            // Fetch basic ERC-20 data with individual try-catch blocks
            try {
                if (contract['name']) {
                    const name = await contract['name']();
                    if (name) metadata.name = name;
                }
            } catch (error) {
                console.debug('Failed to get name:', error);
            }

            try {
                if (contract['symbol']) {
                    const symbol = await contract['symbol']();
                    if (symbol) metadata.symbol = symbol;
                }
            } catch (error) {
                console.debug('Failed to get symbol:', error);
            }

            try {
                if (contract['decimals']) {
                    const decimals = await contract['decimals']();
                    metadata.decimals = Number(decimals);
                }
            } catch (error) {
                console.debug('Failed to get decimals:', error);
            }

            try {
                if (contract['totalSupply']) {
                    const totalSupply = await contract['totalSupply']();
                    metadata.totalSupply = totalSupply.toString();
                }
            } catch (error) {
                console.debug('Failed to get totalSupply:', error);
            }

            // Try to get owner
            try {
                if (contract['owner']) {
                    const owner = await contract['owner']();
                    metadata.owner = owner;
                }
            } catch {
                try {
                    if (contract['getOwner']) {
                        const owner = await contract['getOwner']();
                        metadata.owner = owner;
                    }
                } catch {
                    // No owner method available
                }
            }

            // Try to get tokenURI
            try {
                if (contract['tokenURI']) {
                    const tokenURI = await contract['tokenURI']();
                    metadata.tokenURI = tokenURI;
                }
            } catch {
                try {
                    // Some contracts use tokenURI(uint256)
                    if (contract['tokenURI']) {
                        const tokenURI = await contract['tokenURI'](0);
                        metadata.tokenURI = tokenURI;
                    }
                } catch {
                    // No tokenURI available
                }
            }

            metadata.sources.erc20 = true;
            console.log(`[🔗 METADATA] Fetched from contract:`, {
                name: metadata.name,
                symbol: metadata.symbol,
                decimals: metadata.decimals,
                totalSupply: metadata.totalSupply,
                owner: metadata.owner,
                hasTokenURI: !!metadata.tokenURI
            });

        } catch (error) {
            console.warn(`[⚠️ METADATA] Failed to fetch ERC-20 metadata:`, error);
        }
    }

    /**
     * Fetch off-chain metadata from IPFS or HTTP
     */
    private async fetchOffChainMetadata(metadata: TokenMetadata): Promise<void> {
        if (!metadata.tokenURI) return;

        try {
            let url = metadata.tokenURI;

            // Convert IPFS URLs to HTTP gateway
            if (url.startsWith('ipfs://')) {
                url = url.replace('ipfs://', 'https://ipfs.io/ipfs/');
            }

            console.log(`[🌐 METADATA] Fetching off-chain metadata from: ${url}`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Monad-Token-Tracker/1.0'
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const offChainData = await response.json() as any;

            // Extract standard metadata fields
            if (offChainData?.name && !metadata.name) metadata.name = offChainData.name;
            if (offChainData?.description) metadata.description = offChainData.description;
            
            // Handle multiple image field variations
            const imageFields = ['image', 'logo', 'icon', 'avatar', 'picture'];
            for (const field of imageFields) {
                if (offChainData?.[field]) {
                    let imageUrl = offChainData[field];
                    if (typeof imageUrl === 'string') {
                        // Convert IPFS URLs to HTTP gateway
                        if (imageUrl.startsWith('ipfs://')) {
                            imageUrl = imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
                        }
                        metadata.image = imageUrl;
                        break;
                    }
                }
            }

            // Extract social links with multiple field variations
            const websiteFields = ['external_url', 'website', 'homepage', 'url', 'link'];
            for (const field of websiteFields) {
                if (offChainData?.[field]) {
                    metadata.website = offChainData[field];
                    break;
                }
            }

            const twitterFields = ['twitter', 'twitter_url', 'x', 'x_url'];
            for (const field of twitterFields) {
                if (offChainData?.[field]) {
                    let twitterUrl = offChainData[field];
                    // Clean up Twitter URLs
                    if (typeof twitterUrl === 'string') {
                        if (twitterUrl.startsWith('@')) {
                            twitterUrl = `https://twitter.com/${twitterUrl.substring(1)}`;
                        } else if (!twitterUrl.startsWith('http')) {
                            twitterUrl = `https://twitter.com/${twitterUrl}`;
                        }
                        metadata.twitter = twitterUrl;
                        break;
                    }
                }
            }

            const telegramFields = ['telegram', 'telegram_url', 'tg', 'tg_url'];
            for (const field of telegramFields) {
                if (offChainData?.[field]) {
                    let telegramUrl = offChainData[field];
                    // Clean up Telegram URLs
                    if (typeof telegramUrl === 'string') {
                        if (telegramUrl.startsWith('@')) {
                            telegramUrl = `https://t.me/${telegramUrl.substring(1)}`;
                        } else if (!telegramUrl.startsWith('http')) {
                            telegramUrl = `https://t.me/${telegramUrl}`;
                        }
                        metadata.telegram = telegramUrl;
                        break;
                    }
                }
            }

            // Handle attributes array (common in NFT metadata)
            if (offChainData?.attributes && Array.isArray(offChainData.attributes)) {
                for (const attr of offChainData.attributes) {
                    if (!attr?.trait_type || !attr?.value) continue;
                    
                    const traitType = attr.trait_type.toLowerCase();
                    const value = attr.value;
                    
                    // Website attributes
                    if (['website', 'homepage', 'url', 'link'].includes(traitType) && !metadata.website) {
                        metadata.website = value;
                    }
                    
                    // Twitter attributes
                    if (['twitter', 'x', 'twitter_url', 'x_url'].includes(traitType) && !metadata.twitter) {
                        let twitterUrl = value;
                        if (twitterUrl.startsWith('@')) {
                            twitterUrl = `https://twitter.com/${twitterUrl.substring(1)}`;
                        } else if (!twitterUrl.startsWith('http')) {
                            twitterUrl = `https://twitter.com/${twitterUrl}`;
                        }
                        metadata.twitter = twitterUrl;
                    }
                    
                    // Telegram attributes
                    if (['telegram', 'tg', 'telegram_url', 'tg_url'].includes(traitType) && !metadata.telegram) {
                        let telegramUrl = value;
                        if (telegramUrl.startsWith('@')) {
                            telegramUrl = `https://t.me/${telegramUrl.substring(1)}`;
                        } else if (!telegramUrl.startsWith('http')) {
                            telegramUrl = `https://t.me/${telegramUrl}`;
                        }
                        metadata.telegram = telegramUrl;
                    }
                    
                    // Image attributes
                    if (['image', 'logo', 'icon', 'avatar', 'picture'].includes(traitType) && !metadata.image) {
                        let imageUrl = value;
                        if (imageUrl.startsWith('ipfs://')) {
                            imageUrl = imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
                        }
                        metadata.image = imageUrl;
                    }
                }
            }

            // Handle social links object (another common pattern)
            if (offChainData?.socials || offChainData?.social || offChainData?.links) {
                const socialObj = offChainData.socials || offChainData.social || offChainData.links;
                
                if (socialObj?.website && !metadata.website) metadata.website = socialObj.website;
                if (socialObj?.twitter && !metadata.twitter) metadata.twitter = socialObj.twitter;
                if (socialObj?.telegram && !metadata.telegram) metadata.telegram = socialObj.telegram;
                if (socialObj?.x && !metadata.twitter) metadata.twitter = socialObj.x;
            }

            metadata.sources.offchain = true;
            console.log(`[🌐 METADATA] Fetched off-chain metadata:`, {
                hasDescription: !!metadata.description,
                hasImage: !!metadata.image,
                hasWebsite: !!metadata.website,
                hasSocials: !!(metadata.twitter || metadata.telegram)
            });

        } catch (error) {
            console.warn(`[⚠️ METADATA] Failed to fetch off-chain metadata from ${metadata.tokenURI}:`, error);
        }
    }

    /**
     * Clear cache for a specific token (useful for updates)
     */
    clearCache(tokenAddress: string): void {
        this.cache.delete(tokenAddress);
    }

    /**
     * Clear entire cache
     */
    clearAllCache(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number; tokens: string[] } {
        return {
            size: this.cache.size,
            tokens: Array.from(this.cache.keys())
        };
    }
}