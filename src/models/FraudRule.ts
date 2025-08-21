import { pool } from '../config/database';
import { logger } from '../config/logger';

export interface FraudRule {
    id: string;
    name: string;
    description: string;
    ruleType: string;
    thresholdValue: number | null;
    timeWindowMinutes: number | null;
    action: 'ALLOW' | 'REVIEW' | 'BLOCK';
    isActive: boolean;
    createdAt: Date;
}

export class FraudRuleModel {
    static async findById(id: string): Promise<FraudRule | null> {
        try {
            const query = 'SELECT * FROM fraud_rules WHERE id = $1';
            const result = await pool.query(query, [id]);
            return result.rows[0] || null;
        } catch (error) {
            logger.error('Error finding fraud rule by ID', { error, id });
            throw error;
        }
    }

    static async findActiveRules(): Promise<FraudRule[]> {
        try {
            const query = 'SELECT * FROM fraud_rules WHERE is_active = true ORDER BY name';
            const result = await pool.query(query);
            return result.rows;
        } catch (error) {
            logger.error('Error finding active fraud rules', { error });
            throw error;
        }
    }

    static async findByType(ruleType: string): Promise<FraudRule[]> {
        try {
            const query = 'SELECT * FROM fraud_rules WHERE rule_type = $1 AND is_active = true';
            const result = await pool.query(query, [ruleType]);
            return result.rows;
        } catch (error) {
            logger.error('Error finding fraud rules by type', { error, ruleType });
            throw error;
        }
    }

    static async create(ruleData: {
        name: string;
        description: string;
        ruleType: string;
        thresholdValue?: number;
        timeWindowMinutes?: number;
        action: 'ALLOW' | 'REVIEW' | 'BLOCK';
    }): Promise<FraudRule> {
        try {
            const query = `
                INSERT INTO fraud_rules (name, description, rule_type, threshold_value, time_window_minutes, action)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `;

            const values = [
                ruleData.name,
                ruleData.description,
                ruleData.ruleType,
                ruleData.thresholdValue || null,
                ruleData.timeWindowMinutes || null,
                ruleData.action
            ];

            const result = await pool.query(query, values);
            logger.info('Created new fraud rule', { ruleName: ruleData.name });
            return result.rows[0];
        } catch (error) {
            logger.error('Error creating fraud rule', { error, ruleData });
            throw error;
        }
    }

    static async update(id: string, updates: Partial<FraudRule>): Promise<FraudRule | null> {
        try {
            const updateFields = [];
            const values = [];
            let paramCount = 1;

            if (updates.name !== undefined) {
                updateFields.push(`name = $${paramCount++}`);
                values.push(updates.name);
            }
            if (updates.description !== undefined) {
                updateFields.push(`description = $${paramCount++}`);
                values.push(updates.description);
            }
            if (updates.thresholdValue !== undefined) {
                updateFields.push(`threshold_value = $${paramCount++}`);
                values.push(updates.thresholdValue);
            }
            if (updates.timeWindowMinutes !== undefined) {
                updateFields.push(`time_window_minutes = $${paramCount++}`);
                values.push(updates.timeWindowMinutes);
            }
            if (updates.action !== undefined) {
                updateFields.push(`action = $${paramCount++}`);
                values.push(updates.action);
            }
            if (updates.isActive !== undefined) {
                updateFields.push(`is_active = $${paramCount++}`);
                values.push(updates.isActive);
            }

            if (updateFields.length === 0) {
                return await this.findById(id);
            }

            values.push(id);
            const query = `
                UPDATE fraud_rules 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            const result = await pool.query(query, values);
            logger.info('Updated fraud rule', { ruleId: id });
            return result.rows[0] || null;
        } catch (error) {
            logger.error('Error updating fraud rule', { error, id, updates });
            throw error;
        }
    }

    static async delete(id: string): Promise<boolean> {
        try {
            const query = 'DELETE FROM fraud_rules WHERE id = $1';
            const result = await pool.query(query, [id]);
            
            const deleted = (result.rowCount || 0) > 0;
            if (deleted) {
                logger.info('Deleted fraud rule', { ruleId: id });
            }
            
            return deleted;
        } catch (error) {
            logger.error('Error deleting fraud rule', { error, id });
            throw error;
        }
    }

    static async toggleActive(id: string): Promise<FraudRule | null> {
        try {
            const rule = await this.findById(id);
            if (!rule) {
                return null;
            }

            const query = 'UPDATE fraud_rules SET is_active = $1 WHERE id = $2 RETURNING *';
            const result = await pool.query(query, [!rule.isActive, id]);
            
            logger.info('Toggled fraud rule status', { 
                ruleId: id, 
                newStatus: !rule.isActive 
            });
            
            return result.rows[0];
        } catch (error) {
            logger.error('Error toggling fraud rule status', { error, id });
            throw error;
        }
    }

    static async findAll(limit: number = 100): Promise<FraudRule[]> {
        try {
            const query = 'SELECT * FROM fraud_rules ORDER BY created_at DESC LIMIT $1';
            const result = await pool.query(query, [limit]);
            return result.rows;
        } catch (error) {
            logger.error('Error finding all fraud rules', { error });
            throw error;
        }
    }
}