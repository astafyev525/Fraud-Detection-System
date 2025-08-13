import { pool } from '../config/database';
import { User } from '../types/transaction';
import { logger } from '../config/logger';

export class UserModel {
    static async findById(id: string): Promise<User| null> {
        try{
            const query = 'SELECT * FROM users WHERE id = $1';
            const result = await pool.query(query, [id]);
        }catch (error) {
            logger.error('Error finding user by ID: ', error);
            throw error;
        }
    }

    static async findByEmail(email: string): Promise<User | null> {
        try{
            const query = 'SELECT * FROM users WHERE email = $1';
            const result = await pool.query(query, [email]);
            return result.rows[0] || null;
        }catch (error){
            logger.error('Error finding user by email', error);
            throw error;
        }
    }

    static async findAll(limit: number = 100): Promise<User[]> {
        try{
            const query = 'SELECT * FORM users ORDER BY created_at DESC LIMIT $1';
            const result = await pool.query(query, [limit]);
            return result.rows;
        }catch (error){
           logger.error('Error finding all user: ', error);
           throw error; 
        }
    }

    static async updateRiskScore(id: string, riskScore: number): Promise<void> {
        try{
            const clampedScore = Math.max(0, Math.min(100, riskScore));

            const query = `UPDATE users SET risk_score = $1 WHERE id = $2`;
            await pool.query(query, [clampedScore, id]);

            logger.info(`Updated risk score for user ${id}: ${clampedScore}`);
        }catch(error){
            logger.error('Error updating user risk score: ', error);
            throw error;
        }
    }

    static async updateTransactionStats(id: string): Promise<void> {
        try{
            const query = `
            UPDATE users
            SET
                total_transactions = (
                SELECT COUNT(*) 
                FROM transactions
                WHERE user_id = $1 AND is_fraud = false
                ),
                avg_transaction_amount = (
                SELECT ROUND(AVG(amount), 2)
                FROM transactions
                WHERE user_id = $1 AND is_fraud = false
                )
            WHERE id = $1
            `;
            await pool.query(query, [id]);
            logger.debug(`Updated transaction stats for user ${id}`);
        }catch (error){
            logger.error('Error updating user transaction stats: ', error);
            throw error;
        }
    }

    static async getTransactionStats(id: string, days: number = 30): Promise<any> {
        try{
            const query = `
                SELECT
                    u.email,
                    u.risk_score,
                    u.total_transactions as lifetime_transactions,
                    u.avg_transaction_amount as lifetime_avg_amount,
                    COUNT(t.id) as recent_transactions,
                    COALESCE(ROUND(AVG(t.amount), 2), 0) as recent_avg_amount,
                    COALESCE(ROUND(STDDEV(t.amount), 2), 0) as amount_stddev,
                    MIN(t.amount) as min_amount,
                    MAX(t.amount) as max_amount,
                    COUNT(CASE WHEN t.is_fraud = true THEN 1 END) as fraud_count,
                    COUNT(CASE WHEN t.is_blocked = true THEN 1 END) as blocked_count,
                    COUNT(DISTINCT t.merchant_id) as unique_merchants,
                    COUNT(CASE WHEN EXTRACT(HOUR FROM t.created_at) BETWEEN 22 AND 6 THEN 1 END) as night_transactions
                FROM users u
                LEFT JOIN transactions t ON u.id = t.user_id
                    AND t.created_at >= NOW() - INTERVAL '${days} days'
                WHERE u.id = $1
                GROUP BY u.id, u.risk_score, u.total_transactions, u.avg_transaction_amount
            `;
            const result = await pool.query(query, [id]);
            return result.rows[0];
        }catch(error) {
            logger.error('Error getting user transaction stats: ', error);
            throw error;
        }
    }
    static async getSpendingBehavior(id: string, days: number = 60): Promise<any> {
        try{
            const query = `
        SELECT 
          -- Time patterns
          MODE() WITHIN GROUP (ORDER BY EXTRACT(HOUR FROM created_at)) as most_common_hour,
          MODE() WITHIN GROUP (ORDER BY EXTRACT(DOW FROM created_at)) as most_common_day_of_week,
          
          -- Amount patterns  
          ROUND(AVG(amount), 2) as avg_amount,
          ROUND(STDDEV(amount), 2) as amount_stddev,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount), 2) as median_amount,
          ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY amount), 2) as p95_amount,
          
          -- Location patterns (if user has home coordinates)
          COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as transactions_with_location,
          
          -- Merchant patterns
          COUNT(DISTINCT merchant_id) as unique_merchants,
          MODE() WITHIN GROUP (ORDER BY merchant_id) as most_common_merchant,
          
          -- Device patterns
          COUNT(DISTINCT device_fingerprint) as unique_devices,
          MODE() WITHIN GROUP (ORDER BY device_fingerprint) as most_common_device,
          
          -- Frequency patterns
          COUNT(*) as total_transactions,
          ROUND(COUNT(*)::decimal / GREATEST(1, EXTRACT(DAYS FROM (MAX(created_at) - MIN(created_at)))), 2) as avg_transactions_per_day
          
        FROM transactions 
        WHERE user_id = $1 
        AND created_at >= NOW() - INTERVAL '${days} days'
        AND is_fraud = false
        `;
        const result = await pool.query(query, [id]);
        return result.rows[0];
        } catch (error){
            logger.error('Error getting user spending behavior: ', error);
            throw error;
        }
    }

