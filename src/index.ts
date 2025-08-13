import app from './app';
import { logger } from './config/logger';

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    logger.info('Fraud Detection API running on port ${PORT}');
    logger.info('Health check : http://localhose${PORT}/health');
    logger.info('API Base URL: http://localhost${PORT}/api');
});

process.on('SIGTERM', () => {
    logger.info('SIGTERM signal recieved: closing HTTP server');
    server.close(() => {
        logger.info('HTTP server closed')
    });
});

process.on('SIGNIT', () =>{
    logger.info('SIGNIT signal recieved: closing HTTP server');
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0)
    });
});
