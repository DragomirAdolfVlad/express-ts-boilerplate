/**
 * In-Memory Event Repository
 * 
 * Simple in-memory implementation of the event repository.
 * For production, replace with PostgreSQL implementation.
 */

import { IEventRepository, EventFilter, PaginationOptions, EventQueryResult } from '../../domain/repositories/event.repository';
import { BlockchainEvent } from '../../domain/entities/blockchain-event.entity';

export class InMemoryEventRepository implements IEventRepository {
  private events: BlockchainEvent[] = [];

  async save(event: BlockchainEvent): Promise<void> {
    // Check for duplicates
    const exists = this.events.some(e => 
      e.id.transactionHash === event.id.transactionHash && 
      e.id.logIndex === event.id.logIndex
    );

    if (!exists) {
      this.events.push(event);
    }
  }

  async saveMany(events: BlockchainEvent[]): Promise<void> {
    for (const event of events) {
      await this.save(event);
    }
  }

  async findByFilter(
    filter: EventFilter,
    pagination?: PaginationOptions
  ): Promise<EventQueryResult> {
    let filteredEvents = [...this.events];

    // Apply filters
    if (filter.blockRange) {
      filteredEvents = filteredEvents.filter(e => 
        e.blockNumber >= filter.blockRange!.from && 
        e.blockNumber <= filter.blockRange!.to
      );
    }

    if (filter.eventTypes) {
      filteredEvents = filteredEvents.filter(e => 
        filter.eventTypes!.includes(e.type)
      );
    }

    if (filter.addresses) {
      filteredEvents = filteredEvents.filter(e => 
        filter.addresses!.includes(e.address)
      );
    }

    if (filter.timeRange) {
      filteredEvents = filteredEvents.filter(e => 
        e.timestamp >= filter.timeRange!.from && 
        e.timestamp <= filter.timeRange!.to
      );
    }

    // Apply pagination
    const total = filteredEvents.length;
    let paginatedEvents = filteredEvents;

    if (pagination) {
      const offset = (pagination.page - 1) * pagination.limit;
      paginatedEvents = filteredEvents.slice(offset, offset + pagination.limit);
    }

    return {
      events: paginatedEvents,
      total,
      page: pagination?.page || 1,
      limit: pagination?.limit || total
    };
  }

  async findById(transactionHash: string, logIndex: number): Promise<BlockchainEvent | null> {
    return this.events.find(e => 
      e.id.transactionHash === transactionHash && 
      e.id.logIndex === logIndex
    ) || null;
  }

  async getLatestBlockNumber(): Promise<number | null> {
    if (this.events.length === 0) return null;
    
    return Math.max(...this.events.map(e => e.blockNumber));
  }

  async countByType(eventType: string): Promise<number> {
    return this.events.filter(e => e.type === eventType).length;
  }
}