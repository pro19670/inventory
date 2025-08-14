// backend/src/middleware/auth.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class AuthMiddleware {
    constructor() {
        // API 키 초기화
        this.initializeApiKeys();
        
        // 토큰 저장소
        this.sessions = new Map();
        
        // 키 표시 (일부만 보여줌)
        this.displayApiKeys();
    }
    
    initializeApiKeys() {
        // 환경변수에서 키 확인
        const masterFromEnv = process.env.MASTER_API_KEY;
        const readonlyFromEnv = process.env.READONLY_API_KEY;
        
        // 기본값이거나 비어있으면 새로 생성
        const needNewMaster = !masterFromEnv || 
                            masterFromEnv === 'your-secure-master-key-here-change-this' ||
                            masterFromEnv.length < 32;
        
        const needNewReadonly = !readonlyFromEnv || 
                              readonlyFromEnv === 'your-secure-readonly-key-here-change-this' ||
                              readonlyFromEnv.length < 32;
        
        this.apiKeys = {
            master: needNewMaster ? this.generateApiKey() : masterFromEnv,
            readonly: needNewReadonly ? this.generateApiKey() : readonlyFromEnv
        };
        
        // 새 키가 생성되었으면 파일로 저장
        if (needNewMaster || needNewReadonly) {
            this.saveKeysToFile();
        }
    }
    
    generateApiKey() {
        // 더 강력한 키 생성 (64자)
        return crypto.randomBytes(32).toString('hex');
    }
    
    generateToken() {
        return crypto.randomBytes(32).toString('hex');
    }
    
    saveKeysToFile() {
        const keyFilePath = path.join(__dirname, '../../.api-keys.json');
        const envExamplePath = path.join(__dirname, '../../.env.example');
        
        // JSON 파일로 저장 (git ignore에 추가 필요)
        const keysData = {
            generated: new Date().toISOString(),
            keys: {
                master: this.apiKeys.master,
                readonly: this.apiKeys.readonly
            },
            warning: '이 파일을 안전하게 보관하고 절대 공유하지 마세요!'
        };
        
        fs.writeFileSync(keyFilePath, JSON.stringify(keysData, null, 2));
        
        // .env.example 파일 생성/업데이트
        const envExample = `# API Keys (자동 생성된 키를 여기에 복사하세요)
MASTER_API_KEY=${this.apiKeys.master}
READONLY_API_KEY=${this.apiKeys.readonly}

# AWS S3 설정 (선택사항)
USE_S3=false
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=ap-northeast-2
S3_BUCKET=your-bucket-name

# OpenAI API (선택사항)
OPENAI_API_KEY=your-openai-api-key

# 환경 설정
NODE_ENV=development
PORT=3001
`;
        
        fs.writeFileSync(envExamplePath, envExample);
        
        console.log('\n📝 새 API 키가 생성되었습니다!');
        console.log('   파일 위치: .api-keys.json');
        console.log('   .env 파일을 업데이트하세요.\n');
    }
    
    displayApiKeys() {
        // 보안을 위해 일부만 표시
        const maskKey = (key) => {
            if (!key || key.length < 10) return 'INVALID';
            return key.substring(0, 8) + '...' + key.substring(key.length - 4);
        };
        
        console.log('=====================================');
        console.log('🔐 API Keys (일부만 표시)');
        console.log('=====================================');
        console.log('Master Key:', maskKey(this.apiKeys.master));
        console.log('ReadOnly Key:', maskKey(this.apiKeys.readonly));
        console.log('=====================================');
        console.log('전체 키는 .api-keys.json 파일 확인');
        console.log('=====================================\n');
    }
    
    // API 키 검증
    validateApiKey(apiKey) {
        if (!apiKey) return { valid: false };
        
        if (apiKey === this.apiKeys.master) {
            return { valid: true, role: 'admin' };
        }
        if (apiKey === this.apiKeys.readonly) {
            return { valid: true, role: 'readonly' };
        }
        return { valid: false };
    }
    
    // 토큰 생성 (로그인 시)
    createSession(apiKey) {
        const validation = this.validateApiKey(apiKey);
        if (!validation.valid) return null;
        
        const token = this.generateToken();
        const session = {
            token,
            role: validation.role,
            createdAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24시간
            lastActivity: Date.now()
        };
        
        this.sessions.set(token, session);
        
        // 오래된 세션 정리
        this.cleanupSessions();
        
        return session;
    }
    
    // 토큰 검증
    validateToken(token) {
        const session = this.sessions.get(token);
        if (!session) return { valid: false };
        
        if (Date.now() > session.expiresAt) {
            this.sessions.delete(token);
            return { valid: false, reason: 'expired' };
        }
        
        // 활동 시간 업데이트
        session.lastActivity = Date.now();
        
        return { valid: true, role: session.role };
    }
    
    // 오래된 세션 정리
    cleanupSessions() {
        const now = Date.now();
        for (const [token, session] of this.sessions.entries()) {
            if (now > session.expiresAt) {
                this.sessions.delete(token);
            }
        }
    }
    
    // 미들웨어 함수
    authenticate(req, res, requiredRole = null) {
        // 헤더에서 인증 정보 추출
        const apiKey = req.headers['x-api-key'];
        const token = req.headers['authorization']?.replace('Bearer ', '');
        
        let validation;
        
        // 토큰 우선, 없으면 API 키 확인
        if (token) {
            validation = this.validateToken(token);
        } else if (apiKey) {
            validation = this.validateApiKey(apiKey);
        } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Authentication required',
                message: 'Please provide x-api-key or authorization token'
            }));
            return false;
        }
        
        if (!validation.valid) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Invalid credentials',
                reason: validation.reason
            }));
            return false;
        }
        
        // 역할 확인
        if (requiredRole && validation.role !== 'admin' && validation.role !== requiredRole) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Insufficient permissions',
                required: requiredRole,
                current: validation.role
            }));
            return false;
        }
        
        // 요청에 사용자 정보 추가
        req.user = { role: validation.role };
        return true;
    }
    
    // API 키 재생성 (관리자용)
    regenerateApiKeys(type = 'both') {
        const newKeys = {};
        
        if (type === 'master' || type === 'both') {
            this.apiKeys.master = this.generateApiKey();
            newKeys.master = this.apiKeys.master;
        }
        
        if (type === 'readonly' || type === 'both') {
            this.apiKeys.readonly = this.generateApiKey();
            newKeys.readonly = this.apiKeys.readonly;
        }
        
        this.saveKeysToFile();
        
        // 모든 세션 무효화
        this.sessions.clear();
        
        return newKeys;
    }
}

module.exports = AuthMiddleware;
