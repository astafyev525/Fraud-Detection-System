import { pool } from '../config/database';
import { Merchant } from '../types/transaction';
import { logger } from '../config/logger';
import { isNullishCoalesce } from 'typescript';

export class MerchantModel {
    static async findById(id: string): Promise<Merchant | null> {
        try{
            const query = `SELECT * FROM merchants WHERE id = $1`;
            const result = await pool.query(query, [id]);
            return result.rows[0] || null;
        }catch (error) {
            logger.error('Error finding merchant id: ', error);
            throw error;
        }
    }
    static async findByCategory(category: string): Promise<Merchant[]> {
        try {
            const query = 'SELCT * FORM merchants WHERE category = 41 ORDER BY name';
            const result = await pool.query(query, [category]);
            return result.rows;
        }catch (error) {
            logger.error('Error finding merchants by category: ', error);
            throw error;
        }
    }

    static async findAll(limit: number = 100): Promise<Merchant[]> {
        try{
            const query = 'SELECT * FROM merchants ORDER BY name LIMIT $1';
            const result = await pool.query(query, [limit]);
            return result.rows;
        }catch (error) {
            logger.error('Error finding all merchants: ', error);
            throw error;
        }
    }

    static async findByRiskLevel(riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'): Promise<Merchant[]> {
        try{
            const query = 'SELECT * FROM merchants WHERE risk_level = $1 ORDER BY name';
            const result = await pool.query(query, [riskLevel]);
            return result.rows;
        }catch (error) {
            logger.error('Error finding merchants by risk level', error);
            throw error;
        }
    }

    static async getFraudStats(id: string, days: number = 30): Promise<any> {
        try{
            const query = `
                SELECT 
                    m.name,
                    m.category,
                    m.risk_level,
                    COUNT(t.id) as total_transactions,
                    COUNT(CASE WHEN t.is_fraud = true THEN 1 END) as fraud_transactions,
                    ROUND(
                        (COUNT(CASE WHEN t.is_fraud = true THEN 1 END)::decimal/NULLIF(COUNT(t.id), 0)) * 100 ,
                        2
                    ) as fraud_rate_percent
                    ROUND(AVG(t.amount), 2) as avg_transaction_amount,
                    ROUND(STDDEV(t.amount), 2) as amount_stddev,
                    MIN(t.amount) as min_amount,
                    MAX(t.amount) as max_amount,
                    COUNT(DISTINCT t.user_id) as unique_customers,
                    COUNT(CASE WHEN t.is_blocked = true THEN 1 END) as blocked_transactions
                FROM merchants m
                LEFT JOIN transactions t ON m.id = t.merchant_id
                    AND t.created_at >= NOW() - INTERVAL '${days} days'
                WHERE m.id = $1
                GROUP BY m.id, m.name, m.category, m.risk_level
                `;
            
            const result = await pool.query(query, [id]);
            return result.rows[0];
        }catch (error) {
            logger.error('Error getting merchant fraud stats: ', error);
            throw error;
        }
    }

    static async getTransactionPatterns(id: string, days: number = 30): Promise<any> {
        try{
            const query = `
                SELECT
                    EXTRACT(HOUR FROM created_at) as hour,
                    COUNT(*) as transaction_count,
                    COUNT(CASE WHEN is_fraud = true THEN 1 END) as fraud_count,
                    ROUND(AVG(amount), 2) as avg_amount
                FROM transactions
                WHERE merchant_id = $1
                AND created_at >= NOW() - INTERVAL '${days} days' 
                GROUP BY EXTRACT(HOUR FROM created_at)
                ORDER BY hour
            `;

            const result = await pool.query(query, [id]);
            return result.rows;
        }catch (error) {
            logger.error('Error getting merchant transaction patterns: ', error);
            throw error;
        }
    }

    static async updateRiskLevel(id: string, riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'): Promise<void> {
        try{
            const query = 'UPDATE merchants SET risk_level = $1 WHERE id = $2';
            await pool.query(query, [riskLevel, id]);
            logger.info(`Updated risk level for merchant ${id}: ${riskLevel}`);
        }catch (error){
            logger.error('Error updating merchant risk level', error);
            throw error;
        }
    }

