import axios from 'axios';
import { logger } from '../config/logger';

export interface MLPredictionRequest {
    amount: number;
    hour: number;
    day_of_week: number;
    is_weekend: number;
    is_night: number;
    amount_z_score: number;
    time_diff_minutes: number;
    has_location: number;
    user_risk_score: number;
    user_avg_amount: number;
    user_amount_std: number;
    user_txn_count: number;
    merchant_fraud_rate: number;
    merchant_category_encoded: number;
    merchant_risk_encoded: number;
}

export interface MLPredictionResponse {
    fraud_score: number;
    risk_level: string;
    action: string;
    model_predictions: {
        random_forest?: {
            fraud_probability: number;
            prediction: number;
        };
        xgboost?: {
            fraud_probability: number;
            prediction: number;
        };
        isolation_forest?: {
            anomaly_score: number;
            is_anomaly: number;
        };
    };
    feature_count: number;
    models_used: string[];
}

export class MLService {
    private mlApiUrl: string;
    private timeout: number;

    constructor() {
        this.mlApiUrl = process.env.ML_API_URL || 'http://localhost:5000';
        this.timeout = 5000;
    }

    async predictFraud(features: MLPredictionRequest): Promise<MLPredictionResponse | null> {
        try {
            const response = await axios.post(
                `${this.mlApiUrl}/predict`,
                features,
                {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data.success) {
                logger.debug('ML prediction successful', {
                    fraudScore: response.data.prediction.fraud_score,
                    modelsUsed: response.data.prediction.models_used
                });

                return response.data.prediction;
            } else {
                logger.warn('ML prediction failed', { error: response.data.error });
                return null;
            }

        } catch (error) {
            logger.error('Error calling ML service', { 
                error: error instanceof Error ? error.message : String(error),
                url: this.mlApiUrl 
            });
            
            return null;
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            const response = await axios.get(
                `${this.mlApiUrl}/health`,
                { timeout: 2000 }
            );

            return response.status === 200;

        } catch (error) {
            logger.warn('ML service health check failed', { error: error instanceof Error ? error.message : String(error) });
            return false;
        }
    }

    async getModelInfo(): Promise<any> {
        try {
            const response = await axios.get(
                `${this.mlApiUrl}/models`,
                { timeout: 3000 }
            );

            return response.data;

        } catch (error) {
            logger.error('Error getting model info', { error: error instanceof Error ? error.message : String(error) });
            return null;
        }
    }

    async getFeatureImportance(modelName: string = 'random_forest'): Promise<any> {
        try {
            const response = await axios.get(
                `${this.mlApiUrl}/feature-importance`,
                {
                    params: { model: modelName },
                    timeout: 3000
                }
            );

            return response.data;

        } catch (error) {
            logger.error('Error getting feature importance', { error: error instanceof Error ? error.message : String(error) });
            return null;
        }
    }
}