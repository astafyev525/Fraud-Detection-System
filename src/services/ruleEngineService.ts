import { TransactionModel } from '../models/Transaction';
import { FraudScoreRequest, User, Merchant, Transaction } from '../types/transaction';
import { logger } from '../config/logger';

export interface RuleResult {
    ruleId: string;
    ruleName: string;
    triggered: boolean;
    score: number;
    action: 'ALLOW' | 'REVIEW' | 'BLOCK';
    reason: string;
    priority: number;
}

export class RuleEngineService {
    
    async evaluateTransaction(
        request: FraudScoreRequest, 
        user: User, 
        merchant: Merchant, 
        userHistory: Transaction[]
    ): Promise<RuleResult[]> {
        const results: RuleResult[] = [];

       
        results.push(await this.checkHighAmountRule(request));
        
       
        results.push(await this.checkVelocityRule(request, userHistory));
        
        
        results.push(this.checkUnusualHourRule(request));
        
       
        results.push(this.checkUserRiskRule(user));
        
        
        results.push(this.checkMerchantRiskRule(merchant));
        
      
        results.push(this.checkNewDeviceRule(request, userHistory));

      
        return results
            .filter(rule => rule.triggered)
            .sort((a, b) => b.priority - a.priority);
    }

    private async checkHighAmountRule(request: FraudScoreRequest): Promise<RuleResult> {
        const isHighAmount = request.amount > 5000;
        
        return {
            ruleId: 'high_amount',
            ruleName: 'High Amount Transaction',
            triggered: isHighAmount,
            score: isHighAmount ? 40 : 0,
            action: isHighAmount ? 'BLOCK' : 'ALLOW',
            reason: `Transaction amount $${request.amount} exceeds $5000 threshold`,
            priority: 10
        };
    }

    private async checkVelocityRule(request: FraudScoreRequest, userHistory: Transaction[]): Promise<RuleResult> {
        const recentCount = await TransactionModel.countRecentTransactions(request.userId, 10);
        const isHighVelocity = recentCount >= 5;
        
        return {
            ruleId: 'velocity_check',
            ruleName: 'Transaction Velocity',
            triggered: isHighVelocity,
            score: isHighVelocity ? 35 : 0,
            action: isHighVelocity ? 'REVIEW' : 'ALLOW',
            reason: `${recentCount} transactions in last 10 minutes (limit: 5)`,
            priority: 9
        };
    }

    private checkUnusualHourRule(request: FraudScoreRequest): RuleResult {
        const now = new Date();
        const hour = now.getHours();
        const isUnusualHour = hour >= 22 || hour <= 6;
        
        return {
            ruleId: 'unusual_hour',
            ruleName: 'Unusual Transaction Hour',
            triggered: isUnusualHour,
            score: isUnusualHour ? 15 : 0,
            action: 'REVIEW',
            reason: `Transaction at ${hour}:00 is outside normal hours (7 AM - 9 PM)`,
            priority: 5
        };
    }

    private checkUserRiskRule(user: User): RuleResult {
        const isHighRisk = user.riskScore > 70;
        const isMediumRisk = user.riskScore > 40;
        
        let score = 0;
        let action: 'ALLOW' | 'REVIEW' | 'BLOCK' = 'ALLOW';
        
        if (isHighRisk) {
            score = 30;
            action = 'REVIEW';
        } else if (isMediumRisk) {
            score = 15;
            action = 'REVIEW';
        }
        
        return {
            ruleId: 'user_risk',
            ruleName: 'User Risk Profile',
            triggered: isHighRisk || isMediumRisk,
            score,
            action,
            reason: `User risk score ${user.riskScore} indicates ${isHighRisk ? 'high' : 'medium'} risk`,
            priority: 7
        };
    }

    private checkMerchantRiskRule(merchant: Merchant): RuleResult {
        const isHighRisk = merchant.riskLevel === 'HIGH';
        const isMediumRisk = merchant.riskLevel === 'MEDIUM';
        
        let score = 0;
        let action: 'ALLOW' | 'REVIEW' | 'BLOCK' = 'ALLOW';
        
        if (isHighRisk) {
            score = 25;
            action = 'REVIEW';
        } else if (isMediumRisk) {
            score = 10;
            action = 'REVIEW';
        }
        
        return {
            ruleId: 'merchant_risk',
            ruleName: 'Merchant Risk Level',
            triggered: isHighRisk || isMediumRisk,
            score,
            action,
            reason: `Merchant ${merchant.name} has ${merchant.riskLevel} risk level`,
            priority: 6
        };
    }

    private checkNewDeviceRule(request: FraudScoreRequest, userHistory: Transaction[]): RuleResult {
        if (!request.deviceFingerprint) {
            return {
                ruleId: 'new_device',
                ruleName: 'New Device Detection',
                triggered: false,
                score: 0,
                action: 'ALLOW',
                reason: 'No device fingerprint provided',
                priority: 4
            };
        }

        const knownDevices = userHistory
            .map(tx => tx.deviceFingerprint)
            .filter(Boolean);
        
        const isNewDevice = !knownDevices.includes(request.deviceFingerprint);
        
        return {
            ruleId: 'new_device',
            ruleName: 'New Device Detection',
            triggered: isNewDevice,
            score: isNewDevice ? 20 : 0,
            action: isNewDevice ? 'REVIEW' : 'ALLOW',
            reason: isNewDevice ? 'Transaction from unrecognized device' : 'Device recognized',
            priority: 4
        };
    }
}