    static async calculateRiskScore(id: string): Promise<number> {
        try{
            const stats = await this.getTransactionStats(id, 30);
            const behavior = await this.getSpendingBehavior(id, 30);

            let riskScore = 0;

            if(stats.recent_transactions > 50) riskScore += 20;
            else if (stats.recent_transactions > 20) riskScore += 10;

            if(behavior.amount_stddev > behavior.avg_amount) riskScore += 15;

            const nightTransactionRate = stats.recent_transaction > 0
                ?(stats.night_transactions / stats.recent_transactions)
                : 0;
            if (nightTransactionRate > 0.3) riskScore += 15;

            if(behavior.unique_devices > 3) riskScore += 20;
            else if (behavior.unique_devices > 2) riskScore += 10;

            if (behavior.unique_merchants > 15) riskScore += 10;

            if (stats.fraud_count > 0) riskScore += 25;

            if(behavior.avg_amount> 500) riskScore += 10;
            else if (behavior.avg_amount > 1000) riskScore += 20;

            riskScore = Math.max(0, Math.min(100, riskScore));

            await this.updateRiskScore(id, riskScore);
            logger.info(`Calculated risk score for user ${id}: ${riskScore}`);
            return riskScore;
        } catch (error){
            logger.error('Error calculating user risk score', error);
            throw error;
        }
    }
    static async getHighRiskUsers(limit: number = 20, minRiskScore: number = 70): Promise<User[]> {
        try{
            const query = `
                SELECT u.*,
                    COUNT(t.id) as recent_transactions,
                    COUNT(CASE WHEN t.is_fraud = true THEN 1 END) as recent_fraud_count
                FROM users u
                LEFT JOIN transactions t ON u.id = t.user_id
                    AND t.created_at >= NOW() - INTERVAL '7 days'
                WHERE u.risk_score >= $1
                GROUP BY u.id
                ORDER BY u.risk_score DESC, recent_fraud_count DESC
                LIMIT $1
                `;

            const result = await pool.query(query, [minRiskScore, limit]);
            return result.rows;
        }catch(error){
            logger.error('Error getting high-risk users', error);
            throw error;
        }
    }

    static async create(userData: {
        email: string;
        homeLatitude?: number;
        homeLongitude?: number;
    }): Promise<User> {
        try{
            const query = `
            INSERT INTO users(email, home_latitude, home_longitude, risk_score)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            `;

            const values = [
                userData.email,
                userData.homeLatitude || null,
                userData.homeLongitude || null,
                0
            ];

            const result = await pool.query(query, values);
            logger.info(`Created new user: ${userData.email}`);
            return result.rows[0];
        }catch (error) {
            logger.error('Error creating user: ;', error);
            throw error;
        }
    }
    static async updateHomeLocation(id: string, latitude: number, longitude: number): Promise<void> {
        try{
            const query = `
            UPDATE users
            SET home_latitude = $1, home_longitude = @2
            WHERE id = $3
            `;

            await pool.query(query, [latitude, longitude, id]);
            logger.info(`Updated home location for user: ${id}`);
        }catch (error){
            logger.error('Error updating user home locations: ', error);
            throw error;
        }
    }
}