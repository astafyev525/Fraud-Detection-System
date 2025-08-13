import { Router } from 'express';
import transactionRoutes from './transactions';
import analyticsRoutes from './analytics';

const router = Router();

router.use('/transactions', transactionRoutes);
router.use('/analytics', analyticsRoutes);

router.get('/', (req, res) => {
    res.json ({
        name: 'Fraud Detection API',
        version: '1.0.0',
        description: 'Real-time fraud detection system for financial transactions',
        status: 'Active',
        endpoints: {
            'POST /api/transactions/score': 'Score for a trnsaction for fraud risk',
            'GET /api/transactions/:id' : 'Get transaction details by ID',
            'GET /api/transactions': 'List recent transactions with pagination',
            'POST /api/transactions/generate': 'Generate test transactions (development)',

            'GET /api/analytics/dashboard': 'Get dashboard analytics and statistics',
            'GET /api/analytics/trends': 'Get fraud trends over time',
            'GET /api/analytics/high-risk' : 'Get high-risk transactions and users',

            'GET /health' : 'System health check',
            'GET /api': 'This API information'
        },
        documentation: {
            swagger: '/api/docs',
            postman: '/api/postman.json'
        },
        rateLimit: {
            windowMs: 900000,
            maxRequests: 100
        },
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
        
    });
});

router.get('/status', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
    });
});

router.get('/metrics', (req, res) => {
    const memoryUsage = process.memoryUsage();

    res.json({
        system: {
            uptime: process.uptime(),
            memory: {
                used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                external: Math.round(memoryUsage.external / 1024 / 1024),
                rss: Math.round(memoryUsage.rss / 1024 / 1024)
            },
        platform: process.platform,
        nodeVersion: process.version
        },
    api: {
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
    }
    });
});

export default router;