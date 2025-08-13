import { Router, Request, Response, NextFunction } from 'express';
import { TransactionSimulator } from '../services/transactionSimulator';
import { TransactionModel } from '../models/Transaction';
import { UserModel } from '../models/User';
import { MerchantModel } from '../models/Merchant';
import { ApiResponse } from '../types/api';
import { Transaction, FraudScoreRequest, FraudScoreResponse } from '../types/transaction';
import { logger } from '../config/logger';
import { ValidationError, NotFoundError, asyncHandler } from '../middleware/errorHandler';
import Joi from 'joi';

const router = Router();

const simulator = new TransactionSimulator();
simulator.initialize().catch(err => logger.error('Failed to initialize simulator', err));

const fraudScoreSchema = Joi.object({
    userId: Joi.string().uuid().required(),
    merchantId: Joi.string().uuid().required(),
    amount: Joi.number().positive().max(1000000).required(),
    currency: Joi.string().length(3).default('USD'),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    deviceFingerprint: Joi.number().max(255).optional(),
    ipAddress: Joi.string().ip().optional()
});

const generateTransactionsSchema = Joi.object({
    count: Joi.number().integer().min(1).max(1000).default(10),
    fraudRate: Joi.number().min(0).max(1).default(0.05)
});

router.post('/score', asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();

    const { error, value } = fraudScoreSchema.validate(req.body);

    if(error) {
        throw new ValidationError(`Invalid request data ${error.details[0].message}`);
    }
    const fraudRequest: FraudScoreRequest = value;

    const user = await UserModel.findById(fraudRequest.userId);
    if(!user) {
        throw new NotFoundError(`User with ID ${fraudRequest.userId} not found`);
    }

    const merchant = await MerchantModel.findById(fraudRequest.merchantId);
    if(!merchant) {
        throw new NotFoundError(`Merchant with ID ${fraudRequest.merchantId} not found`);
    }

    let fraudScore = 0;
    const reasons: string[] = [];

    if (fraudRequest.amount > 5000) {
        fraudScore += 40;
        reasons.push('High transaction amount');
    }
    else if (fraudRequest.amount > 1000) {
        fraudScore += 20;
        reasons.push('Above average transaction amount');
    }

    const recentTransactions = await TransactionModel.countRecentTransactions(fraudRequest.userId, 10);
    if (recentTransactions >= 5) {
        fraudScore += 35;
        reasons.push('High transaction velocity');
    } else if (recentTransactions >= 3) {
        fraudScore += 15;
        reasons.push('Moderate transaction velocity');
    }

    if(user.riskScore > 70){
        fraudScore += 30;
        reasons.push('High-risk user profile');
    }
    else if (user.riskScore > 40) {
        fraudScore += 15;
        reasons.push('Medium-risk user profile');
    }

    if (merchant.riskLevel == 'HIGH') {
        fraudScore += 25;
        reasons.push('High-risk merchant');
    } else if (merchant.riskLevel == 'MEDIUM') {
        fraudScore += 10;
        reasons.push('Transaction during unusual hours');
    }

    if (fraudRequest.deviceFingerprint) {
        const userTransactions = await TransactionModel.findByUserId(fraudRequest.userId, 50);
        const knownDevices = [...new Set(userTransactions.map(t => t.deviceFingerprint).filter(Boolean))];
        if (!knownDevices.includes(fraudRequest.deviceFingerprint)){
            fraudScore += 20;
            reasons.push('New device detected');
        }
    }
    fraudScore = Math.min(100, Math.max(0, fraudScore));
    
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    let action: 'ALLOW' | 'REVIEW' | 'BLOCK';

    if(fraudScore >= 80) {
        riskLevel = 'HIGH';
        action = 'BLOCK';
    }
    else if (fraudScore >= 50) {
        riskLevel = 'MEDIUM';
        action = 'REVIEW';
    }
    else{
        riskLevel = 'LOW';
        action = 'ALLOW';
    }

    const processingTime = Date.now() - startTime;

    const fraudResponse: FraudScoreResponse = {
        transactionId: `txn_${Date.now()}_${Math.random().toString(26).slice(2,11)}`,
        fraudScore,
        riskLevel,
        action,
        reasons,
        processingTimeMs: processingTime
    };

    logger.info('Transaction scored', {
        transactionId: fraudResponse.transactionId,
        userId: fraudRequest.userId,
        merchantId: fraudRequest.merchantId,
        amount: fraudRequest.amount,
        fraudScore,
        action,
        processingTime
    });

    const response: ApiResponse<FraudScoreResponse> = {
        success: true,
        data: fraudResponse,
        timestamp: new Date().toISOString()
    };

    res.json(response);
}));
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
        throw new ValidationError('Transactoin ID is required');
    }

    const transaction = await TransactionModel.findById(id);

    if(!transaction){
        throw new NotFoundError(`Transaction with ID ${id} not found`);
    }

    const user = await UserModel.findById(transaction.userId);
    const merchant = await MerchantModel.findById(transaction.merchantId);

    const response: ApiResponse = {
        success: true,
        data: {
            transaction,
            user: user? {id: user.id, email: user.email, riskScore: user.riskScore }: null,
            merchant: merchant ? {id: merchant.id, name: merchant.name, category: merchant.category, riskLevel: merchant.riskLevel }: null
        },
        timestamp: new Date().toISOString()
    };
    res.json(response);
}));

