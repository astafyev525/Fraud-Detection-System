import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
    level: logLevel,

    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),

        winston.format.errors({ stack: true}),

        winston.format.colorize({ all:true}),

        winston.format.printf(({timestamp, level, message, stack, ... meta}) => {
            let log = `${timestamp} [${level}]: ${message}`;

            if(Object.keys(meta).length > 0) {
                log += `${JSON.stringify(meta)}`;
            }

            if (stack) {
                log += `\n${stack}`;
            }

            return log
        })
    ),

    transports: [
        new winston.transports.Console({
            level: logLevel
        })
    ]
});

if (process.env.NODE_ENV == 'production') {
    logger.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error'
    }));

    logger.add(new winston.transports.File({
        filename: 'logs/combined,log'
    }));
}