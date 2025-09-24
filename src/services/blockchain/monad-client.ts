/**
 * Monad Blockchain RPC Client Service
 * Handles all communication with Monad blockchain nodes
 */

import { log, LogContext } from '../../utils/logger';
import { 
    InternalServerError, 
    ExternalServiceError,
    ValidationError 
} from '../../utils/errors';
import { HealthCheckableService, ServiceHealthCheck } from '../database/service-base';

export interface MonadBlock {
    number: string;
    hash: string;
    parentHash: string;
    timestamp: string;
    gasLimit: string;
    gasUsed: string;
    baseFeePerGas?: string;
    difficulty?: string;
    totalDifficulty?: string;
    miner?: string;
    extraData?: string;
    size?: string;
    transactions: string[] | MonadTransaction[];
}

export interface MonadTransaction {
    hash: string;
    blockNumber: string;
    blockHash: string;
    transactionIndex: string;
    from: string;
    to?: string;
    value: string;
    gasPrice: string;
    gas: string;
    gasUsed?: string;
    nonce: string;
    input?: string;
    status?: string;
}

export interface MonadTransactionReceipt {
    transactionHash: string;
    blockNumber: string;
    blockHash: string;
    transactionIndex: string;
    from: string;
    to?: string;
    gasUsed: string;
    status: string;
    logs: MonadLog[];
}

export interface MonadLog {
    address: string;
    topics: string[];
    data: string;
    blockNumber: string;
    blockHash: string;
    transactionIndex: string;
    logIndex: string;
}

export interface MonadClientConfig {
    rpcUrl: string;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
}

export class MonadClientService extends HealthCheckableService {
    private config: MonadClientConfig;
    private requestId: number = 0;

    constructor(config?: Partial<MonadClientConfig>) {
        super('MonadClientService');
        this.config = {
            rpcUrl: process.env.MONAD_RPC_URL || 'http://localhost:8545',
            timeout: parseInt(process.env.MONAD_RPC_TIMEOUT || '30000'),
            retryAttempts: parseInt(process.env.MONAD_RETRY_ATTEMPTS || '3'),
            retryDelay: parseInt(process.env.MONAD_RETRY_DELAY || '1000'),
            ...config
        };
    }

    /**
     * Get the latest block number
     */
    async getLatestBlockNumber(context?: LogContext): Promise<bigint> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Getting latest block number');
            
            const response = await this.makeRpcCall('eth_blockNumber', [], context);
            const blockNumber = BigInt(response.result);
            
            logger.debug('Latest block number retrieved', { blockNumber: blockNumber.toString() });
            return blockNumber;
            
        } catch (error) {
            logger.error('Failed to get latest block number', error instanceof Error ? error : new Error(String(error)));
            throw new ExternalServiceError(
                'Failed to get latest block number from Monad node',
                'MONAD_RPC_ERROR',
                { rpcUrl: this.config.rpcUrl },
                context
            );
        }
    }

    /**
     * Get block by number with full transaction details
     */
    async getBlockByNumber(blockNumber: bigint | string, includeTransactions: boolean = true, context?: LogContext): Promise<MonadBlock> {
        const logger = log.child(context || {});
        
        try {
            const blockNumHex = typeof blockNumber === 'bigint' ? 
                `0x${blockNumber.toString(16)}` : blockNumber;
            
            logger.debug('Getting block by number', { blockNumber: blockNumHex, includeTransactions });
            
            const response = await this.makeRpcCall(
                'eth_getBlockByNumber', 
                [blockNumHex, includeTransactions], 
                context
            );
            
            if (!response.result) {
                throw new ValidationError(`Block ${blockNumber} not found`);
            }
            
            logger.debug('Block retrieved successfully', { 
                blockHash: response.result.hash,
                transactionCount: response.result.transactions?.length || 0
            });
            
            return response.result;
            
        } catch (error) {
            logger.error('Failed to get block by number', error instanceof Error ? error : new Error(String(error)));
            throw new ExternalServiceError(
                `Failed to get block ${blockNumber} from Monad node`,
                'MONAD_RPC_ERROR',
                { blockNumber: blockNumber.toString(), rpcUrl: this.config.rpcUrl },
                context
            );
        }
    }

    /**
     * Get transaction by hash
     */
    async getTransactionByHash(txHash: string, context?: LogContext): Promise<MonadTransaction | null> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Getting transaction by hash', { txHash });
            
            const response = await this.makeRpcCall('eth_getTransactionByHash', [txHash], context);
            
            if (!response.result) {
                logger.debug('Transaction not found', { txHash });
                return null;
            }
            
            logger.debug('Transaction retrieved successfully', { txHash });
            return response.result;
            
        } catch (error) {
            logger.error('Failed to get transaction by hash', error instanceof Error ? error : new Error(String(error)));
            throw new ExternalServiceError(
                `Failed to get transaction ${txHash} from Monad node`,
                'MONAD_RPC_ERROR',
                { txHash, rpcUrl: this.config.rpcUrl },
                context
            );
        }
    }

    /**
     * Make RPC call with retry logic
     */
    private async makeRpcCall(method: string, params: any[], context?: LogContext): Promise<any> {
        const logger = log.child(context || {});
        const requestId = ++this.requestId;
        
        for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
            try {
                logger.debug('Making RPC call', { 
                    method, 
                    params: JSON.stringify(params), 
                    attempt, 
                    requestId 
                });
                
                const requestBody = {
                    jsonrpc: '2.0',
                    method,
                    params,
                    id: requestId
                };

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

                const response = await fetch(this.config.rpcUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();

                if (data.error) {
                    throw new Error(`RPC Error ${data.error.code}: ${data.error.message}`);
                }

                logger.debug('RPC call successful', { method, requestId, attempt });
                return data;

            } catch (error) {
                logger.warn('RPC call failed', { 
                    method, 
                    requestId, 
                    attempt, 
                    error: error instanceof Error ? error.message : String(error)
                });

                if (attempt === this.config.retryAttempts) {
                    throw error;
                }

                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempt));
            }
        }

        throw new InternalServerError('RPC call failed after all retries');
    }

    /**
     * Health check implementation
     */
    async checkHealth(context?: LogContext): Promise<ServiceHealthCheck> {
        const logger = log.child(context || {});
        const startTime = Date.now();
        
        try {
            logger.debug('Performing Monad client health check');
            
            // Try to get the latest block number as a health check
            await this.getLatestBlockNumber(context);
            
            const duration = Date.now() - startTime;
            logger.debug('Monad client health check passed', { duration });
            
            return {
                service: this.serviceName,
                status: 'healthy',
                timestamp: new Date(),
                details: {
                    rpcUrl: this.config.rpcUrl,
                    responseTime: duration,
                    timeout: this.config.timeout
                }
            };
            
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Monad client health check failed', error instanceof Error ? error : new Error(String(error)));
            
            return {
                service: this.serviceName,
                status: 'unhealthy',
                timestamp: new Date(),
                error: error instanceof Error ? error.message : String(error),
                details: {
                    rpcUrl: this.config.rpcUrl,
                    responseTime: duration,
                    timeout: this.config.timeout
                }
            };
        }
    }
}
