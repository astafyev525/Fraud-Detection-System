import { FraudScoreRequest, User, Merchant, Transaction } from '../types/transaction';
import { MLPredictionRequest } from './mlService';
import { logger } from '../config/logger';

export class FeatureService {

    async extractFeatures(
        request: FraudScoreRequest,
        user: User,
        merchant: Merchant,
        userHistory: Transaction[]
    ): Promise<MLPredictionRequest> {
        
        const now = new Date();
        const hour = now.getHours();
        const dayOfWeek = now.getDay();

        const amountFeatures = this.calculateAmountFeatures(request.amount, userHistory);
        const temporalFeatures = this.calculateTemporalFeatures(hour, dayOfWeek);
        const velocityFeatures = this.calculateVelocityFeatures(userHistory);
        const merchantFeatures = this.calculateMerchantFeatures(merchant, userHistory);

        const features: MLPredictionRequest = {
            amount: request.amount,
            hour: hour,
            day_of_week: dayOfWeek,
            is_weekend: temporalFeatures.isWeekend,
            is_night: temporalFeatures.isNight,
            amount_z_score: amountFeatures.zScore,
            time_diff_minutes: velocityFeatures.timeDiffMinutes,
            has_location: request.latitude && request.longitude ? 1 : 0,
            user_risk_score: user.riskScore || 0,
            user_avg_amount: amountFeatures.userAvgAmount,
            user_amount_std: amountFeatures.userAmountStd,
            user_txn_count: userHistory.length,
            merchant_fraud_rate: merchantFeatures.fraudRate,
            merchant_category_encoded: this.encodeMerchantCategory(merchant.category),
            merchant_risk_encoded: this.encodeMerchantRisk(merchant.riskLevel)
        };

        logger.debug('Features extracted', {
            userId: user.id,
            merchantId: merchant.id,
            featuresCount: Object.keys(features).length
        });

        return features;
    }

    private calculateAmountFeatures(currentAmount: number, userHistory: Transaction[]) {
        if (userHistory.length === 0) {
            return {
                zScore: 0,
                userAvgAmount: currentAmount,
                userAmountStd: 0
            };
        }

        const amounts = userHistory.map(tx => tx.amount);
        const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
        
        const variance = amounts.reduce((sum, amt) => sum + Math.pow(amt - avgAmount, 2), 0) / amounts.length;
        const stdAmount = Math.sqrt(variance);
        
        const zScore = stdAmount > 0 ? Math.abs(currentAmount - avgAmount) / stdAmount : 0;

        return {
            zScore,
            userAvgAmount: avgAmount,
            userAmountStd: stdAmount
        };
    }

    private calculateTemporalFeatures(hour: number, dayOfWeek: number) {
        return {
            isWeekend: dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0,
            isNight: hour >= 22 || hour <= 6 ? 1 : 0
        };
    }

    private calculateVelocityFeatures(userHistory: Transaction[]) {
        if (userHistory.length === 0) {
            return { timeDiffMinutes: 9999 };
        }

        const sortedHistory = userHistory.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        const lastTxTime = new Date(sortedHistory[0].createdAt);
        const currentTime = new Date();
        const timeDiffMinutes = (currentTime.getTime() - lastTxTime.getTime()) / (1000 * 60);

        return { timeDiffMinutes };
    }

    private calculateMerchantFeatures(merchant: Merchant, userHistory: Transaction[]) {
        const merchantTransactions = userHistory.filter(tx => tx.merchantId === merchant.id);
        const fraudCount = merchantTransactions.filter(tx => tx.isFraud).length;
        
        const fraudRate = merchantTransactions.length > 0 
            ? fraudCount / merchantTransactions.length 
            : 0.02;

        return { fraudRate };
    }

    private encodeMerchantCategory(category: string): number {
        const categoryMap: { [key: string]: number } = {
            'COFFEE': 0,
            'GAS': 1,
            'ECOMMERCE': 2,
            'ATM': 3,
            'RETAIL': 4,
            'RESTAURANT': 5,
            'GROCERY': 6,
            'ENTERTAINMENT': 7,
            'TRAVEL': 8,
            'OTHER': 9
        };

        return categoryMap[category] || 9;
    }

    private encodeMerchantRisk(riskLevel: string): number {
        const riskMap: { [key: string]: number } = {
            'LOW': 0,
            'MEDIUM': 1,
            'HIGH': 2
        };

        return riskMap[riskLevel] || 0;
    }
}