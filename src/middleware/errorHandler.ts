import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export interface AppError extends Error{
    statusCode?: number;
    status?: string;
    isOperational?: boolean;
}

export const errorHandler = (
    err: AppError,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const statusCode = err.statusCode || 500;
    const status = err.status || 'error';

    logger.error('API error occured:', {
        message: err.message,
        stack: err.stack,
        statusCode,
        path: req.path,
        method: req.method,
        ip: req.ip,
        body: req.body,
        query: req.query
    });

    const errorResponse: any = {
        status,
        message: err.message || 'Internal Server Error',
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method
    };

    if(process.env.NODE_ENV == 'development'){
        errorResponse.stack = err.stack;
    }

    res.status(statusCode).json(errorResponse);
};


export class ValidationError extends Error {
    statusCode = 400;
    status = 'fail';
    isOperational = true;

    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class NotFoundError extends Error {
    statusCode = 404;
    status = 'fail';
    isOperational = true;

    constructor(message: string) {
        super(message);
        this.name = 'NotFoundError';
    }
}

export class DatabaseError extends Error {
    statusCode = 500;
    status = 'error';
    isOperational = true;

    constructor(message: string) {
        super(message);
        this.name = 'DatabaseError';
    }
}


export class FraudDetectionError extends Error {
    statusCode = 422;
    status = 'fail';
    isOperational = true;

    constructor(message: string){
        super(message);
        this.name = 'FraudDetectionError';
    }
}

export class RateLimitError extends Error {
    statusCode = 429;
    status = 'fail';
    isOperational = true;

    constructor(message: string) {
        super(message);
        this.name = 'RateLimitError';
    }
}

export const asyncHandler = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    }
}