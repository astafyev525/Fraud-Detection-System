import { Pool, PoolConfig } from 'pg';
import { logger } from './logger';

const dbConfig: PoolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'fraud_detection',
    user: process.env.DB_USER || 'fraud_user',
    password: process.env.DB_PASSWORD || 'fraud_pass',


    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
};

export const pool = new Pool(dbConfig);

pool.on('connect', (client) => {
    logger.info('New PostgreSQL client connected');
});

pool.on('error', (err, client) => {
    logger.error('PostgreSQL client error:', err);
});

export const testConnection = async (): Promise<boolean> => {
    try{
        const client =  await pool.connect();
        const result = await client.query('SELECT NOW()');

        client.release();

        logger.info('Database connection successful', result.rows[0])
        return true;
    }catch (error) {
        logger.error('Database connection failed', error);
        return false;
    }
};

testConnection()