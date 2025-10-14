/**
 * Event Processing Worker
 * Runs in a separate thread to process blockchain events
 */

import { parentPort, workerData } from 'worker_threads';
import { DecodedEvent, CurveBuyEvent, CurveSellEvent, CurveCreateEvent } from '../binary-event-decoder';
import { WorkerMessage, WorkerResponse } from './types';

class EventWorker {
    private workerId: number;
    private eventsProcessed: number = 0;
    private errors: number = 0;
    private totalProcessingTime: number = 0;
    private isShuttingDown: boolean = false;

    constructor(workerId: number) {
        this.workerId = workerId;
        this.setupMessageHandler();
    }

    private setupMessageHandler(): void {
        if (!parentPort) {
            throw new Error('Worker must be run in worker thread');
        }

        parentPort.on('message', async (message: WorkerMessage) => {
            try {
                switch (message.type) {
                    case 'EVENT':
                        await this.processEvent(message.data);
                        break;
                    case 'HEALTH_CHECK':
                        this.sendHealthCheck();
                        break;
                    case 'SHUTDOWN':
                        await this.shutdown();
                        break;
                    case 'STATS':
                        this.sendStats();
                        break;
                    default:
                        console.warn(`Unknown message type: ${message.type}`);
                }
            } catch (error) {
                this.errors++;
                this.sendError(error);
            }
        });
    }

    private async processEvent(event: DecodedEvent): Promise<void> {
        const startTime = process.hrtime.bigint();

        try {
            // Process the event based on name
            switch (event.name) {
                case 'CurveBuy':
                    await this.processCurveBuy(event);
                    break;
                case 'CurveSell':
                    await this.processCurveSell(event);
                    break;
                case 'CurveCreate':
                    await this.processCurveCreate(event);
                    break;
                default:
                    // Exhaustive check - should never reach here
                    const _exhaustive: never = event;
                    void _exhaustive; // Satisfy linter
                    console.warn(`Unknown event type`);
            }

            this.eventsProcessed++;

            const endTime = process.hrtime.bigint();
            const processingTime = Number(endTime - startTime) / 1_000_000; // Convert to ms
            this.totalProcessingTime += processingTime;

            this.sendResponse({
                type: 'PROCESSED',
                workerId: this.workerId,
                timestamp: Date.now(),
                data: {
                    eventType: event.name,
                    processingTime
                }
            });
        } catch (error) {
            this.errors++;
            throw error;
        }
    }

    private async processCurveBuy(event: CurveBuyEvent): Promise<void> {
        // TODO: Implement actual buy processing logic
        // This will be integrated with the batch writer in a later task

        // Simulate processing
        await this.simulateProcessing();

        // For now, just log the event
        if (process.env['NODE_ENV'] === 'development') {
            console.log(`[Worker ${this.workerId}] Processing CurveBuy:`, {
                token: event.token,
                sender: event.sender,
                amountIn: event.amountIn.toString(),
                amountOut: event.amountOut.toString()
            });
        }
    }

    private async processCurveSell(event: CurveSellEvent): Promise<void> {
        // TODO: Implement actual sell processing logic

        await this.simulateProcessing();

        if (process.env['NODE_ENV'] === 'development') {
            console.log(`[Worker ${this.workerId}] Processing CurveSell:`, {
                token: event.token,
                sender: event.sender,
                amountIn: event.amountIn.toString(),
                amountOut: event.amountOut.toString()
            });
        }
    }

    private async processCurveCreate(event: CurveCreateEvent): Promise<void> {
        // TODO: Implement actual create processing logic

        await this.simulateProcessing();

        if (process.env['NODE_ENV'] === 'development') {
            console.log(`[Worker ${this.workerId}] Processing CurveCreate:`, {
                token: event.token,
                creator: event.creator
            });
        }
    }

    private async simulateProcessing(): Promise<void> {
        // Simulate some async work (remove in production)
        return new Promise(resolve => setImmediate(resolve));
    }

    private sendHealthCheck(): void {
        this.sendResponse({
            type: 'HEALTH_OK',
            workerId: this.workerId,
            timestamp: Date.now(),
            data: {
                eventsProcessed: this.eventsProcessed,
                errors: this.errors
            }
        });
    }

    private sendStats(): void {
        const averageProcessingTime = this.eventsProcessed > 0
            ? this.totalProcessingTime / this.eventsProcessed
            : 0;

        this.sendResponse({
            type: 'STATS',
            workerId: this.workerId,
            timestamp: Date.now(),
            data: {
                eventsProcessed: this.eventsProcessed,
                errors: this.errors,
                averageProcessingTime,
                isHealthy: true
            }
        });
    }

    private sendResponse(response: WorkerResponse): void {
        if (parentPort && !this.isShuttingDown) {
            parentPort.postMessage(response);
        }
    }

    private sendError(error: any): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.sendResponse({
            type: 'ERROR',
            workerId: this.workerId,
            timestamp: Date.now(),
            error: errorMessage
        });
    }

    private async shutdown(): Promise<void> {
        this.isShuttingDown = true;
        console.log(`[Worker ${this.workerId}] Shutting down...`);

        // Send final stats
        this.sendStats();

        // Close parent port
        if (parentPort) {
            parentPort.close();
        }

        // Exit worker thread
        process.exit(0);
    }
}

// Initialize worker
const workerId = workerData?.workerId ?? 0;
new EventWorker(workerId);