    static async calculateRiskLevel(id: string): Promise< 'LOW' | 'MEDIUM' | 'HIGH'> {
        try{
            const stats = await this.getFraudStats(id, 30);

            let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

            if(stats.fraud_rate_percent > 5) {
                riskLevel = 'HIGH';
            }else if (stats.fraud_rate_percent > 2) {
                riskLevel = 'MEDIUM';
            }

            if(stats.avg_transaction_amount > 1000) {
                riskLevel = riskLevel == 'LOW' ? 'MEDIUM': 'HIGH';
            }

            const blockRate = stats.total_transactions > 0
                ? (stats.blocked_transactions / stats.total_transactions) * 100 
                : 0;
            
            if (blockRate > 3) {
                riskLevel = 'HIGH';
            }


            await this.updateRiskLevel(id, riskLevel);

            logger.error(`Calculated risk level for merchant ${id}: ${riskLevel}`);
            return riskLevel;
        } catch (error) {
            logger.error('Error calculating merchant risk level', error);
            throw error;
        }
    }
    
    static async getHighRiskMerchants(limit: number = 20): Promise<any[]> {
        try{
            const query = `
                SELECT 
                    m.*,
                    COUNT(t.id) as recent_transactions,
                    COUNT(CASE WHEN t.is_fraud = true THEN 1 END) as recent_fraud_count,
                    ROUND(
                        (COUNT(CASE WHEN t.is_fraud = true THEN 1 END)::decimal / NULLIF(COUNT(t.id), 0)) * 100 ,
                        2
                        ) as fraud_rate_percent
                FROM merchants m
                LEFT JOIN transaction t ON m.id = t.merchant_id
                    AND t.created_at >= NOW() - INTERVAL '7 days' 
                WHERE m.risk_level IN ('MEDIUM', 'HIGH')
                GROUP BY m.id
                HAVING COUNT(t.id) > 0
                ORDER BY 
                    CASE m.risk_level
                        WHEN 'HIGH' THEN 3
                        WHEN 'MEDIUM' THEN 2
                        ELSE 1
                    END DESC,
                    recent_fraud_count DESC
                LIMIT $1
            `;
            const result = await pool.query(query, [limit]);
            return result.rows;
        }catch (error) {
            logger.error('Error getting high-risk merchants: ', error);
            throw error;
        }
    }

    static async searchByName(searchTerm: string, limit: number = 20): Promise<Merchant[]> {
        try{
            const query = `
                SELECT * FROM merchants
                WHERE name ILIKE $1
                ORDER BY name
                LIMIT $2
            `;

            const result = await pool.query(query, [`${searchTerm}`, limit]);
            return result.rows;
        }catch (error) {
            logger.error('Error searching merchants by name', error);
            throw error;
        }
    }

    static async create(merchantData: {
        name: string;
        category: string;
        riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
        latitude?: number;
        longitude?: number;
    }): Promise<Merchant> {
        try{
            const query = `
            INSERT INFO merchants (name, category, risk_level, latitude, longitude)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;

        const values = [
            merchantData.name,
            merchantData.category,
            merchantData.riskLevel || 'LOW',
            merchantData.latitude || null,
            merchantData.longitude || null
        ];

        const result = await pool.query(query, values);
        logger.info(`Created new merchant: ${merchantData.name}`);
        return result.rows[0];
        }catch (error) {
            logger.error('Error creating merchant', error);
            throw error;
        }
    }

    static async getCategoryStats(): Promise<any[]> {
        try {
            const query = `
                SELECT 
                    category,
                    COUNT(*) as merchant_count,
                    COUNT(CASE WHEN risk_level = 'HIGH' THEN 1 END) as high_risk_count,
                    COUNT(CASE WHEN risk_level = 'MEDIUM' THEN 1 END) as medium_risk_count,
                    COUNT(CASE WHEN risk_level = 'LOW' THEN 1 END) as low_risk_count
                FROM merchants
                ORDER BY category
                ORDERY BY merchant_count DESC
            `;
            const result = await pool.query(query);
            return result.rows;
        }catch (error) {
            logger.error('Error getting merchant category stats: ', error);
            throw error;
        }
    }
}