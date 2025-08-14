// backend/src/utils/errorHandler.js
const fs = require('fs');
const path = require('path');

class ErrorHandler {
    constructor() {
        this.logDir = path.join(__dirname, '../../logs');
        this.ensureLogDirectory();
    }
    
    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    
    // 에러 로깅
    logError(error, context = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            error: {
                message: error.message,
                stack: error.stack,
                name: error.name
            },
            context,
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                memory: process.memoryUsage()
            }
        };
        
        // 콘솔 출력
        console.error(`[${timestamp}] Error:`, error.message);
        if (context.endpoint) {
            console.error(`  Endpoint: ${context.endpoint}`);
        }
        
        // 파일 저장
        const logFile = path.join(this.logDir, `error-${new Date().toISOString().split('T')[0]}.log`);
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
        
        // 심각한 에러는 별도 파일에도 저장
        if (error.critical) {
            const criticalFile = path.join(this.logDir, 'critical.log');
            fs.appendFileSync(criticalFile, JSON.stringify(logEntry) + '\n');
        }
    }
    
    // HTTP 응답 처리
    handleHttpError(res, error, statusCode = 500) {
        const isDevelopment = process.env.NODE_ENV === 'development';
        
        const response = {
            success: false,
            error: {
                message: isDevelopment ? error.message : 'Internal server error',
                code: error.code || 'INTERNAL_ERROR'
            }
        };
        
        if (isDevelopment) {
            response.error.stack = error.stack;
        }
        
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
    }
    
    // 비동기 함수 래퍼
    asyncWrapper(fn, context) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                this.logError(error, context);
                throw error;
            }
        };
    }
    
    // 검증 에러
    validationError(message, field = null) {
        const error = new Error(message);
        error.name = 'ValidationError';
        error.code = 'VALIDATION_ERROR';
        error.field = field;
        return error;
    }
    
    // 인증 에러
    authError(message = 'Authentication failed') {
        const error = new Error(message);
        error.name = 'AuthenticationError';
        error.code = 'AUTH_ERROR';
        return error;
    }
    
    // 권한 에러
    permissionError(message = 'Insufficient permissions') {
        const error = new Error(message);
        error.name = 'PermissionError';
        error.code = 'PERMISSION_ERROR';
        return error;
    }
}

module.exports = ErrorHandler;
