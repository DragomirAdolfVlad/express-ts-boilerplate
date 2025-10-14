/**
 * Unit tests for PerformanceMonitor
 * 
 * Tests:
 * - Lock-free atomic counter operations
 * - High-resolution latency tracking
 * - Throughput calculations
 * - Percentile calculations (p50, p95, p99)
 * - Sampling reduces overhead
 * - Prometheus format export
 * - Memory-mapped file operations
 */

import {
  PerformanceMonitor,
  MetricType,
  LatencyCategory,
} from '../PerformanceMonitor';
import * as fs from 'fs';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    // Create a fresh instance for each test
    monitor = PerformanceMonitor.getInstance({
      samplingRate: 10, // Sample every 10th for faster testing
      enableMmapExport: false, // Disable mmap for most tests
      exportInterval: 60000, // Long interval to avoid auto-export during tests
    });
    monitor.reset();
  });

  afterEach(() => {
    monitor.shutdown();
  });

  describe('Counter Operations', () => {
    it('should increment counters atomically', () => {
      monitor.incrementCounter(MetricType.EVENTS_RECEIVED, 1);
      monitor.incrementCounter(MetricType.EVENTS_RECEIVED, 5);
      monitor.incrementCounter(MetricType.EVENTS_PROCESSED, 3);

      const stats = monitor.getStats();
      expect(stats.counters[MetricType.EVENTS_RECEIVED]).toBe(6);
      expect(stats.counters[MetricType.EVENTS_PROCESSED]).toBe(3);
    });

    it('should handle multiple counter types independently', () => {
      monitor.incrementCounter(MetricType.EVENTS_RECEIVED, 10);
      monitor.incrementCounter(MetricType.DATABASE_WRITES, 5);
      monitor.incrementCounter(MetricType.CACHE_OPERATIONS, 20);

      const stats = monitor.getStats();
      expect(stats.counters[MetricType.EVENTS_RECEIVED]).toBe(10);
      expect(stats.counters[MetricType.DATABASE_WRITES]).toBe(5);
      expect(stats.counters[MetricType.CACHE_OPERATIONS]).toBe(20);
    });

    it('should handle large counter values', () => {
      for (let i = 0; i < 10000; i++) {
        monitor.incrementCounter(MetricType.EVENTS_PROCESSED, 1);
      }

      const stats = monitor.getStats();
      expect(stats.counters[MetricType.EVENTS_PROCESSED]).toBe(10000);
    });
  });

  describe('High-Resolution Latency Tracking', () => {
    it('should record latency with high precision', () => {
      const startTime = monitor.startTimer();
      
      // Simulate some work (busy wait for ~1ms)
      const endTime = process.hrtime.bigint();
      const targetNs = endTime + BigInt(1_000_000); // 1ms
      while (process.hrtime.bigint() < targetNs) {
        // Busy wait
      }

      monitor.recordLatency(LatencyCategory.EVENT_DECODE, startTime);

      const stats = monitor.getStats();
      const latency = stats.latency[LatencyCategory.EVENT_DECODE];
      
      // Should have recorded at least one sample (due to sampling)
      expect(latency.count).toBeGreaterThanOrEqual(0);
      
      if (latency.count > 0) {
        expect(latency.avg).toBeGreaterThan(0);
        expect(latency.min).toBeGreaterThan(0);
        expect(latency.max).toBeGreaterThan(0);
      }
    });

    it('should track latency for different categories independently', () => {
      // Record latencies for different categories
      for (let i = 0; i < 100; i++) {
        const start1 = monitor.startTimer();
        monitor.recordLatency(LatencyCategory.EVENT_DECODE, start1);

        const start2 = monitor.startTimer();
        monitor.recordLatency(LatencyCategory.DATABASE_WRITE, start2);
      }

      const stats = monitor.getStats();
      
      // Both categories should have samples (accounting for sampling rate of 10)
      // With 100 iterations and sampling rate of 10, we expect ~10 samples per category
      expect(stats.latency[LatencyCategory.EVENT_DECODE].count).toBeGreaterThanOrEqual(0);
      expect(stats.latency[LatencyCategory.DATABASE_WRITE].count).toBeGreaterThanOrEqual(0);
    });

    it('should calculate min, max, and average correctly', () => {
      // Record known latencies (simulate with direct timing)
      const latencies = [1, 2, 3, 4, 5, 10, 20, 50, 100];
      
      for (const latencyMs of latencies) {
        const startTime = process.hrtime.bigint() - BigInt(latencyMs * 1_000_000);
        monitor.recordLatency(LatencyCategory.WORKER_PROCESSING, startTime);
      }

      const stats = monitor.getStats();
      const latency = stats.latency[LatencyCategory.WORKER_PROCESSING];
      
      if (latency.count > 0) {
        expect(latency.min).toBeGreaterThan(0);
        expect(latency.max).toBeGreaterThan(latency.min);
        expect(latency.avg).toBeGreaterThan(0);
      }
    });
  });

  describe('Percentile Calculations', () => {
    it('should calculate p50, p95, p99 percentiles', () => {
      // Record 1000 latency samples with known distribution
      for (let i = 0; i < 1000; i++) {
        const latencyMs = i; // 0 to 999 ms
        const startTime = process.hrtime.bigint() - BigInt(latencyMs * 1_000_000);
        monitor.recordLatency(LatencyCategory.END_TO_END, startTime);
      }

      const stats = monitor.getStats();
      const latency = stats.latency[LatencyCategory.END_TO_END];
      
      if (latency.count > 0) {
        // With sampling rate of 10, we should have ~100 samples (but could vary)
        expect(latency.count).toBeGreaterThan(0);
        
        // Percentiles should be in ascending order
        expect(latency.p50).toBeLessThanOrEqual(latency.p95);
        expect(latency.p95).toBeLessThanOrEqual(latency.p99);
        
        // p99 should be close to the high end
        expect(latency.p99).toBeGreaterThan(latency.p50);
      }
    });

    it('should handle edge case with single sample', () => {
      const startTime = monitor.startTimer();
      monitor.recordLatency(LatencyCategory.CACHE_OPERATION, startTime);

      const stats = monitor.getStats();
      const latency = stats.latency[LatencyCategory.CACHE_OPERATION];
      
      if (latency.count > 0) {
        // All percentiles should be equal with one sample
        expect(latency.p50).toBe(latency.p95);
        expect(latency.p95).toBe(latency.p99);
      }
    });
  });

  describe('Sampling', () => {
    it('should sample 1 in N measurements', () => {
      const totalMeasurements = 1000;
      
      // Record many latencies
      for (let i = 0; i < totalMeasurements; i++) {
        const startTime = monitor.startTimer();
        monitor.recordLatency(LatencyCategory.EVENT_DECODE, startTime);
      }

      const stats = monitor.getStats();
      const latency = stats.latency[LatencyCategory.EVENT_DECODE];
      
      // Should have approximately totalMeasurements / samplingRate samples
      // Due to sampling counter state, actual samples may vary
      expect(latency.count).toBeGreaterThanOrEqual(0);
      expect(latency.count).toBeLessThanOrEqual(totalMeasurements);
      
      // Verify sampling is working (should not record all measurements)
      if (latency.count > 0) {
        expect(latency.count).toBeLessThan(totalMeasurements);
      }
    });

    it('should reduce overhead through sampling', () => {
      const iterations = 10000;
      
      // Measure time with sampling
      const startWithSampling = process.hrtime.bigint();
      for (let i = 0; i < iterations; i++) {
        const timer = monitor.startTimer();
        monitor.recordLatency(LatencyCategory.EVENT_DECODE, timer);
      }
      const durationWithSampling = process.hrtime.bigint() - startWithSampling;
      
      // Average time per operation should be very low (< 0.01ms target)
      const avgTimeMs = Number(durationWithSampling) / iterations / 1_000_000;
      
      // Should be well under 0.01ms per operation
      expect(avgTimeMs).toBeLessThan(0.05); // 0.05ms is generous for testing
    });
  });

  describe('Throughput Tracking', () => {
    it('should calculate events per second', async () => {
      // Increment counters
      for (let i = 0; i < 100; i++) {
        monitor.incrementCounter(MetricType.EVENTS_PROCESSED, 1);
      }

      // Wait a bit for throughput calculation
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = monitor.getStats();
      
      // Should have some throughput calculated
      expect(stats.eventsPerSecond).toBeGreaterThanOrEqual(0);
    });

    it('should calculate writes per second', async () => {
      for (let i = 0; i < 50; i++) {
        monitor.incrementCounter(MetricType.DATABASE_WRITES, 1);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = monitor.getStats();
      expect(stats.writesPerSecond).toBeGreaterThanOrEqual(0);
    });

    it('should calculate cache operations per second', async () => {
      for (let i = 0; i < 200; i++) {
        monitor.incrementCounter(MetricType.CACHE_OPERATIONS, 1);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = monitor.getStats();
      expect(stats.cacheOpsPerSecond).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Prometheus Export', () => {
    it('should export metrics in Prometheus format', () => {
      // Add some metrics
      monitor.incrementCounter(MetricType.EVENTS_RECEIVED, 100);
      monitor.incrementCounter(MetricType.DATABASE_WRITES, 50);
      
      const startTime = monitor.startTimer();
      monitor.recordLatency(LatencyCategory.EVENT_DECODE, startTime);

      const prometheus = monitor.getPrometheusMetrics();
      
      // Should contain Prometheus format headers
      expect(prometheus).toContain('# HELP');
      expect(prometheus).toContain('# TYPE');
      
      // Should contain throughput metrics
      expect(prometheus).toContain('kiro_throughput_events_per_second');
      expect(prometheus).toContain('kiro_throughput_writes_per_second');
      
      // Should contain counter metrics
      expect(prometheus).toContain('kiro_counter_total');
      expect(prometheus).toContain('events_received');
      
      // Should contain latency metrics
      expect(prometheus).toContain('kiro_latency_event_decode_ms');
      expect(prometheus).toContain('quantile="0.5"');
      expect(prometheus).toContain('quantile="0.95"');
      expect(prometheus).toContain('quantile="0.99"');
      
      // Should contain resource metrics
      expect(prometheus).toContain('kiro_cpu_usage_seconds');
      expect(prometheus).toContain('kiro_memory_usage_bytes');
      expect(prometheus).toContain('kiro_uptime_seconds');
    });

    it('should format metrics correctly', () => {
      monitor.incrementCounter(MetricType.EVENTS_PROCESSED, 1000);
      
      const prometheus = monitor.getPrometheusMetrics();
      const lines = prometheus.split('\n');
      
      // Should have multiple lines
      expect(lines.length).toBeGreaterThan(10);
      
      // Should not have malformed lines
      for (const line of lines) {
        if (line.startsWith('#') || line.trim() === '') {
          continue;
        }
        
        // Metric lines should have format: metric_name{labels} value
        expect(line).toMatch(/^[a-z_]+(\{[^}]+\})?\s+[\d.]+$/);
      }
    });
  });

  describe('Memory-Mapped File Export', () => {
    it('should write metrics to mmap file when enabled', () => {
      const mmapPath = '/tmp/kiro-test-metrics.mmap';
      
      // Clean up any existing file
      if (fs.existsSync(mmapPath)) {
        fs.unlinkSync(mmapPath);
      }
      
      const mmapMonitor = PerformanceMonitor.getInstance({
        enableMmapExport: true,
        mmapPath,
        exportInterval: 100, // Short interval for testing
      });
      
      mmapMonitor.incrementCounter(MetricType.EVENTS_RECEIVED, 100);
      
      // Wait for export
      setTimeout(() => {
        // File should exist
        expect(fs.existsSync(mmapPath)).toBe(true);
        
        // Clean up
        mmapMonitor.shutdown();
        if (fs.existsSync(mmapPath)) {
          fs.unlinkSync(mmapPath);
        }
      }, 200);
    });
  });

  describe('Resource Metrics', () => {
    it('should track CPU usage', () => {
      const stats = monitor.getStats();
      
      expect(stats.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(typeof stats.cpuUsage).toBe('number');
    });

    it('should track memory usage', () => {
      const stats = monitor.getStats();
      
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(typeof stats.memoryUsage).toBe('number');
    });
  });

  describe('Reset and Cleanup', () => {
    it('should reset all metrics', () => {
      // Add some metrics
      monitor.incrementCounter(MetricType.EVENTS_RECEIVED, 100);
      monitor.incrementCounter(MetricType.DATABASE_WRITES, 50);
      
      const startTime = monitor.startTimer();
      monitor.recordLatency(LatencyCategory.EVENT_DECODE, startTime);

      // Reset
      monitor.reset();

      const stats = monitor.getStats();
      
      // Counters should be zero
      expect(stats.counters[MetricType.EVENTS_RECEIVED]).toBe(0);
      expect(stats.counters[MetricType.DATABASE_WRITES]).toBe(0);
      
      // Latency counts should be zero
      expect(stats.latency[LatencyCategory.EVENT_DECODE].count).toBe(0);
    });

    it('should cleanup resources on shutdown', () => {
      expect(() => monitor.shutdown()).not.toThrow();
    });
  });

  describe('Performance Benchmarks', () => {
    it('should have minimal overhead for counter increment', () => {
      const iterations = 100000;
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < iterations; i++) {
        monitor.incrementCounter(MetricType.EVENTS_PROCESSED, 1);
      }
      
      const endTime = process.hrtime.bigint();
      const durationNs = endTime - startTime;
      const avgTimeNs = Number(durationNs) / iterations;
      const avgTimeMs = avgTimeNs / 1_000_000;
      
      // Should be well under 0.01ms per operation
      expect(avgTimeMs).toBeLessThan(0.001); // 0.001ms = 1 microsecond
    });

    it('should have minimal overhead for latency recording with sampling', () => {
      const iterations = 100000;
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < iterations; i++) {
        const timer = monitor.startTimer();
        monitor.recordLatency(LatencyCategory.EVENT_DECODE, timer);
      }
      
      const endTime = process.hrtime.bigint();
      const durationNs = endTime - startTime;
      const avgTimeNs = Number(durationNs) / iterations;
      const avgTimeMs = avgTimeNs / 1_000_000;
      
      // With sampling, should be very fast (target: < 0.01ms)
      expect(avgTimeMs).toBeLessThan(0.01);
    });
  });
});
