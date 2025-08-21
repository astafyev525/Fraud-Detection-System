import Redis from 'ioredis';
import { logger } from './logger';

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true
};

export const redis = new Redis(redisConfig);

redis.on('connect', () => {
    logger.info('Redis connected successfully');
});

redis.on('error', (error) => {
    logger.error('Redis connection error:', error);
});

redis.on('ready', () => {
    logger.info('Redis ready for commands');
});

export const setCache = async (key: string, value: any, ttlSeconds: number = 300): Promise<void> => {
    try {
        await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
        logger.error('Error setting cache', { error, key });
    }
};

export const getCache = async (key: string): Promise<any> => {
    try {
        const result = await redis.get(key);
        return result ? JSON.parse(result) : null;
    } catch (error) {
        logger.error('Error getting cache', { error, key });
        return null;
    }
};

export const deleteCache = async (key: string): Promise<void> => {
    try {
        await redis.del(key);
    } catch (error) {
        logger.error('Error deleting cache', { error, key });
    }
};

export const testRedisConnection = async (): Promise<boolean> => {
    try {
        await redis.ping();
        logger.info('Redis connection test successful');
        return true;
    } catch (error) {
        logger.error('Redis connection test failed', error);
        return false;
    }
};