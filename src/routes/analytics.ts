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

router.get('/trends', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = trendsQuerySchema.validate(req.query);
    if (error) {
        throw new ValidationError(`Invalid query parameters: ${error.details[0].message}`);
    }

    const { days, granularity } = value;

    let trendsData;

    if(granularity == 'hour'){
        const maxDays = Math.min(days, 7);
        trendsData = await TransactionModel.getHourlyFraudTrends(maxDays);
    }else {
        const hourlyData = await TransactionModel.getHourlyFraudTrends(days);

        const dailyMap = new Map();

        hourlyData.forEach(hour => {
            const day = Math.floor(Number(hour.hour) / 24);
            if(!dailyMap.has(day)){
                dailyMap.set(day, {
                    day,
                    total_transactions: 0,
                    fraud_transactions: 0,
                    avg_fraud_score: 0
                });
            }
            const dayData = dailyMap.get(day);
            dayData.total_transactions += Number(hour.total_transactions);
            dayData.fraud_transactions += Number(hour.fraud_transactions);
            dayData.avg_fraud_score = (dayData.avg_fraud_score + Number(hour.avg_fraud_score)) / 2;
        });
        trendsData = Array.from(dailyMap.values());
    }
    const totalTransactions = trendsData.reduce((sum, item) => sum + Number(item.total_transactions || 0), 0);
    const totalFraud = trendsData.reduce((sum, item) => sum + Number(item.fraud_transactions || 0), );
    const avgFraudScore = trendsData.length > 0
        ? trendsData.reduce((sum, item) => sum + Number(item.avg_fraud_score || 0), 0)/ trendsData.length
        : 0;

    const response: ApiResponse = {
        success: true,
        data: {
            trends: trendsData,
            summary: {
                period: `${days} days`,
                granularity,
                totalTransactions,
                totalFraud,
                overallFraudRate: totalTransactions > 0? ((totalFraud / totalTransactions) * 100).toFixed(2) : '0.00',
                avgFraudScore: avgFraudScore.toFixed(2)
            }
        },
        timestamp: new Date().toISOString()
    };
    res.json(response);
}));

router.get('/high-risk', asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const minFraudScore = Math.max(0, Math.min(100, parseInt(req.query.minScore as string) || 70));

    const highRiskTransactions = await TransactionModel.getHighRiskTransactions(limit, minFraudScore);
    const highRiskUsers = await UserModel.getHighRiskUsers(limit, 60);
    const highRiskMerchants = await MerchantModel.getHighRiskMerchants(limit);

    const response: ApiResponse = {
        success: true,
        data: {
            transactions: highRiskTransactions.map(tx => ({
                id: tx.id,
                amount: tx.amount,
                fraudScore: tx.fraud_score,
                isBlocked: tx.is_blocked,
                cratedAt: tx.created_at,
                user: {
                    email: tx.user_email,
                    riskScore: tx.user_risk_score
                },
                merchant: {
                    name: tx.merchant_name,
                    category: tx.mercahant_category
                }
            })),
            users: highRiskUsers.map(user => ({
                id: user.id,
                email: user.email,
                riskScore: user.risk_score,
                recentTransactions: user.recent_transactions,
                recentFraudCount: user.recent_fraud_count
            })),
            merchants: highRiskMerchants.map(merchant => ({
                id: merchant.id,
                name: merchant.name,
                category: merchant.category,
                riskLevel: merchant.risk_level,
                recentTransactions: merchant.recent_transactions,
                fraudRate: merchant.fraud_rate_percent
            })),
            criteria: {
                minFraudScore,
                limit,
                userMinRiskScore: 60
            }
        },
        timestmap: new Date().toISOString()
    };
    res.json(response);
}));

router.get('/merchant-stats', asyncHandler(async (req: Request, res: Response) => {
    const categoryStats = await MerchantModel.getCategoryStats();

    const totals = categoryStats.reduce((acc, cat) => ({
        totalMerchants: acc.totalMerchants + Number(cat.merchant_count),
        totalHighRisk: acc.totalHighRisk + Number(cat.high_risk_count),
        totalMediumRisk: acc.totalMediumRisk + Number(cat.medium_risk_count),
        totalLowRisk: acc.totalLowRisk + Number(cat.low_risk_count)
    }), {totalMerchants: 0, totalHighRisk:0, totalMediumRisk: 0, totalLowRisk: 0});

    const categoriesWithPercentages = categoryStats.map(cat => ({
        category: cat.category,
        merchantCount: Number(cat.merchant_count),
        riskDistribution: {
            high: Number(cat.high_risk_count),
            medium: Number(cat.medium_risk_count),
            low: Number(cat.low_risk_count)
        },
        percentages: {
            ofTotal: totals.totalMerchants > 0
                ?((Number(cat.merchant_count) / totals.totalMerchants) * 100).toFixed(1)
                :'0.0',
                highRisk: Number(cat.merchant_count) > 0
                ? ((Number(cat.high_risk_count) / Number(cat.merchant_count)) * 100).toFixed(1)
                : '0.0'
            }
    }));
    const response: ApiResponse = {
        success: true,
        data: {
            categories: categoriesWithPercentages,
            summary: {
                totalMerchants: totals.totalMerchants,
                riskDistribution: {
                    high: totals.totalHighRisk,
                    medium: totals.totalMediumRisk,
                    low: totals.totalLowRisk
                },
                riskPercentages: {
                    high: totals.totalMerchants > 0
                    ?((totals.totalHighRisk / totals.totalMerchants) * 100).toFixed(2)
                    : '0.0',
                    medium: totals.totalMerchants > 0
                    ? ((totals.totalMediumRisk / totals.totalMerchants) * 100).toFixed(1)
                    : '0.0',
                    low: totals.totalMerchants > 0
                     ? ((totals.totalLowRisk / totals.totalMerchants) * 100).toFixed(1)
                    : '0.0'
                }
            }
        },
        timestamp: new Date().toISOString()
    };
    res.json(Response);
}));

router.get('/performance', asyncHandler(async(req: Request, res: Response) => {
    const days = Math.min(30, Math.max(1, parseInt(req.query.days as string) || 7));

    const performanceData = {
        fraudScoring: {
            avgProcessingTime: 85,
            p95ProcessingTime: 150,
            p99ProcessingTime: 250,
            totalRequests: 12500,
            successRate: 99.8
        },
        database: {
            avgQueryTime: 12,
            connectionPoolUsage: 65,
            slowQueries: 3,
            failedQueries: 0
        },
        systemResources: {
            cpuUsage: process.cpuUsage(),
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime()
        }
    };
    const response: ApiResponse = {
        success: true,
        data: {
            period: `${days} days`,
            performance: performanceData,
            reccomendations: [
                ...(performanceData.fraudScoring.avgProcessingTime > 100 ? ['Consider optimizing fraud scoring algorithm'] : []),
                ...(performanceData.database.connectionPoolUsage > 80 ? ['Monitor database connection pool usage'] : []),
                ...(performanceData.database.slowQueries > 5 ? ['Investigate slow database queries'] : [])

            ]
        },
        timestamp: new Date().toISOString()
    }
    res.json(response);
}));

export default router;