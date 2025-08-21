export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
    timestamp: string;
}

export interface PaginationParams {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
    pagination: PaginationParams;
}

export interface ErrorResponse {
    success: false;
    error: string;
    message: string;
    timestamp: string;
    path?: string;
    method?: string;
    stack?: string;
}

export interface HealthCheckResponse {
    status: 'OK' | 'ERROR';
    timestamp: string;
    uptime: number;
    memory: NodeJS.MemoryUsage;
    version: string;
}

export interface MetricsResponse {
    system: {
        uptime: number;
        memory: {
            used: number;
            total: number;
            external: number;
            rss: number;
        };
        platform: string;
        nodeVersion: string;
    };
    api: {
        environment: string;
        timestamp: string;
    };
}