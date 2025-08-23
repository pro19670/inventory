// 프로덕션 환경 설정
module.exports = {
    // 서버 설정
    server: {
        port: process.env.PORT || 3001,
        host: '0.0.0.0',
        cors: {
            origin: [
                'https://genspark-ai-developer.github.io',
                'https://smart-inventory-system.netlify.app',
                'https://smart-inventory-system.vercel.app'
            ],
            credentials: true
        }
    },
    
    // 데이터베이스 (현재는 파일 기반)
    database: {
        type: 'file',
        backup: true,
        backupInterval: '0 */6 * * *' // 6시간마다 백업
    },
    
    // CDN 및 스토리지
    storage: {
        type: process.env.USE_S3 === 'true' ? 's3' : 'local',
        s3: {
            bucket: process.env.S3_BUCKET_NAME,
            region: process.env.AWS_REGION,
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
    },
    
    // AI 서비스
    ai: {
        openai: {
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.CHATGPT_MODEL || 'gpt-3.5-turbo',
            enabled: process.env.USE_CHATGPT === 'true'
        }
    },
    
    // 로깅 및 모니터링
    monitoring: {
        enabled: true,
        logLevel: 'info',
        errorReporting: true,
        analytics: {
            enabled: true,
            provider: 'google-analytics'
        }
    },
    
    // 보안 설정
    security: {
        rateLimit: {
            windowMs: 15 * 60 * 1000, // 15분
            max: 100 // 요청 제한
        },
        jwt: {
            secret: process.env.JWT_SECRET || 'fallback-secret',
            expiresIn: '7d'
        }
    },
    
    // 성능 최적화
    performance: {
        compression: true,
        cache: {
            static: '1y',
            api: '5m'
        },
        minify: true
    }
};