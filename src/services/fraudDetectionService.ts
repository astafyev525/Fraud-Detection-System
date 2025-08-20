import { TransactionModel } from '../models/Transaction';
import { UserModel } from '../models/User';
import { MerchantModel } from '../models/Merchant';
import { RuleEngineService } from './ruleEngineService';
import { MLService } from './mlservice';
import { FeatureService } from './featureService';
import { Transaction, FraudScoreRequest, FraudScoreResponse } from '../types/transaction';

export interface FraudDetectionResult {
    
}