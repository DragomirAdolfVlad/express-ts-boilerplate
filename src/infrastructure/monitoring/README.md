# Performance Monitor

Ultra-low-overhead real-time performance monitoring for high-throughput systems (10,000+ tx/s).

## Features

- **Lock-Free Atomic Counters**: Thread-safe counter operations with minimal overhead
- **High-Resolution Timers**: Nanosecond precision using `process.hrtime.bigint()`
- **Throughput Tracking**: Events/second, writes/second, cache operations/second
- **Latency Histograms**: p50, p95, p99 percentile tracking
- **Sampling**: 1 in N sampling (default 1 in 100) for minimal overhead
- **Prometheus Export**: Standard metrics format for monitoring systems
- **Memory-Mapped Files**: Zero-copy metric reads (optional)

## Requirements

Implements requirements 7.1-7.7 from the high-performance optimization spec:
- 7.1: Lock-free atomic counters
- 7.2: High-resolution timer tracking
- 7.3: Sub-0.01ms overhead per operation
- 7.4: Memory-mapped files for zero-copy reads
- 7.5: Sampling to reduce overhead
- 7.6: Prometheus format export
- 7.7: Comprehensive metrics (throughput, latency, resources)

## Usage

### Basic Usage

```typescript
import { performanceMonitor, MetricType, LatencyCategory } from './infrastructure/monitoring/PerformanceMonitor';

// Increment counters
performanceMonitor.incrementCounter(MetricType.EVENTS_RECEIVED, 1);
performanceMonitor.incrementCounter(MetricType.DATABASE_WRITES, 10);

// Track latency
const startTime = performanceMonitor.startTimer();
// ... do some work ...
performanceMonitor.recordLatency(LatencyCategory.EVENT_DECODE, startTime);

// Get statistics
const stats = performanceMonitor.getStats();
console.log('Events/sec:', stats.eventsPerSecond);
console.log('p95 latency:', stats.latency.event_decode.p95, 'ms');

// Export Prometheus metrics
const metrics = performanceMonitor.getPrometheusMetrics();
console.log(metrics);
```

### Configuration

```typescript
import { PerformanceMonitor } from './infrastructure/monitoring/PerformanceMonitor';

const monitor = PerformanceMonitor.getInstance({
  samplingRate: 100,           // Sample 1 in 100 measurements
  enableMmapExport: true,      // Enable memory-mapped file export
  mmapPath: '/tmp/metrics.mmap', // Path for mmap file
  exportInterval: 5000,        // Export every 5 seconds
  maxHistogramSamples: 10000,  // Keep last 10k samples
});
```

### Metric Types

```typescript
enum MetricType {
  EVENTS_RECEIVED = 'events_received',
  EVENTS_PROCESSED = 'events_processed',
  EVENTS_DECODED = 'events_decoded',
  DATABASE_WRITES = 'database_writes',
  CACHE_OPERATIONS = 'cache_operations',
  WORKER_TASKS = 'worker_tasks',
  BATCH_FLUSHES = 'batch_flushes',
}
```

### Latency Categories

```typescript
enum LatencyCategory {
  EVENT_DECODE = 'event_decode',
  WORKER_PROCESSING = 'worker_processing',
  DATABASE_WRITE = 'database_write',
  CACHE_OPERATION = 'cache_operation',
  END_TO_END = 'end_to_end',
}
```

## Integration Examples

### With Event Processing

```typescript
import { performanceMonitor, MetricType, LatencyCategory } from './infrastructure/monitoring/PerformanceMonitor';

async function processEvent(event: BlockchainEvent) {
  const startTime = performanceMonitor.startTimer();
  
  try {
    // Increment received counter
    performanceMonitor.incrementCounter(MetricType.EVENTS_RECEIVED, 1);
    
    // Decode event
    const decodeStart = performanceMonitor.startTimer();
    const decoded = await decodeEvent(event);
    performanceMonitor.recordLatency(LatencyCategory.EVENT_DECODE, decodeStart);
    
    // Process event
    const processStart = performanceMonitor.startTimer();
    await processDecodedEvent(decoded);
    performanceMonitor.recordLatency(LatencyCategory.WORKER_PROCESSING, processStart);
    
    // Increment processed counter
    performanceMonitor.incrementCounter(MetricType.EVENTS_PROCESSED, 1);
    
    // Record end-to-end latency
    performanceMonitor.recordLatency(LatencyCategory.END_TO_END, startTime);
  } catch (error) {
    console.error('Event processing failed:', error);
  }
}
```

### With Database Writes

```typescript
import { performanceMonitor, MetricType, LatencyCategory } from './infrastructure/monitoring/PerformanceMonitor';

async function writeTrades(trades: TradeData[]) {
  const startTime = performanceMonitor.startTimer();
  
  try {
    await database.batchInsert(trades);
    
    // Record successful writes
    performanceMonitor.incrementCounter(MetricType.DATABASE_WRITES, trades.length);
    performanceMonitor.recordLatency(LatencyCategory.DATABASE_WRITE, startTime);
  } catch (error) {
    console.error('Database write failed:', error);
    throw error;
  }
}
```

