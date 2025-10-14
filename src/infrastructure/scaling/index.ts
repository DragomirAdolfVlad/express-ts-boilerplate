/**
 * Horizontal Scaling Infrastructure
 * 
 * Provides distributed event processing capabilities for horizontal scaling
 * across multiple nodes using Redis Streams, consistent hashing, and
 * automatic leader election.
 */

export {
  ScalingCoordinator,
  ScalingConfig,
  DecodedEvent,
  EventHandler,
  ClusterStats,
} from './ScalingCoordinator';
