export interface User {
    id: string;
    email: string;
    createdAt: Date;
    homeLatitude?: number;
    homeLongitude?: number;
    riskScore: number;
    totalTransactions: number;
    avgTransactionAmount: number;
}

export interface Merchant {
    id: string;
    name: string;
    category: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    latitude?: number;
    longitude?: number;
    createdAt: Date;
}

export interface Transaction {
    id: string;
    userId: string;
    merchantId: string;
    amount: number;
    currency: string;
    latitude?: number;
    longitude?: number;
    deviceFingerprint?: string;
    ipAddress?: string;
    createdAt: Date;
    fraudScore?: number;
    isFraud: boolean;
    isBlocked: boolean;
    processingTimeMs?: number;
}

export interface FraudScoreRequest {
    userId: string;
    merchantId: string;
    amount: number;
    currency?: string;
    latitude?: number;
    longitude?: number;
    deviceFingerprint?: string;
    ipAddress?: string;
}

export interface FraudScoreResponse {
    transactionId: string;
    fraudScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    action: 'ALLOW' | 'REVIEW' | 'BLOCK';
    reasons: string[];
    processingTimeMs: number;
}