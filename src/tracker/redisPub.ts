import Redis from 'ioredis';

export class RedisPub {
  private pub: Redis;
  private channel: string;

  constructor(url: string, channel: string) {
    this.pub = new Redis(url, { lazyConnect: false });
    this.channel = channel;
  }

  async publish(obj: unknown) {
    // immediate fire-and-forget publish
    try {
      // Convert BigInt values to strings for JSON serialization
      const replacer = (_key: string, value: any) => 
        typeof value === 'bigint' ? value.toString() : value;
      
      const jsonString = JSON.stringify(obj, replacer);
      console.log(`[redis:publish] Publishing to ${this.channel}:`, JSON.stringify(obj, replacer, 2).substring(0, 200) + '...');
      await this.pub.publish(this.channel, jsonString);
      console.log(`[redis:publish] Successfully published to ${this.channel}`);
    } catch (e) {
      // swallow to never block hot path
      console.error('[redis:publish]', e);
    }
  }
}