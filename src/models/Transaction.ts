import { pool } from '../config/database';
import { Transaction } from '../types/transaction';
import { logger } from '../config/logger';

export class TransactionModel {
    static async findById(id: string): Promise<Transaction | null> {
        try{
            const query = 'SELECT * FROM transactions WHERE id = $1';
            const result = await pool.query(query, [id]);
            return result.rows[0] || null;
        } catch (error) {
            logger.error('Error finding transaction by ID: ', error);
            throw error;
        }
    }
    static async findByUserId(userId:string, limit: number = 10): Promise<Transaction[]> {
        try{
            const query = `
            SELECT * FROM transactions 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2`;
            const result = await pool.query(query, [userId, limit]);
            return result.rows;
        } catch(error){
            logger.error('ERROR finding transactions by user ID', error);
            throw error;
        }
    }

    static async findInTimeWindow(userId: string, minutes: number): Promise<Transaction[]> {
        try{
            const query = `
            SELECT * FROM transactions 
            WHERE user_id = $1 
            AND created_at >= NOW() - INTERVAL '${minutes} minutes'
            ORDER BY created_at DESC
            `;
            const result = await pool.query(query, [userId]);
            return result.rows;
        }catch(error){
            logger.error('Error finding transaction in time windows', error);
            throw error;        
        }
    }

    static async findByAmountRange(userId: string, minAmount: number, maxAmount?: number): Promise<Transaction[]> {
        try{
            let query = `
            SELECT * FROM transactions 
            WHERE user_id = $1 AND amount >= $2
          `;
          const params = [userId, minAmount];
          if (maxAmount){
            query += 'AND amount <= $3';
            params.push(maxAmount);
          }
          query += ' ORDER BY created_at DESC';

          const result = await pool.query(query, params);
          return result.rows;
        }catch (error){
            logger.error('Error finding transactions by amount range: ', error);
            throw error;
        }
    }

    static async updateFraudScore(id: string, fraudScore: number, isBlocked: boolean, processingTimeMs? : number): Promise<void> {
        try{
            const query = `
            UPDATE transactions
            SET fraud_score = $1, is_blocked = $2, processing_time_ms = $3 
            WHERE id = $4
            `;
            await pool.query(query, [fraudScore, isBlocked, processingTimeMs || 0, id]);
            logger.info(`Updated fraud score for transaction ${id}: ${fraudScore}`);
        }catch (error) {
            logger.error('Error updating fraud score:', error);
            throw error;
        }
    }

    static async getFraudStats(days: number =7): Promise<any> {
        try{
            const query = `
            SELECT 
                COUNT(*) as total_transactions,
                COUNT(CASE WHEN is_fraud = true THEN 1 END) as fraud_transactions,
                ROUND(AVG(fraud_score), 2) as avg_fraud_score,
                ROUND(SUM(amount), 2) as total_amount,
                ROUND(SUM(CASE WHEN is_fraud = true THEN amount ELSE 0 END), 2) as fraud_amount,
                COUNT(CASE WHEN is_blocked = true THE 1 END) as blocked_transactions
            FROM TRANSACTIONS
            WHERE created_at >= NOW() - INTERVAL '${days} days' 
            `;
            const result = await pool.query(query);

            const stats = result.rows[0]

            stats.fraud_rate = stats.total_transactions > 0
                ?((stats.fraud_transactions / stats.total_transactions) * 100).toFixed(2)
                : 0;
            return stats;
        }catch (error){
            logger.error('Error getting fraud statistics', error);
            throw error;
        }
    }

    static async getHourlyFraudTrends(days: number =7): Promise<any[]> {
        try{
            const query = `
            SELECT
                EXTRACT(HOUR FROM created_at) as hour,
                COUNT(*) as total_transactions,
                COUNT(CASE WHEN is_fraud = true THEN 1 END) as fraud_transactions,
                ROUND(AVG(fraud_score), 2) as avg_fraud_score
            FROM transactions
            WHERE created_at >= NOW() - INTERVAL '${days} days' 
            GROUP BY EXTRACT(HOUR FROM created_at)
            ORDER BY hour
            `;
            const result = await pool.query(query);
            return result.rows;
        }catch (error){
            logger.error('Error getting hourly fraud trends: ', error);
            throw error;
        }
    }

