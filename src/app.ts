import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './config/logger';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';

const app = express();

app.use(helmet({
    contentSecurityPolicy: false;
}));

app.use(cors({
    origin: process.env.NODE_ENV == 'production' ? false: true,
    credentials: true
}));

app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({extended: true}));

app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.method == 'POST' ? req.body: undefined
    });
    next();
});

app.use('/api', routes);

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.nom_package_version || '1.0.0'
    });
});

app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method
    });
});

app.use(errorHandler);

export default app;