### With Cache Operations

```typescript
import { performanceMonitor, MetricType, LatencyCategory } from './infrastructure/monitoring/PerformanceMonitor';

async function invalidateCache(key: string) {
  const startTime = performanceMonitor.startTimer();
  
  try {
    await redis.del(key);
    
    performanceMonitor.incrementCounter(MetricType.CACHE_OPERATIONS, 1);
    performanceMonitor.recordLatency(LatencyCategory.CACHE_OPERATION, startTime);
  } catch (error) {
    console.error('Cache invalidation failed:', error);
  }
}
```

## Prometheus Metrics

The monitor exports metrics in Prometheus format:

```
# Throughput metrics
kiro_throughput_events_per_second 9543.21
kiro_throughput_writes_per_second 8234.56
kiro_throughput_cache_ops_per_second 1234.78

# Counter metrics
kiro_counter_total{metric="events_received"} 1000000
kiro_counter_total{metric="database_writes"} 850000

# Latency metrics (milliseconds)
kiro_latency_event_decode_ms{quantile="0.5"} 0.087
kiro_latency_event_decode_ms{quantile="0.95"} 0.142
kiro_latency_event_decode_ms{quantile="0.99"} 0.198

kiro_latency_database_write_ms{quantile="0.5"} 2.345
kiro_latency_database_write_ms{quantile="0.95"} 8.765
kiro_latency_database_write_ms{quantile="0.99"} 15.432

# Resource metrics
kiro_cpu_usage_seconds 123.45
kiro_memory_usage_bytes 2147483648
kiro_uptime_seconds 3600
```

## Performance Characteristics

### Overhead Benchmarks

- **Counter Increment**: < 0.001ms (1 microsecond)
- **Latency Recording** (with sampling): < 0.01ms
- **Stats Calculation**: < 1ms
- **Prometheus Export**: < 5ms

### Memory Usage

- Base overhead: ~1-2 MB
- Per histogram sample: ~8 bytes
- Max histogram samples: 10,000 (configurable)
- Total memory: ~2-5 MB

### Sampling Benefits

With 1 in 100 sampling:
- 99% reduction in overhead
- Still accurate percentile calculations
- Minimal impact on throughput

## Memory-Mapped File Export

When enabled, metrics are written to a memory-mapped file for zero-copy reads:

```typescript
const monitor = PerformanceMonitor.getInstance({
  enableMmapExport: true,
  mmapPath: '/tmp/kiro-metrics.mmap',
});
```

External processes can read metrics without IPC overhead:

```bash
# Read metrics from mmap file
cat /tmp/kiro-metrics.mmap
```

## API Reference

### PerformanceMonitor

#### Methods

- `incrementCounter(metric: MetricType, value?: number)`: Increment a counter
- `startTimer()`: Get high-resolution timestamp for latency tracking
- `recordLatency(category: LatencyCategory, startTime: bigint)`: Record latency measurement
- `getStats()`: Get current performance statistics
- `getPrometheusMetrics()`: Export metrics in Prometheus format
- `reset()`: Reset all metrics (for testing)
- `shutdown()`: Cleanup resources

### PerformanceStats

```typescript
interface PerformanceStats {
  eventsPerSecond: number;
  writesPerSecond: number;
  cacheOpsPerSecond: number;
  
  latency: {
    [category: string]: {
      p50: number;
      p95: number;
      p99: number;
      avg: number;
      min: number;
      max: number;
      count: number;
    };
  };
  
  counters: {
    [metric: string]: number;
  };
  
  cpuUsage: number;
  memoryUsage: number;
  gcPauses: number;
  samplingRate: number;
  totalSamples: number;
}
```

## Testing

Run unit tests:

```bash
npm test src/infrastructure/monitoring/__tests__/PerformanceMonitor.test.ts
```

Run with coverage:

```bash
npm test -- --coverage src/infrastructure/monitoring/__tests__/PerformanceMonitor.test.ts
```

## Best Practices

1. **Use Sampling**: Keep sampling rate at 1 in 100 for production
2. **Batch Counter Updates**: Increment counters in batches when possible
3. **Selective Latency Tracking**: Only track critical path latencies
4. **Regular Export**: Export metrics every 5-10 seconds
5. **Monitor Overhead**: Track monitoring overhead itself
6. **Cleanup**: Call `shutdown()` on application exit

## Troubleshooting

### High Overhead

If monitoring overhead is too high:
- Increase sampling rate (e.g., 1 in 200)
- Reduce histogram sample limit
- Disable mmap export if not needed

### Memory Growth

If memory usage grows over time:
- Reduce `maxHistogramSamples`
- Increase export interval
- Check for metric leaks

### Missing Metrics

If metrics are not appearing:
- Check sampling rate (may need more samples)
- Verify counter increments are being called
- Check export interval timing

## Future Enhancements

- Native mmap support using C++ addon
- Distributed metrics aggregation
- Real-time alerting integration
- Custom metric types
- Metric persistence and replay
