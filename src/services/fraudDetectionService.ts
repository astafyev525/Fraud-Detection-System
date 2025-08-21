import { TransactionModel } from '../models/Transaction';
import { UserModel } from '../models/User';
import { MerchantModel } from '../models/Merchant';
import { RuleEngineService } from './ruleEngineService';
import { MLService } from './mlService';
import { FeatureService } from './featureService';
import { Transaction, FraudScoreRequest, FraudScoreResponse } from '../types/transaction';
import { logger } from '../config/logger';

export interface FraudDetectionResult {
    transactionId: string;
    fraudScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    action: 'ALLOW' | 'REVIEW' | 'BLOCK';
    reasons: string[];
    processingTimeMs: number;
    ruleResults: any[];
    mlPrediction?: any;
    features?: any;
}

export class FraudDetectionService {
    private ruleEngine: RuleEngineService;
    private mlService: MLService;
    private featureService: FeatureService;

    constructor() {
        this.ruleEngine = new RuleEngineService();
        this.mlService = new MLService();
        this.featureService = new FeatureService();
    }

    async scoreTransaction(request: FraudScoreRequest): Promise<FraudDetectionResult> {
        const startTime = Date.now();
        const transactionId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

        try {
           
            const [user, merchant] = await Promise.all([
                UserModel.findById(request.userId),
                MerchantModel.findById(request.merchantId)
            ]);

            if (!user || !merchant) {
                throw new Error('User or merchant not found');
            }

           
            const userHistory = await TransactionModel.findByUserId(request.userId, 100);

            
            const features = await this.featureService.extractFeatures(request, user, merchant, userHistory);

            
            const ruleResults = await this.ruleEngine.evaluateTransaction(request, user, merchant, userHistory);

        
            const mlPrediction = await this.mlService.predictFraud(features);

            
            const combinedResult = this.combineScores(ruleResults, mlPrediction);

            const processingTime = Date.now() - startTime;

            
            const result: FraudDetectionResult = {
                transactionId,
                fraudScore: combinedResult.fraudScore,
                riskLevel: combinedResult.riskLevel,
                action: combinedResult.action,
                reasons: combinedResult.reasons,
                processingTimeMs: processingTime,
                ruleResults,
                mlPrediction,
                features
            };

           
            logger.info('Transaction scored', {
                transactionId,
                userId: request.userId,
                merchantId: request.merchantId,
                amount: request.amount,
                fraudScore: result.fraudScore,
                action: result.action,
                processingTime
            });

            return result;

        } catch (error) {
            logger.error('Error scoring transaction', { error, transactionId, request });
            throw error;
        }
    }

    private combineScores(ruleResults: any[], mlPrediction: any): {
        fraudScore: number;
        riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
        action: 'ALLOW' | 'REVIEW' | 'BLOCK';
        reasons: string[];
    } {
        let fraudScore = 0;
        const reasons: string[] = [];

        let ruleScore = 0;
        let hasBlockingRule = false;

        for (const rule of ruleResults) {
            if (rule.triggered) {
                ruleScore += rule.score || 0;
                reasons.push(rule.reason || rule.ruleName);
                
                if (rule.action === 'BLOCK') {
                    hasBlockingRule = true;
                }
            }
        }

        let mlScore = 0;
        if (mlPrediction && mlPrediction.fraud_score) {
            mlScore = mlPrediction.fraud_score;
            
            if (mlScore > 70) {
                reasons.push('High ML fraud probability');
            } else if (mlScore > 50) {
                reasons.push('Moderate ML fraud probability');
            }
        }
        fraudScore = Math.min(100, (ruleScore * 0.6) + (mlScore * 0.4));
        let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
        let action: 'ALLOW' | 'REVIEW' | 'BLOCK';

        if (hasBlockingRule || fraudScore >= 80) {
            riskLevel = 'HIGH';
            action = 'BLOCK';
        } else if (fraudScore >= 50) {
            riskLevel = 'MEDIUM';
            action = 'REVIEW';
        } else {
            riskLevel = 'LOW';
            action = 'ALLOW';
        }

        return { fraudScore, riskLevel, action, reasons };
    }

    async batchScoreTransactions(requests: FraudScoreRequest[]): Promise<FraudDetectionResult[]> {
        const results: FraudDetectionResult[] = [];
        
        for (const request of requests) {
            try {
                const result = await this.scoreTransaction(request);
                results.push(result);
            } catch (error) {
                logger.error('Error in batch scoring', { error, request });
            }
        }

        return results;
    }

    private isUnusualHour(timestamp: Date): boolean {
        const hour = timestamp.getHours();
        return hour >= 22 || hour <= 6;
    }
}