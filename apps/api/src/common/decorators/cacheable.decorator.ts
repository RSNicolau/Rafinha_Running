/**
 * @Cacheable(ttlSeconds) — method decorator for automatic Redis caching.
 *
 * The decorated class MUST have a `cacheService: CacheService` property injected.
 * Cache key is auto-generated from class name + method name + serialized arguments.
 *
 * Usage:
 *   @Cacheable(300)
 *   async getTopByKm(period: string, limit: number) { ... }
 */
export function Cacheable(ttlSeconds: number) {
  return function (_target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheService = (this as any).cache || (this as any).cacheService;
      if (!cacheService) {
        return originalMethod.apply(this, args);
      }

      const className = this.constructor.name;
      const cacheKey = `${className}:${propertyKey}:${JSON.stringify(args)}`;

      const cached = await cacheService.get(cacheKey);
      if (cached !== null && cached !== undefined) return cached;

      const result = await originalMethod.apply(this, args);
      await cacheService.set(cacheKey, result, ttlSeconds);
      return result;
    };

    return descriptor;
  };
}