router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const userId = req.query.userId as string;
    const merchantId = req.query.merchantId as string;
    const fraudOnly = req.query.fraudOnly == 'true';

    let transactions: Transaction[] = [];

    if(userId){
        transactions = await TransactionModel.findByUserId(userId, limit);
    }
    else if (merchantId) {
        transactions = await TransactionModel.findByMerchantId(merchantId, limit);
    }
    else {// Get recent transactions (this would need a new method in TransactionModel)
        // For now, we'll return a placeholder
        transactions = [];
    }

    if (fraudOnly) {
        transactions = transactions.filter(t => t.isFraud);
    }

    const response: ApiResponse = {
        success: true,
        data: {
            transactions,
            pagination: {
                page, 
                limit,
                total: transactions.length,
                totalPages: Math.ceil(transactions.length/limit)
            }
        },
        timestamp: new Date().toISOString()
    };

    res.json(response);
}));

router.post('/generate', asyncHandler(async(req: Request, res: Response) => {
    if(process.env.NODE_ENV == 'production'){
        throw new ValidationError('Transactoin generation is only available in development mode');
    }

    const { error, value } = generateTransactionsSchema.validate(req.body);
    if (error) {
        throw new ValidationError(`Invalid request data: ${error.details[0].message}`);
    }

    const { count, fraudRate } = value;

    logger.info(`Generating ${count} test transactions with ${fraudRate * 100}$ fraud rate`);

    const transactions = await simulator.generateBatch(count, fraudRate);

    const response: ApiResponse = {
        success: true,
        data: {
            generated: transactions.length,
            fraudCount: transactions.filter(t => t.isFraud).length,
            transactions: transactions.slice(0,5)
        },
        message: `Successfully generated ${transactions.length} test transactions`,
        timestamp: new Date().toISOString()
    };

    res.json(response);
}));

router.get('/api/:userId/stats', asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const days = Math.min(365, Math.max(1, parseInt(req.query.days as string) || 30));

    const user = await UserModel.findById(userId);
    if(!user){
        throw new NotFoundError(`User with ID ${userId} not found`);
    }

    const stats = await UserModel.getTransactionStats(userId, days);
    const behavior = await UserModel.getSpendingBehavior(userId, days);

    const response: ApiResponse = {
        success: true,
        data: {
            user: {
                id: user.id,
                email: user.email,
                riskScore: user.riskScore
            },
            stats,
            behavior,
            period: `${days} days`
        },
        timestamp: new Date().toISOString()
    };

    res.json(response);
}));

export default router;