    static async getHighRiskTransactions(limit: number = 20, minFraudScore: number = 70): Promise<Transaction[]> {
        try{
            const query = `
            SELECT t.*, u.email as user_email, m.name as merchant_name
            FROM transactions t
            JOIN users u ON t.user_id = u.id
            JOIN merchants m ON t.merchant_id = m.id
            WHERE t.fraud_score >= $1 
            ORDER BY t.created_at DESC
            LIMIT $2
            `;
            const result = await pool.query(query, [minFraudScore, limit]);
            return result.rows;
        } catch (error){
            logger.error('Error getting high-risk transactions ', error);
            throw error;
        }
    }

    static async getUserSpendingPatterns(userId: string, days: number = 30): Promise<any> {
        try{
            const query = `
                SELECT
                    ROUND(AVG(amount), 2) as avg_amount,
                    ROUND(STDEV(amount), 2) as amount_stddev,
                    MIN(amount) as min_amount,
                    MAX(amount) as max_amount,
                    COUNT(*) as transaction_count,
                    COUNT(DOSTONCT merchant_id) as unique_merchants,
                    MODE() WITHIN GROUP(ORDER BY EXTRACT(HOUR FROM created_at)) as most_common_hour,
                    COUNT(CASE WHEN EXTRACT(HOUR FROM created_at) BETWEEN 22 AND 6 THEN 1 END) as night_transactions
                FROM transactions
                WHERE user_id = $1
                AND created_at >= NOW() - INTERVAL '${days} days'
                AND is_fraud = false
            `;
            const result = await pool.query(query, [userId]);
            return result.rows[0];           
        } catch (error) {
            logger.error('Error getting user spending patterns' , error);
            throw error;
        }
    }

    static async countRecentTransactions(userId: string, minutes: number): Promise<number> {
        try{
            const query =  `
            SELECT COUNT(*) as count
            FROM transactions
            WHERE user_id = $1
            AND created_at >= NOW() - INTERVAL '${minutes} minutes'
            `;
            const result = await pool.query(query, [userId]);
            return parseInt(result.rows[0].count);
        }catch (error){
            logger.error('Error counting recent transactions', error);
            throw error;
        }
    }

    static async findByMerchantId(merchantId: string, limit: number = 50): Promise<Transaction[]> {
        try{
            const query = `
            SELECT * FROM transactions
            WHERE merchant_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            `;
            const result = await pool.query(query, [merchantId, limit]);
            return result.rows;
        }catch (error) {
            logger.error('Error finding transactions by merchant ID', error);
            throw error;
        }
    }

    static async create(transactionData: Partial<Transaction>): Promise<Transaction> {
        try{
            const query = `
                INSERT INTO transactions (
                    id, user_id, merchant_id, amount, currency, 
                    latitude, longitude, device_fingerprint, ip_address,
                    created_at, is_fraud, is_blocked
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *
            `;
            const values = [
                transactionData.id,
                transactionData.userId,
                transactionData.merchantId,
                transactionData.amount,
                transactionData.currency || 'USD',
                transactionData.latitude,
                transactionData.longitude,
                transactionData.deviceFingerprint,
                transactionData.ipAddress,
                transactionData.createdAt || new Date(),
                transactionData.isFraud || false,
                transactionData.isBlocked || false
            ];

            const result = await pool.query(query, values);
            logger.info(`Created transaction ${result.rows[0].id} for user ${transactionData.userId}`);
            return result.rows[0];
        }catch (error) {
            logger.error('Error creating transaction:', error);
            throw error;
        }
    }
}