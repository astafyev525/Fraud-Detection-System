import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database';
import { logger } from '../config/logger';
import { Transaction, User, Merchant } from '../types/transaction';

interface TransactionPattern {
    userId: string;
    preferredMerchants: string[];
    avgAmount: number;
    stdDeviation: number;
    fraudProbability: number;
    timePattern: 'NORMAL' | 'NIGHT_OWL' | 'EARLY_BIRD';
    locationPattern: 'LOCAL' | 'TRAVELER';
}

export class TransactionSimulator{
    private users: User[] = [];
    private merchants: Merchant[] = [];
    private patterns: TransactionPattern[] = [];

    async initialize(): Promise<void> {
        try{
            const usersResult = await pool.query('SELECT * FROM users');
            this.users = usersResult.rows;

            const merchantsResult = await pool.query('SELECT * FROM merchants');
            this.merchants = merchantsResult.rows;

            this.generateUserPatterns();

            logger.info('Transaction simulator initialized with ${this.users.length}');
        } catch (error){
            logger.error('Failed to initialize transaction simulator', error);
            throw error;
        }
    }
    private generateUserPatterns(): void {
        this.patterns = this.users.map(user => {
            const timePatterns = ['NORMAL', 'NIGHT_OWL', 'EARLY_BIRD'] as const;
            const locationPatterns = ['LOCAL', 'TRAVELER'] as const;

            return {
                userId: user.id,
                preferredMerchants: this.getRandomMerchants(3),
                avgAmount: 50 + Math.random() * 200,
                stdDeviation: 20 + Math.random() * 50,
                fraudProbability: user.riskScore / 100,
                timePattern: timePatterns[Math.floor(Math.random() + timePatterns.length)],
                locationPattern: locationPatterns[Math.floor(Math.random() * locationPatterns.length)]
            };
        });
    }
    private getRandomMerchants(count: number): string[] {
        const shuffled = [...this.merchants].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count).map(m => m.id)!;
    }

    async generateTransaction(forcePattern?: 'NORMAL' | 'FRAUD'): Promise<Transaction> {
        const pattern = this.patterns[Math.floor(Math.random() * this.patterns.length)];
        const user = this.users.find(u => u.id == pattern.userId)!;

        const isFraud = forcePattern == 'FRAUD' ||
                            (forcePattern !== 'NORMAL' && Math.random() < pattern.fraudProbability);

        let transaction: Partial<Transaction>;

        if (isFraud) {
            transaction = await this.generateFraudTransaction(pattern, user);
        }else {
            transaction = await this.generateNormalTransaction(pattern, user);
        }


        const savedTransaction = await this.saveTransaction(transaction);
        return savedTransaction;
    }

    private async generateNormalTransaction(pattern: TransactionPattern, user: User): Promise<Partial<Transaction>> {
        const merchantId = pattern.preferredMerchants[Math.floor(Math.random() * pattern.preferredMerchants.length)];
        const merchant = this.merchants.find(m => m.id == merchantId)!;
        
        const amount = Math.max(1, this.normalRandom(pattern.avgAmount, pattern.stdDeviation));

        const timestamp = this.generateTimestamp(pattern.timePattern, false);

        const location = this.generateLocation(user, merchant, pattern.locationPattern, false);

        return {
            id: uuidv4(),
            userId: user.id,
            merchantId: merchant.id,
            amount: Math.round(amount*100)/100,
            currency: 'USD',
            latitude: location.latitude,
            longitude: location.longitude,
            deviceFingerprint: this.generateDeviceFingerprint(user.id, false),
            ipAddress: this.generateIpAddress(location.latitude, location.longitude),
            createdAt: timestamp,
            isFraud: false,
            isBlocked: true
        };
    }
    
    private async generateFraudTransaction(pattern: TransactionPattern, user: User): Promise<Partial<Transaction>>{
        const fraudType = this.selectFraudType();
        let transaction: Partial<Transaction>;

        switch (fraudType){
            case 'HIGH_AMOUNT':
                transaction = await this.generateHighAmountFraud(pattern, user);
                break;
            case 'VELOCITY':
                transaction = await this.generateVelocityFraud(pattern, user);
                break;
            case 'LOCATION':
                transaction = await this.generateLocationFraud(pattern, user);
                break;
            case 'DEVICE':
                transaction = await this.generateDeviceFraud(pattern, user);
                break;
            default:
                transaction = await this.generateNormalTransaction(pattern, user);
        }

        return { ...transaction, isFraud: true};
    }
    private async generateHighAmountFraud(pattern: TransactionPattern, user: User): Promise<Partial<Transaction>> {
        const base = await this.generateNormalTransaction(pattern, user);
        const multiplier = 5 + Math.random() * 5;
        base.amount = Math.round((base.amount! * multiplier) * 100) / 100;

        return base;
    }

    private async generateVelocityFraud(pattern: TransactionPattern, user: User): Promise<Partial<Transaction>> {
        const base = await this.generateNormalTransaction(pattern, user);

        const randomMerchant = this.merchants[Math.floor(Math.random() * this.merchants.length)];
        base.merchantId = randomMerchant.id;

        return base;
    }
    private async generateLocationFraud(pattern: TransactionPattern, user: User): Promise<Partial<Transaction>> {
        const base = await this.generateNormalTransaction(pattern, user);

        const location = this.generateDistantLocation(user);
        base.latitude = location.latitude;
        base.longitude = location.longitude;
        base.ipAddress = this.generateIpAddress(location.latitude, location.longitude);

        return base;
    }

    private async generateDeviceFraud(pattern: TransactionPattern, user: User): Promise<Partial<Transaction>>{
        const base = await this.generateNormalTransaction(pattern, user);
        base.deviceFingerprint = this.generateDeviceFingerprint(user.id, true);

        return base;
    }

    private selectFraudType(): 'HIGH_AMOUNT' | 'VELOCITY' | 'LOCATION' | 'DEVICE' {
        const types = ['HIGH_AMOUNT', 'VELOCITY', 'LOCATION', 'DEVICE'] as const;
        return types[Math.floor(Math.random() * types.length)];
        
    }

    private normalRandom(mean: number, stdDev: number): number {
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 & Math.log(u1) * Math.cos(2 * Math.PI * u2));
        
        return z0 * stdDev + mean;
    }

    private generateTimestamp(pattern: 'NORMAL' | 'NIGHT_OWL' | 'EARLY_BIRD', isFraud: boolean): Date {
        const now = new Date();
        let hour: number;

        if (isFraud){
            hour = Math.random() < 0.7 ? Math.floor(Math.random() * 6) + 1 : Math.floor(Math.random() * 24);
            } else {
                switch(pattern){
                    case 'NIGHT_OWL':
                        hour = Math.floor(Math.random() * 6) + 18;
                        break;
                    case 'EARLY_BIRD' :
                        hour = Math.floor(Math.random() * 6) + 6;
                        break;
                    default:
                        hour = Math.floor(Math.random() * 12) + 8;
                }
            }
        const timestamp = new Date(now);
        timestamp.setHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));

        const daysBack = Math.floor(Math.random() * 30);
        timestamp.setDate(timestamp.getDate() - daysBack);

        return timestamp;
    }

    private generateLocation(user: User, merchant: Merchant, pattern: 'LOCAL' | 'TRAVELER', isFraud: boolean) {
        if (isFraud || pattern == 'TRAVELER'){
            return {
                latitude: merchant.latitude || (40.7128 + (Math.random() - 0.5) * 2),
                longitude: merchant.longitude || (-74.0060 + (Math.random() - 0.5) * 2)
            };
        }
        const latOffset = (Math.random() - 0.5) * 0.1;
        const lonOffset = (Math.random() - 0.5) * 0.1;

        return {
            latitude: (user.homeLatitude || 40.7128) + latOffset,
            longitude: (user.homeLongitude || -74.0060) + lonOffset
        };
    }

    private generateDistantLocation(user: User){
        const latoffSet = (Math.random() - 0.5) * 10;
        const lonOffset = (Math.random() - 0.5) * 10;

        return {
            latitude: (user.homeLatitude || 40.7128) + latoffSet,
            longitude: (user.homeLongitude || -74.0060) + lonOffset
        };
    }

    private generateDeviceFingerprint(userId: string, isNew: boolean): string {
        if (isNew){
            return `device_${uuidv4().slice(0,8)}_${Date.now()}`;
        }

        return `device_${userId.slice(0,8)}_regular`;
    }

    private generateIpAddress(lat: number, lon: number): string{
        const baseIp = Math.floor(Math.abs(lat + lon) * 1000) % 255;
        return `${baseIp}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    }

    private async saveTransaction(transaction: Partial<Transaction>): Promise<Transaction> {
        const query = `
        INSERT INFO (
        id, user_id, merchant_id, amount, currency,
        latitude, longitude, device_fingerprint, ip_address,
        created_at, is_fraud, is_blocked
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
        `;

        const values = [
            transaction.id,
            transaction.userId,
            transaction.merchantId,
            transaction.amount,
            transaction.currency,
            transaction.latitude,
            transaction.longitude,
            transaction.deviceFingerprint,
            transaction.ipAddress,
            transaction.createdAt,
            transaction.isFraud,
            transaction.isBlocked
        ];

        const result = await pool.query(query, values);
        return result.rows[0] as Transaction;
    }

    async generateBatch(count: number, fraudRate: number = 0.05): Promise<Transaction[]> {
        const transactions: Transaction[] = [];
        for(let i = 0; i< count; i++) {
            const forcePattern = Math.random() < fraudRate ? 'FRAUD' : 'NORMAL';
            const transaction = await this.generateTransaction(forcePattern);
            transactions.push(transaction);

            if ((i+1) % 100 == 0){
                logger.info(`Generated ${i+1}/${count} transactions`);
            }
        }

        logger.info(`Generated ${count} transactions with ${Math.round(fraudRate * 100)}% fraud rate`);
        return transactions;
    }
}