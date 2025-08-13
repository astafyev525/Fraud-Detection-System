import { Router, Request, Response } from 'express';
import { TransactionModel } from '../models/Transaction';
import { UserModel } from '../models/User';
import { MerchantModel } from '../models/Merchant';
import { ApiResponse } from '../types/api';
import { logger } from '../config/logger';
import { ValidationError, asyncHandler } from '../middleware/errorHandler';
import Joi from 'joi';

const router = Router();

const dashboardQuerySchema = Joi.object({
    days: Joi.number().integer().min(1).max(365).default(7)
});

const trendsQuerySchema = Joi.object({
    days: Joi.number().integer().min(1).max(90).default(30),
    granularity: Joi.string().valid('hour', 'day').default('day')
});

router.get('./dashboard', asyncHandler(async( req: Request, res: Response) => {
    const { error, value } = dashboardQuerySchema.validate(req.query);
    if(error) {
        throw new ValidationError(`Invalid query parameters: ${error.details[0].message}`);
    }

    const { days } = value;

    const fraudStats = await TransactionModel.getFraudStats(days);
    const highRiskUsers = await UserModel.getHighRiskUsers(10, 70);
    const highRiskMerchants = await MerchantModel.getHighRiskMerchants(10);
    const hourlyTrends = await TransactionModel.getHourlyFraudTrends(days);

    const kpis = {
        fraudDetectionRate: fraudStats.fraud_transactions > 0
        ? ((fraudStats.fraud_transactions / fraudStats.total_transactions) * 100).toFixed(20)
        : '0.00' ,

        fraudAmountPrevented: fraudStats.fraud_amount || 0,
        totalAmountProcessed: fraudStats.total_amount || 0,

        averageFraudScore: fraudStats.avg_fraud_score || 0,
        blockedTransactionRate: fraudStats.blocked_transactions > 0
        ? ((fraudStats.blocked_transactions / fraudStats.total_transactions) * 100).toFixed(2)
        : '0.00',

        highRiskUserCount: highRiskUsers.length,
        highRiskMerchantCount: highRiskMerchants.length
    };

    const previousPeriodStats = await TransactionModel.getFraudStats(days * 2);
    const previousFraudRate = previousPeriodStats.total_transactions > 0
    ? (previousPeriodStats.fraud_transactions / previousPeriodStats.total_transactions) * 100
    : 0;
    const currentFraudRate = fraudStats.total_transactions > 0
    ? (fraudStats.fraud_transactions / fraudStats.total_transactions) * 100
    : 0;

    const fraudTrend = {
        current: currentFraudRate.toFixed(2),
        previous: previousFraudRate.toFixed(2),
        change: (currentFraudRate - previousFraudRate).toFixed(2),
        direction: currentFraudRate > previousFraudRate ? 'up' : currentFraudRate < previousFraudRate ? 'down': 'stable'
    };
    const peakFraudHour = hourlyTrends.reduce((max, hour) => 
        (hour.fraud_transactions > (max?.fraud_transactions || 0)) ? hour: max ,
        null as any
    );

    const response: ApiResponse = {
        success: true,
        data: {
            summary: {
                totalTransactions: fraudStats.total_transactions,
                fraudTransactions: fraudStats.fraud_transactions,
                fraudRate: fraudStats.fraud_rate_percent,
                totalAmount: fraudStats.total_amount,
                fraudAmount: fraudStats.fraud_amount,
                blockedTransactions: fraudStats.blocked_transactions,
                period: `${days} days`
            },
            kpis,
            trends: {
                fraudrRate: fraudTrend,
                peakFraudHour: peakFraudHour ? {
                    hour: peakFraudHour.hour,
                    fraudCount: peakFraudHour.fraud_transactions,
                    totalCount: peakFraudHour.total_transactions
                }: null
            },
            alerts: {
                highRiskUsers: highRiskUsers.slice(0,5).map(user => ({
                    id: user.id,
                    email: user.email,
                    riskScore: user.risk_score,
                    recentTransactions: user.recent_transactions,
                    recentFraudCount: user.recent_fraud_count
                })),
                highRiskmerchants: highRiskMerchants.slice(0,5).map(merchant => ({
                    id: merchant.id,
                    name: merchant.name,
                    category: merchant.category,
                    riskLevel: merchant.risk_level,
                    recentFraudCount: merchant.recent_fraud_count,
                    fraudrate: merchant.fraud_rate_percent
                }))
            },
            hourlyActivity: hourlyTrends
        },
        timestamp: new Date().toISOString()
    };
    logger.info(`Dashboard analytics generated for ${days} days`, {
        totalTransactions: fraudStats.total_transactions,
        fraudRate: fraudStats.fraud_rate_percent 
    });
    res.json(response);
}));

