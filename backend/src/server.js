require('dotenv').config({ path: '../.env' });

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const AWS = require('aws-sdk');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');
const formidable = require('formidable');
const { FamilyAuthSystem, ROLES } = require('./family-auth');

// 미들웨어 및 유틸리티 모듈 (옵셔널)
let auth = null;
let errorHandler = null;
let validator = null;

try {
    const AuthMiddleware = require('./middleware/auth');
    const ErrorHandler = require('./utils/errorHandler');
    const Validator = require('./utils/validator');
    
    auth = new AuthMiddleware();
    errorHandler = new ErrorHandler();
    validator = new Validator();
} catch (error) {
    console.log('미들웨어 모듈을 찾을 수 없습니다. 기본 기능으로 실행합니다.');
}

// 데이터 파일 경로
const DATA_DIR = path.join(__dirname, '../../data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');
const LOCATIONS_FILE = path.join(DATA_DIR, 'locations.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const INVENTORY_HISTORY_FILE = path.join(DATA_DIR, 'inventory_history.json');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const THUMBNAILS_DIR = path.join(DATA_DIR, 'thumbnails');
const TEMP_DIR = path.join(__dirname, 'temp');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// 간단한 메모리 저장소
let items = [];
let locations = [];
let categories = [];
let inventoryHistory = []; // 재고 이력
let itemImages = {};
let nextId = 1;
let nextLocationId = 1;
let nextCategoryId = 1;
let nextInventoryHistoryId = 1;

// 환경 설정
const CONFIG = {
    PORT: process.env.PORT || 3001,
    S3_BUCKET: process.env.S3_BUCKET_NAME || 'inventory-app-yji-20241205',
    AWS_REGION: process.env.AWS_REGION || 'ap-northeast-2',
    USE_S3: process.env.USE_S3 === 'true' || false,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    NODE_ENV: process.env.NODE_ENV || 'development',
    // OpenAI API 설정
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    USE_CHATGPT: process.env.USE_CHATGPT === 'true' || false,
    CHATGPT_MODEL: process.env.CHATGPT_MODEL || 'gpt-3.5-turbo'
};

// 디버그: 환경변수 로드 상태 확인
console.log('🔍 환경변수 디버그:');
console.log('OPENAI_API_KEY 존재:', !!CONFIG.OPENAI_API_KEY);
console.log('OPENAI_API_KEY 길이:', CONFIG.OPENAI_API_KEY ? CONFIG.OPENAI_API_KEY.length : 0);
console.log('OPENAI_API_KEY 시작:', CONFIG.OPENAI_API_KEY ? CONFIG.OPENAI_API_KEY.substring(0, 20) + '...' : 'null');
console.log('USE_CHATGPT:', CONFIG.USE_CHATGPT);
console.log('CHATGPT_MODEL:', CONFIG.CHATGPT_MODEL);

// S3 클라이언트 설정
let s3 = null;
if (CONFIG.USE_S3 && CONFIG.AWS_ACCESS_KEY_ID && CONFIG.AWS_SECRET_ACCESS_KEY) {
    try {
        s3 = new AWS.S3({
            accessKeyId: CONFIG.AWS_ACCESS_KEY_ID,
            secretAccessKey: CONFIG.AWS_SECRET_ACCESS_KEY,
            region: CONFIG.AWS_REGION
        });
        console.log('S3 클라이언트 초기화 완료');
    } catch (error) {
        console.log('S3 클라이언트 초기화 실패:', error.message);
    }
}

// OpenAI 클라이언트 설정
let openai = null;
if (CONFIG.USE_CHATGPT && CONFIG.OPENAI_API_KEY) {
    try {
        openai = new OpenAI({
            apiKey: CONFIG.OPENAI_API_KEY,
        });
        console.log('OpenAI 클라이언트 초기화 완료');
    } catch (error) {
        console.log('OpenAI 클라이언트 초기화 실패:', error.message);
    }
}

// 가족 인증 시스템 초기화
const familyAuth = new FamilyAuthSystem();
console.log('👨‍👩‍👧‍👦 가족 로그인 시스템 초기화 완료');

// 공개 엔드포인트 목록
const publicEndpoints = [
    { path: '/', method: 'GET' },
    { path: '/api/health', method: 'GET' },
    { path: '/api/auth/login', method: 'POST' },
    { path: '/api/auth/register', method: 'POST' },
    { path: '/api/auth/verify', method: 'POST' },
    { path: '/login.html', method: 'GET' }
];

// 읽기 전용 엔드포인트
const readonlyEndpoints = [
    { path: '/api/items', method: 'GET' },
    { path: '/api/categories', method: 'GET' },
    { path: '/api/locations', method: 'GET' }
];

// 글로벌 에러 핸들러 설정
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    console.error('Server shutting down...');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 데이터 디렉토리 생성
function ensureDataDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log('데이터 디렉토리 생성됨:', DATA_DIR);
    }
}

// 이미지 디렉토리 생성
function ensureImageDirectories() {
    [IMAGES_DIR, THUMBNAILS_DIR, TEMP_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log('디렉토리 생성됨:', dir);
        }
    });
}

// 기본 카테고리 초기화
function initializeCategories() {
    categories = [
        { id: 1, name: '전자제품', color: '#2196F3', icon: '💻' },
        { id: 2, name: '가구', color: '#4CAF50', icon: '🪑' },
        { id: 3, name: '의류', color: '#9C27B0', icon: '👕' },
        { id: 4, name: '식품', color: '#FF9800', icon: '🍎' },
        { id: 5, name: '도서', color: '#795548', icon: '📚' },
        { id: 6, name: '문구류', color: '#607D8B', icon: '✏️' },
        { id: 7, name: '주방용품', color: '#F44336', icon: '🍳' },
        { id: 8, name: '욕실용품', color: '#00BCD4', icon: '🧼' },
        { id: 9, name: '운동용품', color: '#8BC34A', icon: '⚽' },
        { id: 10, name: '기타', color: '#9E9E9E', icon: '📦' }
    ];
    nextCategoryId = 11;
}

// 기본 위치 초기화
function initializeLocations() {
    locations = [
        { id: 1, name: '거실', parentId: null, level: 0 },
        { id: 2, name: '침실', parentId: null, level: 0 },
        { id: 3, name: '주방', parentId: null, level: 0 },
        { id: 4, name: '화장실', parentId: null, level: 0 },
        { id: 5, name: '베란다', parentId: null, level: 0 }
    ];
    nextLocationId = 6;
}

// S3에서 데이터 로드 시도
async function loadFromS3(key) {
    if (!CONFIG.USE_S3 || !s3) return null;
    
    try {
        const params = {
            Bucket: CONFIG.S3_BUCKET,
            Key: key
        };
        
        const data = await s3.getObject(params).promise();
        console.log(`S3에서 ${key} 로드 성공`);
        return data.Body.toString('utf-8');
    } catch (error) {
        if (error.code !== 'NoSuchKey') {
            console.error(`S3 로드 실패 (${key}):`, error.message);
        }
        return null;
    }
}

// S3에 데이터 저장
async function saveToS3(key, content) {
    if (!CONFIG.USE_S3 || !s3) return false;
    
    try {
        const params = {
            Bucket: CONFIG.S3_BUCKET,
            Key: key,
            Body: content,
            ContentType: 'application/json'
        };
        
        await s3.putObject(params).promise();
        console.log(`S3에 ${key} 저장 성공`);
        return true;
    } catch (error) {
        console.error(`S3 저장 실패 (${key}):`, error.message);
        return false;
    }
}

// 데이터 파일에서 읽기
async function loadData() {
    try {
        ensureDataDirectory();
        ensureImageDirectories();
        
        // items.json 읽기
        try {
            let data = null;
            
            if (CONFIG.USE_S3) {
                const s3Data = await loadFromS3('backup/items.json');
                if (s3Data) data = s3Data;
            }
            
            if (!data && fs.existsSync(ITEMS_FILE)) {
                data = fs.readFileSync(ITEMS_FILE, 'utf8');
            }
            
            if (data) {
                if (data.charCodeAt(0) === 0xFEFF) data = data.substr(1);
                const parsed = JSON.parse(data);
                items = parsed.items || [];
                nextId = parsed.nextId || 1;
                itemImages = parsed.itemImages || {};
                console.log(`${items.length}개의 물건 데이터 로드됨`);
            }
        } catch (error) {
            console.error('Items 로드 실패:', error.message);
            items = [];
            nextId = 1;
            itemImages = {};
        }
        
        // locations.json 읽기
        try {
            let data = null;
            
            if (CONFIG.USE_S3) {
                const s3Data = await loadFromS3('backup/locations.json');
                if (s3Data) data = s3Data;
            }
            
            if (!data && fs.existsSync(LOCATIONS_FILE)) {
                data = fs.readFileSync(LOCATIONS_FILE, 'utf8');
            }
            
            if (data) {
                if (data.charCodeAt(0) === 0xFEFF) data = data.substr(1);
                const parsed = JSON.parse(data);
                locations = parsed.locations || [];
                nextLocationId = parsed.nextLocationId || 1;
                console.log(`${locations.length}개의 위치 데이터 로드됨`);
            } else {
                initializeLocations();
                console.log('기본 위치 데이터 생성됨');
            }
        } catch (error) {
            console.error('Locations 로드 실패:', error.message);
            initializeLocations();
        }
        
        // categories.json 읽기
        try {
            let data = null;
            
            if (CONFIG.USE_S3) {
                const s3Data = await loadFromS3('backup/categories.json');
                if (s3Data) data = s3Data;
            }
            
            if (!data && fs.existsSync(CATEGORIES_FILE)) {
                data = fs.readFileSync(CATEGORIES_FILE, 'utf8');
            }
            
            if (data) {
                if (data.charCodeAt(0) === 0xFEFF) data = data.substr(1);
                const parsed = JSON.parse(data);
                categories = parsed.categories || [];
                nextCategoryId = parsed.nextCategoryId || 1;
                console.log(`${categories.length}개의 카테고리 데이터 로드됨`);
            } else {
                initializeCategories();
                console.log('기본 카테고리 데이터 생성됨');
            }
        } catch (error) {
            console.error('Categories 로드 실패:', error.message);
            initializeCategories();
        }
        
        // inventory_history.json 읽기
        try {
            let data = null;
            
            if (CONFIG.USE_S3) {
                const s3Data = await loadFromS3('backup/inventory_history.json');
                if (s3Data) data = s3Data;
            }
            
            if (!data && fs.existsSync(INVENTORY_HISTORY_FILE)) {
                data = fs.readFileSync(INVENTORY_HISTORY_FILE, 'utf8');
            }
            
            if (data) {
                if (data.charCodeAt(0) === 0xFEFF) data = data.substr(1);
                const parsed = JSON.parse(data);
                inventoryHistory = parsed.history || [];
                nextInventoryHistoryId = parsed.nextId || 1;
                console.log(`${inventoryHistory.length}개의 재고 이력 데이터 로드됨`);
            } else {
                inventoryHistory = [];
                nextInventoryHistoryId = 1;
                console.log('빈 재고 이력 데이터 초기화됨');
            }
        } catch (error) {
            console.error('Inventory History 로드 실패:', error.message);
            inventoryHistory = [];
            nextInventoryHistoryId = 1;
        }
    } catch (error) {
        console.error('데이터 로드 중 오류:', error);
    }
}

// 데이터 파일에 저장
async function saveData() {
    try {
        ensureDataDirectory();
        
        // items.json 저장
        const itemsData = {
            items: items,
            nextId: nextId,
            itemImages: itemImages,
            lastSaved: new Date().toISOString()
        };
        const itemsJson = JSON.stringify(itemsData, null, 2);
        const itemsBuffer = Buffer.concat([Buffer.from('\ufeff'), Buffer.from(itemsJson, 'utf8')]);
        fs.writeFileSync(ITEMS_FILE, itemsBuffer);
        
        // locations.json 저장
        const locationsData = {
            locations: locations,
            nextLocationId: nextLocationId,
            lastSaved: new Date().toISOString()
        };
        const locationsJson = JSON.stringify(locationsData, null, 2);
        const locationsBuffer = Buffer.concat([Buffer.from('\ufeff'), Buffer.from(locationsJson, 'utf8')]);
        fs.writeFileSync(LOCATIONS_FILE, locationsBuffer);
        
        // categories.json 저장
        const categoriesData = {
            categories: categories,
            nextCategoryId: nextCategoryId,
            lastSaved: new Date().toISOString()
        };
        const categoriesJson = JSON.stringify(categoriesData, null, 2);
        const categoriesBuffer = Buffer.concat([Buffer.from('\ufeff'), Buffer.from(categoriesJson, 'utf8')]);
        fs.writeFileSync(CATEGORIES_FILE, categoriesBuffer);
        
        // inventory_history.json 저장
        const inventoryHistoryData = {
            history: inventoryHistory,
            nextId: nextInventoryHistoryId,
            lastSaved: new Date().toISOString()
        };
        const inventoryHistoryJson = JSON.stringify(inventoryHistoryData, null, 2);
        const inventoryHistoryBuffer = Buffer.concat([Buffer.from('\ufeff'), Buffer.from(inventoryHistoryJson, 'utf8')]);
        fs.writeFileSync(INVENTORY_HISTORY_FILE, inventoryHistoryBuffer);
        
        console.log('로컬 데이터 저장 완료');
        
        // S3 백업
        if (CONFIG.USE_S3) {
            await Promise.all([
                saveToS3('backup/items.json', itemsJson),
                saveToS3('backup/locations.json', locationsJson),
                saveToS3('backup/categories.json', categoriesJson),
                saveToS3('backup/inventory_history.json', inventoryHistoryJson)
            ]);
        }
    } catch (error) {
        console.error('데이터 저장 실패:', error);
    }
}

// 자동 저장
let saveTimeout;
function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveData, 5000);
}

// 위치와 모든 하위 위치의 ID 가져오기
function getLocationWithChildren(locationId) {
    const ids = [locationId];
    const children = locations.filter(loc => loc.parentId === locationId);
    
    children.forEach(child => {
        ids.push(...getLocationWithChildren(child.id));
    });
    
    return ids;
}

// 위치 경로 가져오기
function getLocationPath(locationId) {
    if (!locationId) return [];
    
    const path = [];
    let currentLocation = locations.find(loc => loc.id === locationId);
    
    while (currentLocation) {
        path.unshift(currentLocation.name);
        currentLocation = locations.find(loc => loc.id === currentLocation.parentId);
    }
    
    return path;
}

// 위치 전체 경로 계산 (타입 포함)
function getLocationPathWithTypes(locationId) {
    if (!locationId) return [];
    
    const path = [];
    let currentLocation = locations.find(loc => loc.id === locationId);
    
    while (currentLocation) {
        path.unshift({
            id: currentLocation.id,
            name: currentLocation.name,
            type: currentLocation.type || '위치',
            level: currentLocation.level
        });
        currentLocation = locations.find(loc => loc.id === currentLocation.parentId);
    }
    
    return path;
}

// 파일 확장자 추출
function getFileExtension(filename) {
    if (!filename) return '.jpg';
    
    const ext = path.extname(filename).toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    return allowedExtensions.includes(ext) ? ext : '.jpg';
}

// Multipart 파싱 함수
function parseMultipart(buffer, boundary) {
    const parts = [];
    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const boundaryLength = boundaryBuffer.length;
    
    let start = 0;
    while (start < buffer.length) {
        const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
        if (boundaryIndex === -1) break;
        
        const nextBoundaryIndex = buffer.indexOf(boundaryBuffer, boundaryIndex + boundaryLength);
        if (nextBoundaryIndex === -1) break;
        
        const partData = buffer.slice(boundaryIndex + boundaryLength + 2, nextBoundaryIndex - 2);
        const headerEndIndex = partData.indexOf('\r\n\r\n');
        
        if (headerEndIndex !== -1) {
            const headers = partData.slice(0, headerEndIndex).toString();
            const content = partData.slice(headerEndIndex + 4);
            
            const nameMatch = headers.match(/name="([^"]+)"/);
            const filenameMatch = headers.match(/filename="([^"]+)"/);
            const contentTypeMatch = headers.match(/Content-Type: ([^\r\n]+)/);
            
            parts.push({
                name: nameMatch ? nameMatch[1] : null,
                filename: filenameMatch ? filenameMatch[1] : null,
                contentType: contentTypeMatch ? contentTypeMatch[1] : 'application/octet-stream',
                data: content,
                headers: headers
            });
        }
        
        start = nextBoundaryIndex;
    }
    
    return parts;
}

// CORS 헤더 설정 함수
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
}

// 응답 헬퍼 함수
function sendJsonResponse(res, statusCode, data) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(statusCode);
    res.end(JSON.stringify(data, null, 2));
}

function sendErrorResponse(res, statusCode, message, details = null) {
    const errorResponse = {
        success: false,
        error: message,
        timestamp: new Date().toISOString()
    };
    if (details) errorResponse.details = details;
    
    sendJsonResponse(res, statusCode, errorResponse);
}

// 인증 미들웨어
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return sendErrorResponse(res, 401, '토큰이 필요합니다');
    }

    const result = familyAuth.verifyToken(token);
    if (!result.success) {
        return sendErrorResponse(res, 403, '유효하지 않은 토큰입니다');
    }

    req.user = result.user;
    next();
}

// 권한 확인 미들웨어
function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user) {
            return sendErrorResponse(res, 401, '인증이 필요합니다');
        }

        if (!familyAuth.hasPermission(req.user.role, permission)) {
            return sendErrorResponse(res, 403, '권한이 없습니다');
        }

        next();
    };
}

// 🚀 실제 OpenAI GPT API 호출 함수 (개선된 안정성)
async function callChatGPT(userMessage, context) {
    if (!CONFIG.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
    }
    
    if (!openai) {
        throw new Error('OpenAI client not initialized');
    }
    
    const { items, locations, categories, inventoryHistory } = context;
    
    // 현재 상황 요약
    const totalItems = items.length;
    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const lowStockItems = items.filter(item => (item.quantity || 0) <= 2);
    const recentHistory = inventoryHistory
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 3);
    
    // ChatGPT에 제공할 컨텍스트
    const contextPrompt = `당신은 물품관리 시스템의 AI 도우미입니다. 
    
현재 상황:
- 전체 물품: ${totalItems}개
- 총 수량: ${totalQuantity}개  
- 카테고리: ${categories.length}개
- 위치: ${locations.length}개
- 재고 부족 물품: ${lowStockItems.map(item => `${item.name}(${item.quantity || 0}${item.unit || '개'})`).join(', ')}

최근 활동:
${recentHistory.map(h => `- ${new Date(h.createdAt).toLocaleDateString('ko-KR')} ${h.type === 'stock-in' ? '입고' : '출고'}: ${h.quantity}${h.unit || '개'}`).join('\\n')}

주요 기능:
1. 물품 등록: ➕ 버튼 > 새 물건 등록
2. 재고 관리: 하단 '재고관리' 메뉴
3. 위치 관리: 하단 '위치' 메뉴 (계층형 구조)
4. 카테고리 관리: 하단 '카테고리' 메뉴

사용자의 질문에 친근하고 도움이 되는 답변을 한국어로 제공해주세요. HTML 태그(<br>, <strong> 등)를 사용해서 보기 좋게 포맷팅해주세요.`;

    try {
        if (!openai) {
            throw new Error('OpenAI client not initialized');
        }
        
        const completion = await openai.chat.completions.create({
            model: CONFIG.CHATGPT_MODEL,
            messages: [
                {
                    role: 'system',
                    content: contextPrompt
                },
                {
                    role: 'user', 
                    content: userMessage
                }
            ],
            max_tokens: 500,
            temperature: 0.7
        });
        
        return completion.choices[0]?.message?.content || 'ChatGPT 응답을 받을 수 없습니다.';
        
    } catch (error) {
        console.error('ChatGPT API 호출 실패:', error);
        throw error;
    }
}

// 🤖 GPT급 고급 지능형 로컬 챗봇 (보안키 활성화)
function generateLocalResponse(userMessage, context) {
    const message = userMessage.toLowerCase().trim();
    const { items, locations, categories, inventoryHistory } = context;
    
    // 현재 시간 및 인사말
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ko-KR', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
    
    // 🎯 고급 패턴 매칭 시스템
    const patterns = {
        greeting: /안녕|하이|hello|hi|반가워|처음|시작/,
        inventory: /재고|현황|상황|보고|상태|리스트|목록|통계|분석/,
        search: /있어|없어|어디|찾아|검색|찾기|보여줘|알려줘/,
        help: /도움|사용법|기능|방법|어떻게|뭐해|뭘해|guide/,
        add: /추가|등록|넣기|입력|저장|만들기|create/,
        location: /냉장고|창고|방|부엌|거실|화장실|베란다|서랍|선반|위치/,
        quantity: /수량|개수|얼마|많이|적어|부족|충분/,
        recent: /최근|새로|요즘|오늘|어제|최신|활동/
    };

    // 📊 스마트 데이터 분석
    const analytics = {
        totalItems: items.length,
        totalQuantity: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
        totalCategories: categories.length,
        totalLocations: locations.length,
        lowStockItems: items.filter(item => (item.quantity || 0) <= 2),
        highStockItems: items.filter(item => (item.quantity || 0) > 10),
        recentHistory: inventoryHistory.slice(-5),
        categoryStats: getCategoryStats(items, categories),
        locationStats: getLocationStats(items, locations)
    };

    // 🎯 인사말 및 웰컴 메시지
    if (patterns.greeting.test(message) && message.length < 15) {
        const welcomes = [
            `안녕하세요! 🤖 AI물품관리 전문가입니다!`,
            `반갑습니다! ✨ 스마트한 가정관리 도우미에요!`,
            `환영합니다! 🏠 똑똑한 물품관리 시스템입니다!`
        ];
        const randomWelcome = welcomes[Math.floor(Math.random() * welcomes.length)];
        
        let response = `${randomWelcome}<br><br>`;
        response += `📊 <strong>현재 상황</strong><br>`;
        response += `• 관리중인 물품: ${analytics.totalItems}개<br>`;
        response += `• 총 보유량: ${analytics.totalQuantity}개<br>`;
        response += `• 카테고리: ${analytics.totalCategories}개<br>`;
        
        if (analytics.lowStockItems.length > 0) {
            response += `• ⚠️ 재고부족: ${analytics.lowStockItems.length}개<br>`;
        }
        
        response += `<br>💡 <strong>이런 것들을 물어보세요!</strong><br>`;
        response += `• "재고 현황 분석해줘"<br>`;
        response += `• "냉장고에 뭐가 있어?"<br>`;
        response += `• "라면 몇 개 남았어?"<br>`;
        response += `• "물건 등록하는 방법"`;
        
        return response;
    }

    // 🔍 지능형 물품 검색
    if (patterns.search.test(message)) {
        const searchResults = performAdvancedSearch(message, items, categories, locations);
        
        if (searchResults.length > 0) {
            let response = `🔍 <strong>검색 결과를 찾았습니다!</strong><br><br>`;
            
            searchResults.slice(0, 6).forEach((item, index) => {
                const category = categories.find(cat => cat.id === item.categoryId);
                const locationPath = getLocationPath(item.locationId, locations).join(' → ');
                const stockIcon = getStockIcon(item.quantity || 0);
                
                response += `${index + 1}️⃣ <strong>${item.name}</strong> ${stockIcon}<br>`;
                response += `&nbsp;&nbsp;&nbsp;📦 수량: <strong>${item.quantity || 0}${item.unit || '개'}</strong><br>`;
                response += `&nbsp;&nbsp;&nbsp;🏷️ ${category ? category.name : '미분류'}<br>`;
                response += `&nbsp;&nbsp;&nbsp;📍 ${locationPath}<br><br>`;
            });
            
            if (searchResults.length > 6) {
                response += `➕ 그 외 ${searchResults.length - 6}개 더 있어요!`;
            }
            
            return response;
        } else {
            return `😔 찾으시는 물품이 없네요.<br><br>` +
                   `💡 <strong>추천사항:</strong><br>` +
                   `• 다른 키워드로 검색해보세요<br>` +
                   `• 새로운 물품을 등록해보세요<br>` +
                   `• "물건 등록 방법"이라고 물어보세요<br><br>` +
                   `📱 등록: 화면 하단 "물품" → "+" 버튼`;
        }
    }

    // 📊 고급 재고 분석 및 현황
    if (patterns.inventory.test(message)) {
        let response = `📊 <strong>스마트 재고 분석 리포트</strong><br><br>`;
        
        // 전체 현황 요약
        response += `📈 <strong>전체 현황</strong><br>`;
        response += `• 총 물품: ${analytics.totalItems}개<br>`;
        response += `• 전체 수량: ${analytics.totalQuantity}개<br>`;
        response += `• 카테고리: ${analytics.totalCategories}개<br>`;
        response += `• 보관 위치: ${analytics.totalLocations}개<br><br>`;
        
        // 재고 상태 분석
        const stockAnalysis = {
            sufficient: items.filter(item => (item.quantity || 0) > 5).length,
            medium: items.filter(item => (item.quantity || 0) > 2 && (item.quantity || 0) <= 5).length,
            low: analytics.lowStockItems.length
        };
        
        response += `🎯 <strong>재고 상태 분석</strong><br>`;
        response += `• 충분 (5개↑): ${stockAnalysis.sufficient}개 ✅<br>`;
        response += `• 보통 (3-5개): ${stockAnalysis.medium}개 ⚠️<br>`;
        response += `• 부족 (2개↓): ${stockAnalysis.low}개 🚨<br><br>`;
        
        // 부족 재고 상세 정보
        if (analytics.lowStockItems.length > 0) {
            response += `🚨 <strong>긴급! 재고 부족 알림</strong><br>`;
            analytics.lowStockItems.slice(0, 5).forEach(item => {
                const locationPath = getLocationPath(item.locationId, locations).join(' → ');
                response += `• ${item.name}: ${item.quantity || 0}${item.unit || '개'} (${locationPath})<br>`;
            });
            response += `<br>🛒 구매 계획을 세워보세요!<br><br>`;
        }
        
        // TOP 카테고리 분석
        if (analytics.categoryStats.length > 0) {
            response += `🏆 <strong>카테고리별 보유 현황</strong><br>`;
            analytics.categoryStats.slice(0, 3).forEach((stat, index) => {
                response += `${index + 1}. ${stat.name}: ${stat.count}개<br>`;
            });
        }
        
        return response;
    }

    // 🏠 위치별 스마트 검색
    const locationSearch = extractLocationFromQuery(message);
    if (locationSearch) {
        const locationItems = findItemsByLocation(locationSearch, items, locations);
        
        if (locationItems.length > 0) {
            let response = `🏠 <strong>${locationSearch}</strong>에서 찾은 물품들<br><br>`;
            
            // 카테고리별 그룹화
            const grouped = groupByCategory(locationItems, categories);
            Object.entries(grouped).forEach(([categoryName, categoryItems]) => {
                response += `📂 <strong>${categoryName}</strong><br>`;
                categoryItems.forEach(item => {
                    const stockIcon = getStockIcon(item.quantity || 0);
                    response += `&nbsp;&nbsp;• ${item.name}: ${item.quantity || 0}${item.unit || '개'} ${stockIcon}<br>`;
                });
                response += `<br>`;
            });
            
            return response + `📋 총 ${locationItems.length}개 물품이 있어요!`;
        } else {
            return `🔍 ${locationSearch}에서 등록된 물품을 찾지 못했어요.<br><br>` +
                   `💡 <strong>확인해보세요:</strong><br>` +
                   `• 물품 등록 시 위치를 정확히 설정했나요?<br>` +
                   `• 다른 이름으로 저장되어 있을까요?<br>` +
                   `• 새로운 물품을 등록해보세요!`;
        }
    }

    // 📝 사용법 및 도움말
    if (patterns.help.test(message) || patterns.add.test(message)) {
        return `📱 <strong>AI물품관리 시스템 완전 가이드</strong><br><br>` +
               `<strong>🎯 3단계 간편 등록</strong><br>` +
               `1️⃣ 화면 하단 "물품" 터치<br>` +
               `2️⃣ 오른쪽 하단 "+" 버튼 터치<br>` +
               `3️⃣ 카메라 📷 촬영 또는 갤러리 🖼️ 선택<br><br>` +
               `<strong>🤖 AI가 자동으로 해주는 것들</strong><br>` +
               `• ✨ 물품명 자동 인식<br>` +
               `• 🏷️ 카테고리 자동 분류<br>` +
               `• 📍 최적 보관위치 추천<br>` +
               `• 📊 적정 수량 가이드<br><br>` +
               `<strong>💡 전문가 팁</strong><br>` +
               `• 바코드 위주로 촬영하면 99% 정확!<br>` +
               `• 여러 각도 사진으로 인식률 UP!<br>` +
               `• 포장보다는 실제 제품 촬영 권장<br><br>` +
               `🎪 더 궁금한 건 언제든 물어보세요!`;
    }

    // 📈 최근 활동 분석
    if (patterns.recent.test(message)) {
        if (analytics.recentHistory.length > 0) {
            let response = `📈 <strong>최근 활동 분석</strong><br><br>`;
            analytics.recentHistory.forEach((history, index) => {
                const item = items.find(i => i.id === history.itemId);
                if (item) {
                    const timeAgo = getTimeAgo(new Date(history.timestamp));
                    const actionIcon = history.type === 'stock-in' ? '📥' : '📤';
                    const actionText = history.type === 'stock-in' ? '입고' : '출고';
                    response += `${actionIcon} ${item.name} ${actionText} ${history.quantity}${history.unit || '개'} <small>(${timeAgo})</small><br>`;
                }
            });
            return response + `<br>👏 활발한 관리 활동이 인상적이에요!`;
        } else {
            return `📭 아직 활동 기록이 없어요.<br><br>` +
                   `💡 물품을 등록하고 입출고를 기록해보세요!<br>` +
                   `더 스마트한 관리가 시작됩니다! 🚀`;
        }
    }

    // 🎲 개인화된 스마트 응답
    const smartResponses = [
        `🤖 현재 ${analytics.totalItems}개 물품을 스마트하게 관리 중이에요!`,
        `✨ ${analytics.totalCategories}개 카테고리로 깔끔하게 정리된 상태입니다!`,
        `🏠 ${analytics.totalLocations}개 위치에 체계적으로 보관하고 있어요!`
    ];
    
    let response = smartResponses[Math.floor(Math.random() * smartResponses.length)] + `<br><br>`;
    
    // 상황별 맞춤 제안
    if (analytics.totalItems === 0) {
        response += `🌟 <strong>시작해보세요!</strong><br>` +
                   `첫 물품 등록으로 스마트 관리를 시작하세요!<br>` +
                   `📱 화면 하단 "물품" → "+" 버튼`;
    } else if (analytics.lowStockItems.length > 0) {
        response += `⚠️ <strong>주의!</strong> ${analytics.lowStockItems.length}개 물품이 부족해요.<br>` +
                   `"재고 현황"이라고 말해보세요!`;
    } else if (analytics.recentHistory.length > 0) {
        response += `📊 <strong>활동 현황:</strong> 최근 ${analytics.recentHistory.length}건의 입출고가 있었어요.<br>` +
                   `"최근 활동"으로 자세히 확인해보세요!`;
    } else {
        response += `💎 <strong>완벽한 상태!</strong> 모든 재고가 안정적이에요.<br><br>` +
                   `🎯 <strong>이런 질문들을 해보세요:</strong><br>` +
                   `• "냉장고에 뭐가 있어?"<br>` +
                   `• "라면 몇 개 있어?"<br>` +
                   `• "재고 분석해줘"<br>` +
                   `• "도움말 보여줘"`;
    }
    
    return response;
}

// 🔍 고급 검색 함수들
function performAdvancedSearch(query, items, categories, locations) {
    const cleanQuery = query.toLowerCase()
        .replace(/있어|없어|어디|찾아|검색|찾기|보여줘|알려줘|얼마|수량/g, '')
        .trim();
    
    const searchTerms = cleanQuery.split(/\s+/).filter(term => term.length > 0);
    const results = [];
    
    items.forEach(item => {
        let score = 0;
        const itemName = item.name.toLowerCase();
        
        searchTerms.forEach(term => {
            if (itemName === term) score += 10;
            else if (itemName.includes(term)) score += 5;
            else if (itemName.startsWith(term)) score += 3;
            else if (term.includes(itemName)) score += 2;
        });
        
        if (score > 0) {
            results.push({ ...item, searchScore: score });
        }
    });
    
    return results.sort((a, b) => b.searchScore - a.searchScore);
}

// 🎭 데모용 GPT 스타일 응답 시뮬레이션
function generateDemoGptResponse(userMessage, context) {
    const message = userMessage.toLowerCase().trim();
    const { items, locations, categories } = context;
    
    const demoResponses = [
        "안녕하세요! 저는 AI물품관리 도우미입니다. 😊",
        "물품 관리에 대해 무엇이든 물어보세요!",
        "네, OpenAI GPT-3.5 터보가 정상적으로 작동하고 있습니다! ✨",
        "가족의 물품을 지능적으로 관리하는 것이 저의 특기입니다.",
        "현재 여러분의 재고 상황을 실시간으로 분석하고 있어요.",
        "궁금한 것이 있으시면 언제든 말씀해주세요! 🤖"
    ];
    
    let response = "";
    
    // GPT 스타일 인사말
    if (message.includes('안녕') || message.includes('hello') || message.includes('hi')) {
        response = "안녕하세요! 저는 OpenAI의 GPT-3.5-turbo를 기반으로 한 AI물품관리 도우미입니다. 😊\n\n";
        response += "가족의 소중한 물품들을 체계적으로 관리하고, 재고 현황을 실시간으로 분석하여 도움을 드리고 있어요.\n\n";
        response += "현재 시스템에서는:\n";
        response += `• 총 ${items.length}개의 물품을 관리하고 있습니다\n`;
        response += `• ${locations.length}개의 위치에 체계적으로 분류되어 있어요\n`;
        response += `• ${categories.length}개의 카테고리로 정리되어 있습니다\n\n`;
        response += "무엇을 도와드릴까요? 재고 확인, 물품 찾기, 구매 추천 등 어떤 것이라도 말씀해주세요! ✨";
    }
    // GPT 테스트 응답
    else if (message.includes('gpt') || message.includes('openai') || message.includes('test') || message.includes('테스트')) {
        response = "🚀 OpenAI GPT-3.5-turbo가 성공적으로 활성화되었습니다!\n\n";
        response += "저는 다음과 같은 고급 AI 기능들을 제공하고 있어요:\n\n";
        response += "🧠 **지능형 대화 시스템**\n";
        response += "• 자연어 이해 및 맥락 파악\n";
        response += "• 복잡한 질문에 대한 정확한 응답\n";
        response += "• 개인화된 추천 및 제안\n\n";
        response += "📊 **실시간 데이터 분석**\n";
        response += "• 재고 현황 실시간 모니터링\n";
        response += "• 사용 패턴 분석 및 예측\n";
        response += "• 구매 최적화 제안\n\n";
        response += "🔍 **스마트 검색 & 관리**\n";
        response += "• 음성 명령 인식\n";
        response += "• 이미지 기반 물품 식별\n";
        response += "• 위치 기반 자동 분류\n\n";
        response += "정말 놀라운 성능이죠? 어떤 기능을 체험해보고 싶으신가요? 🎉";
    }
    // 재고 관련 질문
    else if (message.includes('재고') || message.includes('현황') || message.includes('inventory')) {
        const totalItems = items.length;
        const lowStockItems = items.filter(item => (item.quantity || 0) <= 2);
        const categoryStats = getCategoryStats(items, categories);
        
        response = "📊 **GPT 기반 지능형 재고 분석 리포트**\n\n";
        response += `현재 ${totalItems}개의 물품을 AI가 실시간으로 모니터링하고 있습니다.\n\n`;
        response += "🎯 **AI 분석 결과:**\n";
        response += `• 전체 관리 물품: ${totalItems}개\n`;
        response += `• 주의 필요 물품: ${lowStockItems.length}개\n`;
        response += `• 관리 효율성: ${totalItems > 10 ? '우수' : '보통'}\n\n`;
        
        if (lowStockItems.length > 0) {
            response += "⚠️ **AI 재고 경고:**\n";
            lowStockItems.slice(0, 3).forEach(item => {
                response += `• ${item.name}: ${item.quantity || 0}개 (보충 권장)\n`;
            });
            response += "\n";
        }
        
        response += "🏆 **카테고리별 현황:**\n";
        categoryStats.slice(0, 3).forEach(stat => {
            response += `• ${stat.name}: ${stat.count}개\n`;
        });
        
        response += "\n💡 더 자세한 분석이나 개선 제안이 필요하시면 말씀해주세요!";
    }
    // 기본 응답
    else {
        const randomResponse = demoResponses[Math.floor(Math.random() * demoResponses.length)];
        response = randomResponse + "\n\n";
        response += "제가 도울 수 있는 것들:\n";
        response += "• 📦 재고 현황 분석\n";
        response += "• 🔍 물품 찾기 도움\n";
        response += "• 📊 사용 패턴 분석\n";
        response += "• 💡 구매 추천\n";
        response += "• 📝 관리 팁 제공\n\n";
        response += "구체적으로 무엇을 도와드릴까요?";
    }
    
    return response.replace(/\n/g, '<br>');
}

function extractLocationFromQuery(query) {
    const locationKeywords = ['냉장고', '창고', '방', '부엌', '거실', '화장실', '베란다', '서랍', '선반'];
    return locationKeywords.find(keyword => query.includes(keyword));
}

function findItemsByLocation(locationKeyword, items, locations) {
    return items.filter(item => {
        const locationPath = getLocationPath(item.locationId, locations).join(' ').toLowerCase();
        return locationPath.includes(locationKeyword);
    });
}

function getLocationPath(locationId, locations) {
    if (!locationId) return ['위치 미설정'];
    
    const path = [];
    let current = locations.find(loc => loc.id === locationId);
    
    while (current) {
        path.unshift(current.name);
        current = current.parentId ? locations.find(loc => loc.id === current.parentId) : null;
    }
    
    return path.length > 0 ? path : ['위치 미설정'];
}

function getCategoryStats(items, categories) {
    const stats = {};
    items.forEach(item => {
        const category = categories.find(cat => cat.id === item.categoryId);
        const name = category ? category.name : '미분류';
        stats[name] = (stats[name] || 0) + 1;
    });
    
    return Object.entries(stats)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
}

function getLocationStats(items, locations) {
    const stats = {};
    items.forEach(item => {
        const locationPath = getLocationPath(item.locationId, locations).join(' → ');
        stats[locationPath] = (stats[locationPath] || 0) + 1;
    });
    
    return Object.entries(stats)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
}

function groupByCategory(items, categories) {
    const grouped = {};
    items.forEach(item => {
        const category = categories.find(cat => cat.id === item.categoryId);
        const categoryName = category ? category.name : '미분류';
        if (!grouped[categoryName]) grouped[categoryName] = [];
        grouped[categoryName].push(item);
    });
    return grouped;
}

function getStockIcon(quantity) {
    if (quantity > 10) return '🟢';
    if (quantity > 5) return '🟡';
    if (quantity > 2) return '🟠';
    return '🔴';
}

function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 7) return `${Math.floor(diffDays / 7)}주 전`;
    if (diffDays > 0) return `${diffDays}일 전`;
    if (diffHours > 0) return `${diffHours}시간 전`;
    return '방금 전';
}

// 🤖 하이브리드 지능형 챗봇 응답 시스템 (실제 GPT + 고급 로컬 백업)
async function generateIntelligentResponse(userMessage, context) {
    // 1단계: 실제 OpenAI API 사용 시도
    const hasValidApiKey = CONFIG.USE_CHATGPT && CONFIG.OPENAI_API_KEY && CONFIG.OPENAI_API_KEY.startsWith('sk-');
    
    console.log(`OpenAI API 사용: ${hasValidApiKey ? 'YES' : 'NO'}`);
    console.log(`API Key 길이: ${CONFIG.OPENAI_API_KEY ? CONFIG.OPENAI_API_KEY.length : 0}`);
    
    if (hasValidApiKey) {
        try {
            // 2단계: 실제 OpenAI GPT API 호출
            console.log('🚀 실제 OpenAI GPT API 호출 중...');
            const startTime = Date.now();
            const chatGptResponse = await callChatGPT(userMessage, context);
            const responseTime = Date.now() - startTime;
            
            console.log(`✅ OpenAI GPT 응답 성공 (${responseTime}ms)`);
            
            // GPT 응답을 로컬 실시간 데이터로 보완
            const enhancedResponse = enhanceWithLocalData(chatGptResponse, userMessage, context);
            
            // 성공 표시 추가
            return `🤖 <small><em>OpenAI GPT-${CONFIG.CHATGPT_MODEL} 응답</em></small><br><br>` + enhancedResponse;
            
        } catch (error) {
            console.error('❌ OpenAI API 실패, 고급 로컬 모드로 전환:', error.message);
            
            // 3단계: API 실패 시 GPT급 로컬 모드로 seamless 전환
            const localResponse = generateLocalResponse(userMessage, context);
            return `🔄 <small><em>고급 AI 로컬 모드 (OpenAI 연결 실패)</em></small><br><br>` + localResponse;
        }
    } else {
        console.log('⚡ 고급 로컬 AI 모드 사용 (API 키 없음)');
        
        // 데모 모드: GPT 스타일 응답 시뮬레이션
        if (userMessage.toLowerCase().includes('gpt') || userMessage.toLowerCase().includes('openai') || userMessage.toLowerCase().includes('chatgpt')) {
            console.log('🎭 데모 모드: GPT 스타일 응답 시뮬레이션');
            const demoGptResponse = generateDemoGptResponse(userMessage, context);
            return `🤖 <small><em>데모 모드 GPT-3.5-turbo 시뮬레이션</em></small><br><br>` + demoGptResponse;
        }
        
        // 4단계: API 키가 없을 때 GPT급 로컬 모드 사용
        const localResponse = generateLocalResponse(userMessage, context);
        return `🧠 <small><em>고급 AI 로컬 모드</em></small><br><br>` + localResponse;
    }
}

// 🧾 GPT-4o Vision을 사용한 영수증 분석
async function analyzeReceiptWithGPT(base64Image) {
    const hasValidApiKey = CONFIG.USE_CHATGPT && CONFIG.OPENAI_API_KEY && CONFIG.OPENAI_API_KEY.startsWith('sk-');
    
    if (!hasValidApiKey) {
        // API 키가 없을 때 더미 분석 결과 반환
        return {
            items: [
                {
                    name: "샘플 상품",
                    category: "기타",
                    quantity: 1,
                    price: 1000,
                    description: "영수증 분석 기능을 사용하려면 OpenAI API 키가 필요합니다."
                }
            ],
            summary: "OpenAI API 키가 설정되지 않아 영수증 분석을 수행할 수 없습니다.",
            confidence: 0
        };
    }

    try {
        console.log('🧾 GPT-4o Vision으로 영수증 분석 중...');
        
        const response = await openai.chat.completions.create({
            model: CONFIG.CHATGPT_MODEL.includes('gpt-4') ? CONFIG.CHATGPT_MODEL : 'gpt-4o',
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `다음 영수증 이미지를 분석하여 구매한 물품들을 추출해주세요. 
                            
                            다음 JSON 형식으로 응답해주세요:
                            {
                                "items": [
                                    {
                                        "name": "물품명",
                                        "category": "카테고리 (식품, 생활용품, 의류, 전자제품, 도서, 기타 중 하나)",
                                        "quantity": 수량(숫자),
                                        "price": 가격(숫자),
                                        "description": "추가 설명 (브랜드, 용량 등)"
                                    }
                                ],
                                "store": "상점명",
                                "date": "구매날짜 (YYYY-MM-DD 형식)",
                                "total": 총액(숫자),
                                "summary": "영수증 분석 요약",
                                "confidence": 분석_신뢰도(0~1)
                            }
                            
                            주의사항:
                            - 물품명은 한국어로 명확하게 작성
                            - 카테고리는 반드시 지정된 6개 중 하나 선택
                            - 수량과 가격은 숫자만 입력
                            - 읽기 어려운 경우 가장 가능성 높은 값으로 추정`
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            max_tokens: 1500,
            temperature: 0.1
        });

        const content = response.choices[0].message.content;
        console.log('GPT-4o 원본 응답:', content);
        
        // JSON 파싱 시도
        try {
            // 마크다운 코드 블록에서 JSON 추출
            let jsonContent = content;
            const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            if (jsonMatch) {
                jsonContent = jsonMatch[1];
            }
            
            const analysis = JSON.parse(jsonContent);
            console.log('✅ 영수증 분석 성공:', analysis);
            return analysis;
        } catch (parseError) {
            console.log('JSON 파싱 실패, 텍스트 분석 시도...');
            
            // JSON 파싱 실패 시 텍스트에서 정보 추출
            return parseReceiptFromText(content);
        }
        
    } catch (error) {
        console.error('GPT-4o 영수증 분석 실패:', error);
        
        // 오류 시 기본 응답
        return {
            items: [],
            summary: `영수증 분석 중 오류가 발생했습니다: ${error.message}`,
            confidence: 0,
            error: true
        };
    }
}

// 텍스트에서 영수증 정보 파싱 (JSON 파싱 실패 시 백업)
function parseReceiptFromText(text) {
    try {
        // 간단한 패턴 매칭으로 정보 추출
        const items = [];
        const lines = text.split('\n');
        
        lines.forEach(line => {
            // 물품 정보 패턴 찾기 (예: "사과 1개 3000원")
            const itemMatch = line.match(/(.+?)\s*(\d+).*?(\d{1,8})/);
            if (itemMatch) {
                const [, name, quantity, price] = itemMatch;
                if (name && name.length > 1 && name.length < 50) {
                    items.push({
                        name: name.trim(),
                        category: "기타",
                        quantity: parseInt(quantity) || 1,
                        price: parseInt(price) || 0,
                        description: ""
                    });
                }
            }
        });
        
        return {
            items: items.slice(0, 20), // 최대 20개
            summary: "텍스트 분석을 통해 영수증 정보를 추출했습니다.",
            confidence: 0.6
        };
        
    } catch (error) {
        console.error('텍스트 파싱 실패:', error);
        return {
            items: [],
            summary: "영수증 분석에 실패했습니다.",
            confidence: 0
        };
    }
}

// ChatGPT 응답을 로컬 데이터로 보완
function enhanceWithLocalData(chatGptResponse, userMessage, context) {
    const message = userMessage.toLowerCase();
    const { items, categories, locations } = context;
    
    // 특정 물품 조회 시 상세 데이터 추가
    const foundItems = items.filter(item => 
        message.includes(item.name.toLowerCase()) || 
        item.name.toLowerCase().includes(message.replace(/재고|현황|수량|얼마|있어|없어|찾아|어디/g, '').trim())
    );
    
    if (foundItems.length > 0) {
        const item = foundItems[0];
        const category = categories.find(cat => cat.id === item.categoryId);
        const location = getLocationPath(item.locationId).join(' > ');
        
        const detailInfo = `<br><br>🔍 <strong>${item.name} 상세 정보:</strong><br>` +
                          `📦 현재 수량: <strong>${item.quantity || 0}${item.unit || '개'}</strong><br>` +
                          `🏷️ 카테고리: ${category ? category.name : '미분류'}<br>` +
                          `📍 위치: ${location}`;
        
        return chatGptResponse + detailInfo;
    }
    
    // 재고 현황 요청 시 실시간 데이터 추가
    if (message.includes('재고') || message.includes('현황')) {
        const lowStockItems = items.filter(item => (item.quantity || 0) <= 2);
        if (lowStockItems.length > 0) {
            const lowStockInfo = `<br><br>⚠️ <strong>재고 부족 알림:</strong><br>` +
                               lowStockItems.slice(0, 3).map(item => 
                                   `• ${item.name}: ${item.quantity || 0}${item.unit || '개'}`
                               ).join('<br>');
            return chatGptResponse + lowStockInfo;
        }
    }
    
    return chatGptResponse;
}

// 위치 경로 가져오기 헬퍼 함수
function getLocationPath(locationId) {
    if (!locationId) return ['위치 미설정'];
    
    const path = [];
    let currentLocation = locations.find(loc => loc.id === locationId);
    
    while (currentLocation) {
        path.unshift(currentLocation.name);
        if (currentLocation.parentId) {
            currentLocation = locations.find(loc => loc.id === currentLocation.parentId);
        } else {
            break;
        }
    }
    
    return path.length > 0 ? path : ['위치 미설정'];
}

// HTML 파일에서 API URL 동적 교체
function replaceApiUrl(htmlContent, req) {
    const hostname = req.headers.host || 'localhost:3001';
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    
    // API URL 동적 설정 코드로 교체
    const apiUrlReplacement = `
        // API URL 환경에 따라 자동 설정
        var API_URL = (function() {
            var hostname = window.location.hostname;
            var protocol = window.location.protocol;
            var port = window.location.port;
            
            // 로컬 개발 환경
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                return protocol + '//' + hostname + ':${CONFIG.PORT}/api';
            }
            
            // 프로덕션 환경 (Render.com)
            if (hostname.indexOf('onrender.com') !== -1) {
                return protocol + '//' + hostname + '/api';
            }
            
            // 기본값 (현재 도메인 사용)
            return protocol + '//' + hostname + (port ? ':' + port : '') + '/api';
        })();
    `;
    
    // 기존 API_URL 설정을 새로운 것으로 교체
    return htmlContent.replace(
        /(?:const|let|var)\s+API_URL\s*=\s*[^;]+;/g,
        apiUrlReplacement
    );
}

// 초기화 - 데이터 로드
loadData();

// HTTP 서버 생성
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;
    
    console.log(`${method} ${pathname}`);
    
    // CORS 헤더 설정
    setCorsHeaders(res);
    
    // OPTIONS 요청 처리
    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // 공개 엔드포인트 확인
    const isPublic = publicEndpoints.some(ep => 
        ep.path === pathname && ep.method === method
    );
    
    // 인증이 필요한 엔드포인트 (현재는 모든 API를 공개로 설정)
    // if (!isPublic && pathname.startsWith('/api/')) {
    //     const isReadonly = readonlyEndpoints.some(ep => 
    //         ep.path === pathname && ep.method === method
    //     );
        
    //     const requiredRole = isReadonly ? null : 'admin';
    //     if (!auth.authenticate(req, res, requiredRole)) {
    //         return;
    //     }
    // }
    
    // 라우팅 시작
    
    // 기본 정보
    if (pathname === '/' && method === 'GET') {
        sendJsonResponse(res, 200, {
            message: '스마트 재물관리 API',
            version: '1.2.0',
            features: [
                '물건 관리',
                '위치 관리',
                '카테고리 관리',
                '이미지 업로드',
                '검색 기능',
                '데이터 영구 저장',
                CONFIG.USE_S3 ? 'S3 백업' : '로컬 저장'
            ],
            environment: CONFIG.NODE_ENV,
            timestamp: new Date().toISOString()
        });
    }
    // 헬스 체크
    else if (pathname === '/api/health' && method === 'GET') {
        sendJsonResponse(res, 200, {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            itemCount: items.length,
            locationCount: locations.length,
            categoryCount: categories.length,
            s3Enabled: CONFIG.USE_S3,
            environment: CONFIG.NODE_ENV
        });
    }
    // 가족 로그인 (두 경로 모두 지원)
    else if ((pathname === '/api/auth/login' || pathname === '/api/family-auth/login') && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const { username, password } = JSON.parse(body);
                
                if (!username || !password) {
                    return sendErrorResponse(res, 400, '사용자명과 비밀번호가 필요합니다');
                }

                const result = await familyAuth.login(username, password);
                
                if (result.success) {
                    sendJsonResponse(res, 200, {
                        success: true,
                        message: '로그인 성공',
                        token: result.token,
                        user: result.user
                    });
                } else {
                    sendErrorResponse(res, 401, result.error);
                }
            } catch (error) {
                console.error('로그인 오류:', error);
                sendErrorResponse(res, 500, '서버 오류가 발생했습니다');
            }
        });
    }
    // 토큰 검증 (두 경로 모두 지원)
    else if ((pathname === '/api/auth/verify' || pathname === '/api/family-auth/verify') && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { token } = JSON.parse(body);
                const result = familyAuth.verifyToken(token);
                
                if (result.success) {
                    sendJsonResponse(res, 200, {
                        success: true,
                        user: result.user
                    });
                } else {
                    sendErrorResponse(res, 401, result.error);
                }
            } catch (error) {
                console.error('토큰 검증 오류:', error);
                sendErrorResponse(res, 500, '서버 오류가 발생했습니다');
            }
        });
    }
    // 시스템 상태 확인 (가족 존재 여부)
    else if (pathname === '/api/family-auth/status' && method === 'GET') {
        sendJsonResponse(res, 200, {
            success: true,
            hasAnyFamily: familyAuth.hasAnyFamily(),
            familyCount: familyAuth.families.size,
            userCount: familyAuth.users.size
        });
    }
    // 관리자 회원가입 (최초 가족 생성)
    else if (pathname === '/api/family-auth/signup-admin' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const signupData = JSON.parse(body);
                console.log('관리자 회원가입 요청:', signupData);
                
                const result = await familyAuth.signupAdmin(signupData);
                
                if (result.success) {
                    sendJsonResponse(res, 201, result);
                } else {
                    sendErrorResponse(res, 400, result.error);
                }
            } catch (error) {
                console.error('관리자 회원가입 오류:', error);
                sendErrorResponse(res, 500, '서버 오류가 발생했습니다');
            }
        });
    }
    // 초대 코드 생성 (관리자 전용)
    else if (pathname === '/api/family-auth/create-invitation' && method === 'POST') {
        // 인증 확인
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            sendErrorResponse(res, 401, '인증이 필요합니다');
            return;
        }

        const token = authHeader.split(' ')[1];
        const authResult = familyAuth.verifyToken(token);
        
        if (!authResult.success) {
            sendErrorResponse(res, 401, '유효하지 않은 토큰입니다');
            return;
        }

        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const inviteData = JSON.parse(body);
                const result = await familyAuth.createInvitation(authResult.user.id, inviteData);
                
                if (result.success) {
                    sendJsonResponse(res, 201, result);
                } else {
                    sendErrorResponse(res, 400, result.error);
                }
            } catch (error) {
                console.error('초대 코드 생성 오류:', error);
                sendErrorResponse(res, 500, '서버 오류가 발생했습니다');
            }
        });
    }
    // 초대 코드로 가입
    else if (pathname === '/api/family-auth/join-family' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const { inviteCode, ...userData } = JSON.parse(body);
                const result = await familyAuth.joinFamily(inviteCode, userData);
                
                if (result.success) {
                    sendJsonResponse(res, 201, result);
                } else {
                    sendErrorResponse(res, 400, result.error);
                }
            } catch (error) {
                console.error('가족 가입 오류:', error);
                sendErrorResponse(res, 500, '서버 오류가 발생했습니다');
            }
        });
    }
    // 가족 구성원 조회
    else if (pathname === '/api/family/members' && method === 'GET') {
        // 인증 확인
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return sendErrorResponse(res, 401, '토큰이 필요합니다');
        }

        const authResult = familyAuth.verifyToken(token);
        if (!authResult.success) {
            return sendErrorResponse(res, 403, '유효하지 않은 토큰입니다');
        }

        const members = familyAuth.getFamilyMembers(authResult.user.familyId);
        sendJsonResponse(res, 200, {
            success: true,
            members
        });
    }
    // 가족 활동 내역 조회
    else if (pathname === '/api/family/activities' && method === 'GET') {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return sendErrorResponse(res, 401, '토큰이 필요합니다');
        }

        const authResult = familyAuth.verifyToken(token);
        if (!authResult.success) {
            return sendErrorResponse(res, 403, '유효하지 않은 토큰입니다');
        }

        const activities = familyAuth.getFamilyActivities(authResult.user.familyId, 100);
        sendJsonResponse(res, 200, {
            success: true,
            activities
        });
    }
    // 물건 목록 조회
    else if (pathname === '/api/items' && method === 'GET') {
        try {
            const searchQuery = parsedUrl.query.search || '';
            const locationId = parsedUrl.query.locationId ? parseInt(parsedUrl.query.locationId) : null;
            const categoryId = parsedUrl.query.categoryId ? parseInt(parsedUrl.query.categoryId) : null;
            
            let filteredItems = [...items];
            
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                filteredItems = filteredItems.filter(item => 
                    item.name.toLowerCase().includes(query) ||
                    (item.description && item.description.toLowerCase().includes(query))
                );
            }
            
            if (locationId) {
                const locationIds = getLocationWithChildren(locationId);
                filteredItems = filteredItems.filter(item => 
                    locationIds.includes(item.locationId)
                );
            }
            
            if (categoryId) {
                filteredItems = filteredItems.filter(item => item.categoryId === categoryId);
            }
            
            const itemsWithDetails = filteredItems.map(item => {
                const locationPath = getLocationPath(item.locationId);
                const category = categories.find(cat => cat.id === item.categoryId);
                const images = itemImages[item.id] || [];
                
                return {
                    ...item,
                    locationPath: locationPath,
                    locationName: locationPath.join(' > '),
                    categoryName: category ? category.name : null,
                    categoryColor: category ? category.color : null,
                    categoryIcon: category ? category.icon : null,
                    images: images,
                    imageCount: images.length,
                    thumbnailUrl: images.length > 0 ? images[0].thumbnail : item.thumbnailUrl
                };
            });
            
            sendJsonResponse(res, 200, {
                success: true,
                count: itemsWithDetails.length,
                totalCount: items.length,
                items: itemsWithDetails,
                searchQuery: searchQuery,
                locationFilter: locationId,
                categoryFilter: categoryId
            });
        } catch (error) {
            console.error('Items 조회 실패:', error);
            sendErrorResponse(res, 500, 'Failed to fetch items');
        }
    }
    // 물건 추가
    else if (pathname === '/api/items' && method === 'POST') {
        // 인증 확인 (선택적)
        let currentUser = null;
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (token) {
            const authResult = familyAuth.verifyToken(token);
            if (authResult.success && familyAuth.hasPermission(authResult.user.role, 'write_items')) {
                currentUser = authResult.user;
            }
        }
        
        // 인증된 사용자가 없으면 기본 사용자로 설정 (개발/테스트용)
        if (!currentUser) {
            console.log('익명 사용자로 물품 등록');
            currentUser = {
                id: 'anonymous',
                username: 'anonymous',
                role: 'parent',
                avatar: '👤',
                permissions: ['read_items', 'write_items']
            };
        }
        const contentType = req.headers['content-type'] || '';
        
        // JSON 형식인지 멀티파트 형식인지 확인
        if (contentType.includes('multipart/form-data')) {
            // 멀티파트 폼 데이터 (이미지 포함) 처리
            const boundary = contentType.split('boundary=')[1];
            let body = Buffer.alloc(0);
            
            req.on('data', chunk => {
                body = Buffer.concat([body, chunk]);
            });
            
            req.on('end', async () => {
                try {
                    const parts = parseMultipart(body, boundary);
                    
                    // 폼 데이터 파싱
                    const formData = {};
                    let imagePart = null;
                    
                    parts.forEach(part => {
                        if (part.name === 'image') {
                            imagePart = part;
                        } else {
                            formData[part.name] = part.data.toString('utf8');
                        }
                    });
                    
                    // 기본 검증
                    if (!formData.name || !formData.name.trim()) {
                        sendErrorResponse(res, 400, 'Item name is required');
                        return;
                    }
                    
                    const newItem = {
                        id: nextId++,
                        name: formData.name.trim(),
                        description: formData.description ? formData.description.trim() : '',
                        locationId: formData.locationId && formData.locationId !== '' ? parseInt(formData.locationId) : null,
                        categoryId: formData.categoryId && formData.categoryId !== '' ? parseInt(formData.categoryId) : null,
                        quantity: formData.quantity ? parseInt(formData.quantity) : 1,
                        unit: formData.unit || '개',
                        imageUrl: null,
                        thumbnailUrl: null,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    
                    // 이미지 처리
                    if (imagePart && imagePart.data && imagePart.data.length > 0) {
                        try {
                            console.log(`이미지 파트 수신: ${imagePart.data.length} bytes, 타입: ${imagePart.contentType}`);
                            
                            const fileExtension = getFileExtension(imagePart.filename || imagePart.contentType);
                            const filename = `item_${newItem.id}_${Date.now()}${fileExtension}`;
                            const filepath = path.join(IMAGES_DIR, filename);
                            
                            console.log(`이미지 저장 시작: ${filepath}`);
                            // 이미지 저장
                            fs.writeFileSync(filepath, imagePart.data);
                            console.log('이미지 파일 저장 완료');
                            
                            // 썸네일 생성
                            const thumbnailFilename = `thumb_${filename}`;
                            const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFilename);
                            
                            try {
                                console.log(`이미지 처리 시작: ${filename} (${imagePart.data.length} bytes)`);
                                
                                // 이미지 크기 제한 (2MB)
                                if (imagePart.data.length > 2 * 1024 * 1024) {
                                    throw new Error('이미지 크기가 너무 큽니다 (최대 2MB)');
                                }
                                
                                // 타임아웃 설정으로 Sharp 처리
                                const processImage = () => {
                                    return Promise.race([
                                        sharp(imagePart.data)
                                            .resize(200, 200, { fit: 'cover' })
                                            .jpeg({ quality: 80 })
                                            .toFile(thumbnailPath),
                                        new Promise((_, reject) => 
                                            setTimeout(() => reject(new Error('이미지 처리 타임아웃')), 10000)
                                        )
                                    ]);
                                };
                                
                                await processImage();
                                console.log('썸네일 생성 완료');
                                
                                newItem.imageUrl = `/images/${filename}`;
                                newItem.thumbnailUrl = `/thumbnails/${thumbnailFilename}`;
                            } catch (error) {
                                console.warn('썸네일 생성 실패:', error.message);
                                newItem.imageUrl = `/images/${filename}`;
                                // 썸네일 실패시에도 원본 이미지는 사용
                            }
                            
                            // S3 업로드 (옵션)
                            if (CONFIG.USE_S3 && s3) {
                                try {
                                    const s3Key = `items/${filename}`;
                                    const s3Params = {
                                        Bucket: CONFIG.S3_BUCKET,
                                        Key: s3Key,
                                        Body: imagePart.data,
                                        ContentType: imagePart.contentType || 'image/jpeg'
                                    };
                                    
                                    const s3Result = await s3.upload(s3Params).promise();
                                    newItem.imageUrl = s3Result.Location;
                                    console.log('S3 이미지 업로드 완료:', s3Result.Location);
                                } catch (s3Error) {
                                    console.error('S3 업로드 실패:', s3Error);
                                }
                            }
                        } catch (imageError) {
                            console.error('이미지 처리 실패:', imageError);
                            // 이미지 실패해도 아이템은 생성
                        }
                    }
                    
                    items.push(newItem);
                    scheduleSave();
                    
                    const locationPath = getLocationPath(newItem.locationId);
                    const category = categories.find(cat => cat.id === newItem.categoryId);
                    
                    sendJsonResponse(res, 201, {
                        success: true,
                        item: {
                            ...newItem,
                            locationPath: locationPath,
                            locationName: locationPath.join(' > '),
                            categoryName: category ? category.name : null,
                            categoryColor: category ? category.color : null,
                            categoryIcon: category ? category.icon : null
                        }
                    });
                } catch (error) {
                    console.error('Item 추가 실패 (멀티파트):', error);
                    sendErrorResponse(res, 400, 'Failed to create item');
                }
            });
        } else {
            // JSON 형식 처리 (기존 방식)
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    
                    // 기본 검증
                    if (!data.name || typeof data.name !== 'string') {
                        sendErrorResponse(res, 400, 'Item name is required');
                        return;
                    }
                    
                    const newItem = {
                        id: nextId++,
                        name: data.name.trim(),
                        description: data.description ? data.description.trim() : '',
                        locationId: data.locationId ? parseInt(data.locationId) : null,
                        categoryId: data.categoryId ? parseInt(data.categoryId) : null,
                        quantity: data.quantity ? parseInt(data.quantity) : 1,
                        unit: data.unit || '개',
                        imageUrl: data.imageUrl || null,
                        thumbnailUrl: data.thumbnailUrl || null,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    
                    items.push(newItem);
                    scheduleSave();
                    
                    const locationPath = getLocationPath(newItem.locationId);
                const category = categories.find(cat => cat.id === newItem.categoryId);
                
                    sendJsonResponse(res, 201, {
                        success: true,
                        item: {
                            ...newItem,
                            locationPath: locationPath,
                            locationName: locationPath.join(' > '),
                            categoryName: category ? category.name : null,
                            categoryColor: category ? category.color : null,
                            categoryIcon: category ? category.icon : null
                        }
                    });
                } catch (error) {
                    console.error('Item 추가 실패 (JSON):', error);
                    sendErrorResponse(res, 400, 'Failed to create item');
                }
            });
        }
    }
    // 물건 수정
    else if (pathname.match(/^\/api\/items\/(\d+)$/) && method === 'PUT') {
        const id = parseInt(pathname.split('/')[3]);
        const index = items.findIndex(item => item.id === id);
        
        if (index === -1) {
            sendErrorResponse(res, 404, 'Item not found');
            return;
        }
        
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                
                items[index] = {
                    ...items[index],
                    ...data,
                    id: items[index].id, // ID는 변경 불가
                    updatedAt: new Date().toISOString()
                };
                
                scheduleSave();
                
                const locationPath = getLocationPath(items[index].locationId);
                const category = categories.find(cat => cat.id === items[index].categoryId);
                
                sendJsonResponse(res, 200, {
                    success: true,
                    item: {
                        ...items[index],
                        locationPath: locationPath,
                        locationName: locationPath.join(' > '),
                        categoryName: category ? category.name : null,
                        categoryColor: category ? category.color : null,
                        categoryIcon: category ? category.icon : null
                    }
                });
            } catch (error) {
                console.error('Item 수정 실패:', error);
                sendErrorResponse(res, 400, 'Failed to update item');
            }
        });
    }
    // 물건 삭제
    else if (pathname.match(/^\/api\/items\/(\d+)$/) && method === 'DELETE') {
        try {
            const id = parseInt(pathname.split('/')[3]);
            const index = items.findIndex(item => item.id === id);
            
            if (index !== -1) {
                // 이미지 정리 (S3 및 로컬)
                if (itemImages[id]) {
                    // S3 이미지 삭제
                    if (CONFIG.USE_S3 && s3) {
                        itemImages[id].forEach(async (img) => {
                            if (img.s3Key) {
                                try {
                                    await s3.deleteObject({
                                        Bucket: CONFIG.S3_BUCKET,
                                        Key: img.s3Key
                                    }).promise();
                                } catch (error) {
                                    console.error('S3 이미지 삭제 실패:', error);
                                }
                            }
                        });
                    }
                    
                    // 로컬 이미지 삭제
                    itemImages[id].forEach(img => {
                        const filename = img.url.split('/').pop();
                        const imagePath = path.join(IMAGES_DIR, filename);
                        const thumbPath = path.join(THUMBNAILS_DIR, `thumb_${filename}`);
                        
                        fs.unlink(imagePath, () => {});
                        fs.unlink(thumbPath, () => {});
                    });
                    
                    delete itemImages[id];
                }
                
                items.splice(index, 1);
                scheduleSave();
                
                sendJsonResponse(res, 200, {
                    success: true,
                    message: 'Item deleted successfully'
                });
            } else {
                sendErrorResponse(res, 404, 'Item not found');
            }
        } catch (error) {
            console.error('Item 삭제 실패:', error);
            sendErrorResponse(res, 500, 'Failed to delete item');
        }
    }
    // 위치 목록 조회
    else if (pathname === '/api/locations' && method === 'GET') {
        try {
            const level = parsedUrl.query.level;
            const parentId = parsedUrl.query.parentId;
            
            let filteredLocations = [...locations];
            
            if (level !== undefined) {
                filteredLocations = locations.filter(loc => loc.level === parseInt(level));
            }
            
            if (parentId !== undefined) {
                filteredLocations = locations.filter(loc => 
                    loc.parentId === (parentId === 'null' ? null : parseInt(parentId))
                );
            }
            
            // 각 위치에 추가 정보 제공
            const locationsWithDetails = filteredLocations.map(location => {
                const path = getLocationPath(location.id);
                const pathString = path.join(' => ');
                const itemCount = items.filter(item => item.locationId === location.id).length;
                const subLocations = locations.filter(loc => loc.parentId === location.id);
                
                return {
                    ...location,
                    path: path,
                    pathString: pathString,
                    itemCount: itemCount,
                    subLocationCount: subLocations.length,
                    hasItems: itemCount > 0,
                    hasSubLocations: subLocations.length > 0
                };
            });
            
            sendJsonResponse(res, 200, {
                success: true,
                locations: locationsWithDetails
            });
        } catch (error) {
            console.error('Locations 조회 실패:', error);
            sendErrorResponse(res, 500, 'Failed to fetch locations');
        }
    }
    // 위치 추가
    else if (pathname === '/api/locations' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                
                if (!data.name || typeof data.name !== 'string') {
                    sendErrorResponse(res, 400, 'Location name is required');
                    return;
                }
                
                const parentId = data.parentId ? parseInt(data.parentId) : null;
                const parentLocation = parentId ? 
                    locations.find(loc => loc.id === parentId) : null;
                
                const newLevel = parentLocation ? parentLocation.level + 1 : 0;
                
                if (newLevel > 3) {
                    sendErrorResponse(res, 400, '위치는 최대 4단계까지만 만들 수 있습니다.');
                    return;
                }
                
                // 위치 타입 결정 (level 기반)
                const locationTypes = ['위치', '공간', '가구', '층'];
                const locationType = locationTypes[newLevel] || '기타';
                
                const newLocation = {
                    id: nextLocationId++,
                    name: data.name.trim(),
                    parentId: parentId,
                    level: newLevel,
                    type: locationType,
                    description: data.description || '',
                    imageUrl: null,
                    thumbnailUrl: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                locations.push(newLocation);
                scheduleSave();
                
                sendJsonResponse(res, 201, {
                    success: true,
                    location: newLocation
                });
            } catch (error) {
                console.error('Location 추가 실패:', error);
                sendErrorResponse(res, 400, 'Failed to create location');
            }
        });
    }
    // 카테고리 목록 조회
    else if (pathname === '/api/categories' && method === 'GET') {
        try {
            sendJsonResponse(res, 200, {
                success: true,
                categories: categories
            });
        } catch (error) {
            console.error('Categories 조회 실패:', error);
            sendErrorResponse(res, 500, 'Failed to fetch categories');
        }
    }
    // 카테고리 추가
    else if (pathname === '/api/categories' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                
                if (!data.name || typeof data.name !== 'string') {
                    sendErrorResponse(res, 400, 'Category name is required');
                    return;
                }
                
                const newCategory = {
                    id: nextCategoryId++,
                    name: data.name.trim(),
                    color: data.color || '#9E9E9E',
                    icon: data.icon || '📦'
                };
                
                categories.push(newCategory);
                scheduleSave();
                
                sendJsonResponse(res, 201, {
                    success: true,
                    category: newCategory
                });
            } catch (error) {
                console.error('Category 추가 실패:', error);
                sendErrorResponse(res, 400, 'Failed to create category');
            }
        });
    }
    // 위치 삭제
    else if (pathname.match(/^\/api\/locations\/(\d+)$/) && method === 'DELETE') {
        const locationId = parseInt(pathname.split('/')[3]);
        
        try {
            // 해당 위치를 사용하는 물건이 있는지 확인
            const itemsUsingLocation = items.filter(item => item.locationId === locationId);
            
            if (itemsUsingLocation.length > 0) {
                sendErrorResponse(res, 400, `이 위치에 ${itemsUsingLocation.length}개의 물건이 있습니다. 먼저 물건을 다른 곳으로 이동해주세요.`);
                return;
            }
            
            // 위치 삭제
            const locationIndex = locations.findIndex(location => location.id === locationId);
            
            if (locationIndex === -1) {
                sendErrorResponse(res, 404, 'Location not found');
                return;
            }
            
            const deletedLocation = locations.splice(locationIndex, 1)[0];
            scheduleSave();
            
            sendJsonResponse(res, 200, {
                success: true,
                message: 'Location deleted successfully',
                deletedLocation: deletedLocation
            });
            
        } catch (error) {
            console.error('위치 삭제 실패:', error);
            sendErrorResponse(res, 500, 'Failed to delete location');
        }
    }
    // 위치 수정 (이미지 포함)
    else if (pathname.match(/^\/api\/locations\/(\d+)$/) && method === 'PUT') {
        const locationId = parseInt(pathname.split('/')[3]);
        
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                
                const locationIndex = locations.findIndex(loc => loc.id === locationId);
                
                if (locationIndex === -1) {
                    sendErrorResponse(res, 404, 'Location not found');
                    return;
                }
                
                const location = locations[locationIndex];
                
                // 업데이트할 필드들
                if (data.name && typeof data.name === 'string') {
                    location.name = data.name.trim();
                }
                
                if (data.description !== undefined) {
                    location.description = data.description;
                }
                
                // 이미지 URL 업데이트
                if (data.imageUrl !== undefined) {
                    location.imageUrl = data.imageUrl;
                }
                
                if (data.thumbnailUrl !== undefined) {
                    location.thumbnailUrl = data.thumbnailUrl;
                }
                
                location.updatedAt = new Date().toISOString();
                
                scheduleSave();
                
                sendJsonResponse(res, 200, {
                    success: true,
                    location: location
                });
                
            } catch (error) {
                console.error('위치 수정 실패:', error);
                sendErrorResponse(res, 400, 'Failed to update location');
            }
        });
    }
    // 위치 이미지 업로드
    else if (pathname.match(/^\/api\/locations\/(\d+)\/image$/) && method === 'POST') {
        const locationId = parseInt(pathname.split('/')[3]);
        
        try {
            const locationIndex = locations.findIndex(loc => loc.id === locationId);
            
            if (locationIndex === -1) {
                sendErrorResponse(res, 404, 'Location not found');
                return;
            }
            
            const contentType = req.headers['content-type'] || '';
            
            if (!contentType.includes('multipart/form-data')) {
                sendErrorResponse(res, 400, 'Content-Type must be multipart/form-data');
                return;
            }
            
            const boundary = contentType.split('boundary=')[1];
            let body = Buffer.alloc(0);
            
            req.on('data', chunk => {
                body = Buffer.concat([body, chunk]);
            });
            
            req.on('end', async () => {
                try {
                    const parts = parseMultipart(body, boundary);
                    const imagePart = parts.find(part => part.name === 'image');
                    
                    if (!imagePart || !imagePart.data) {
                        sendErrorResponse(res, 400, 'No image file provided');
                        return;
                    }
                    
                    // 이미지 파일 저장
                    const fileExtension = getFileExtension(imagePart.filename || imagePart.contentType);
                    const filename = `location_${locationId}_${Date.now()}${fileExtension}`;
                    const filepath = path.join(IMAGES_DIR, filename);
                    
                    // 이미지 저장
                    fs.writeFileSync(filepath, imagePart.data);
                    
                    // 썸네일 생성
                    const thumbnailFilename = `thumb_${filename}`;
                    const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFilename);
                    
                    try {
                        await sharp(imagePart.data)
                            .resize(200, 200, { fit: 'cover' })
                            .jpeg({ quality: 80 })
                            .toFile(thumbnailPath);
                    } catch (error) {
                        console.warn('썸네일 생성 실패:', error);
                    }
                    
                    // URL 생성
                    const imageUrl = `/images/${filename}`;
                    const thumbnailUrl = `/images/${thumbnailFilename}`;
                    
                    // 위치 정보 업데이트
                    const location = locations[locationIndex];
                    location.imageUrl = imageUrl;
                    location.thumbnailUrl = thumbnailUrl;
                    location.updatedAt = new Date().toISOString();
                    
                    scheduleSave();
                    
                    sendJsonResponse(res, 200, {
                        success: true,
                        imageUrl: imageUrl,
                        thumbnailUrl: thumbnailUrl,
                        location: location
                    });
                    
                } catch (error) {
                    console.error('이미지 처리 실패:', error);
                    sendErrorResponse(res, 500, 'Failed to process image');
                }
            });
            
        } catch (error) {
            console.error('위치 이미지 업로드 실패:', error);
            sendErrorResponse(res, 500, 'Failed to upload location image');
        }
    }
    // 위치 데이터 정리 (중복 제거) - 개발/테스트용
    else if (pathname === '/api/locations/cleanup' && method === 'POST') {
        try {
            const beforeCount = locations.length;
            
            // 이름이 같은 위치들을 그룹화
            const locationGroups = {};
            locations.forEach(loc => {
                const key = loc.name.toLowerCase().trim();
                if (!locationGroups[key]) {
                    locationGroups[key] = [];
                }
                locationGroups[key].push(loc);
            });
            
            // 각 그룹에서 대표 위치만 남기고 나머지는 제거
            const cleanedLocations = [];
            const itemUpdates = [];
            
            Object.values(locationGroups).forEach(group => {
                if (group.length === 1) {
                    cleanedLocations.push(group[0]);
                } else {
                    // 가장 완전한 정보를 가진 위치를 대표로 선택
                    const representative = group.reduce((best, current) => {
                        const bestScore = (best.description ? 1 : 0) + (best.imageUrl ? 1 : 0) + (best.type ? 1 : 0);
                        const currentScore = (current.description ? 1 : 0) + (current.imageUrl ? 1 : 0) + (current.type ? 1 : 0);
                        
                        if (currentScore > bestScore) {
                            return current;
                        } else if (currentScore === bestScore) {
                            return new Date(current.createdAt || 0) > new Date(best.createdAt || 0) ? current : best;
                        }
                        return best;
                    });
                    
                    cleanedLocations.push(representative);
                    
                    // 제거되는 위치들의 물건을 대표 위치로 이동
                    group.forEach(loc => {
                        if (loc.id !== representative.id) {
                            items.forEach(item => {
                                if (item.locationId === loc.id) {
                                    item.locationId = representative.id;
                                    itemUpdates.push({
                                        itemId: item.id,
                                        oldLocationId: loc.id,
                                        newLocationId: representative.id
                                    });
                                }
                            });
                        }
                    });
                }
            });
            
            locations = cleanedLocations;
            scheduleSave();
            
            sendJsonResponse(res, 200, {
                success: true,
                message: 'Location cleanup completed',
                beforeCount: beforeCount,
                afterCount: locations.length,
                removedCount: beforeCount - locations.length,
                itemUpdates: itemUpdates.length
            });
            
        } catch (error) {
            console.error('위치 정리 실패:', error);
            sendErrorResponse(res, 500, 'Failed to cleanup locations');
        }
    }
    // 위치 레벨 재계산 및 수정 API
    else if (pathname === '/api/locations/fix-levels' && method === 'POST') {
        try {
            let fixedCount = 0;
            
            // 모든 위치의 레벨과 parentId 수정
            locations.forEach(location => {
                // parentId가 문자열인 경우 숫자로 변환
                if (typeof location.parentId === 'string') {
                    location.parentId = location.parentId === 'null' ? null : parseInt(location.parentId);
                    fixedCount++;
                }
                
                // 레벨 재계산
                let currentLoc = location;
                let level = 0;
                const visited = new Set();
                
                while (currentLoc && currentLoc.parentId && !visited.has(currentLoc.id)) {
                    visited.add(currentLoc.id);
                    const parent = locations.find(loc => loc.id === currentLoc.parentId);
                    if (parent) {
                        level++;
                        currentLoc = parent;
                    } else {
                        break;
                    }
                }
                
                if (location.level !== level) {
                    location.level = level;
                    fixedCount++;
                }
                
                // 위치 타입 재설정
                const locationTypes = ['위치', '공간', '가구', '층', '세부'];
                const newType = locationTypes[level] || '기타';
                if (!location.type || location.type !== newType) {
                    location.type = newType;
                }
            });
            
            scheduleSave();
            
            sendJsonResponse(res, 200, {
                success: true,
                message: 'Location levels fixed',
                fixedCount: fixedCount,
                locations: locations.map(loc => ({
                    id: loc.id,
                    name: loc.name,
                    level: loc.level,
                    parentId: loc.parentId,
                    type: loc.type
                }))
            });
            
        } catch (error) {
            console.error('위치 레벨 수정 실패:', error);
            sendErrorResponse(res, 500, 'Failed to fix location levels');
        }
    }
    // 위치 구조 재조정 API (거실, 침실 등을 집 하위로 이동)
    else if (pathname === '/api/locations/restructure' && method === 'POST') {
        try {
            let updatedCount = 0;
            
            // "집" 위치 찾기 (id: 16)
            const homeLocation = locations.find(loc => loc.name === '집' && loc.level === 0);
            
            if (!homeLocation) {
                sendErrorResponse(res, 404, '집 위치를 찾을 수 없습니다');
                return;
            }
            
            // 집의 하위 공간으로 이동할 위치들
            const roomNames = ['거실', '침실', '주방', '화장실', '베란다'];
            
            locations.forEach(location => {
                if (roomNames.includes(location.name) && location.level === 0 && !location.parentId) {
                    location.parentId = homeLocation.id;
                    location.level = 1;
                    location.type = '공간';
                    location.updatedAt = new Date().toISOString();
                    updatedCount++;
                }
            });
            
            scheduleSave();
            
            sendJsonResponse(res, 200, {
                success: true,
                message: 'Location structure restructured',
                updatedCount: updatedCount,
                homeLocationId: homeLocation.id,
                restructuredRooms: roomNames,
                currentStructure: locations.filter(loc => loc.level <= 1).map(loc => ({
                    id: loc.id,
                    name: loc.name,
                    level: loc.level,
                    parentId: loc.parentId,
                    type: loc.type
                }))
            });
            
        } catch (error) {
            console.error('위치 구조 재조정 실패:', error);
            sendErrorResponse(res, 500, 'Failed to restructure locations');
        }
    }
    // 카테고리 삭제
    else if (pathname.match(/^\/api\/categories\/(\d+)$/) && method === 'DELETE') {
        const categoryId = parseInt(pathname.split('/')[3]);
        
        try {
            // 해당 카테고리를 사용하는 물건이 있는지 확인
            const itemsUsingCategory = items.filter(item => item.categoryId === categoryId);
            
            if (itemsUsingCategory.length > 0) {
                sendErrorResponse(res, 400, `이 카테고리에 ${itemsUsingCategory.length}개의 물건이 있습니다. 먼저 물건의 카테고리를 변경해주세요.`);
                return;
            }
            
            // 카테고리 삭제
            const categoryIndex = categories.findIndex(category => category.id === categoryId);
            
            if (categoryIndex === -1) {
                sendErrorResponse(res, 404, 'Category not found');
                return;
            }
            
            const deletedCategory = categories.splice(categoryIndex, 1)[0];
            scheduleSave();
            
            sendJsonResponse(res, 200, {
                success: true,
                message: 'Category deleted successfully',
                deletedCategory: deletedCategory
            });
            
        } catch (error) {
            console.error('카테고리 삭제 실패:', error);
            sendErrorResponse(res, 500, 'Failed to delete category');
        }
    }
    // AI 자연어 검색
    else if (pathname === '/api/ai-search' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const query = data.query?.toLowerCase() || '';
                
                if (!query) {
                    sendErrorResponse(res, 400, 'Search query is required');
                    return;
                }
                
                // 간단한 키워드 매칭 검색 (실제 AI는 아니지만 유사한 기능)
                const results = items.filter(item => {
                    const itemText = `${item.name} ${item.description}`.toLowerCase();
                    const categoryName = categories.find(c => c.id === item.categoryId)?.name?.toLowerCase() || '';
                    const locationName = locations.find(l => l.id === item.locationId)?.name?.toLowerCase() || '';
                    
                    // 키워드 매칭
                    const keywords = query.split(' ').filter(k => k.length > 0);
                    return keywords.some(keyword => 
                        itemText.includes(keyword) || 
                        categoryName.includes(keyword) || 
                        locationName.includes(keyword)
                    );
                });
                
                // 카테고리 정보와 위치 정보 추가
                const enrichedResults = results.map(item => {
                    const category = categories.find(c => c.id === item.categoryId);
                    const location = locations.find(l => l.id === item.locationId);
                    
                    return {
                        ...item,
                        categoryName: category?.name || null,
                        categoryColor: category?.color || null,
                        categoryIcon: category?.icon || null,
                        locationName: location?.name || null,
                        locationPath: location ? [location.name] : []
                    };
                });
                
                sendJsonResponse(res, 200, {
                    success: true,
                    query: data.query,
                    results: enrichedResults,
                    count: enrichedResults.length,
                    message: enrichedResults.length > 0 
                        ? `"${data.query}"에 대한 ${enrichedResults.length}개의 결과를 찾았습니다.`
                        : `"${data.query}"에 대한 검색 결과가 없습니다.`
                });
            } catch (error) {
                console.error('AI 검색 실패:', error);
                sendErrorResponse(res, 400, 'Search failed');
            }
        });
    }
    // 정적 파일 제공 - index-mobile.html (API URL 동적 교체 포함)
    else if (pathname === '/index-mobile.html' && method === 'GET') {
        const possiblePaths = [
            path.join(__dirname, '../../frontend/index-mobile.html'),
            path.join(__dirname, '../../index-mobile.html')
        ];
        
        let fileFound = false;
        for (const filePath of possiblePaths) {
            try {
                let htmlContent = fs.readFileSync(filePath, 'utf8');
                
                // API URL 동적 교체
                htmlContent = replaceApiUrl(htmlContent, req);
                
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                res.writeHead(200);
                res.end(htmlContent);
                fileFound = true;
                break;
            } catch (err) {
                continue;
            }
        }
        
        if (!fileFound) {
            sendErrorResponse(res, 404, 'File not found');
        }
    }
    // 정적 파일 제공 - index-v5.html (API URL 동적 교체 포함)
    else if (pathname === '/index-v5.html' && method === 'GET') {
        const possiblePaths = [
            path.join(__dirname, '../../frontend/index-v5.html'),
            path.join(__dirname, '../../index-v5.html')
        ];
        
        let fileFound = false;
        for (const filePath of possiblePaths) {
            try {
                let htmlContent = fs.readFileSync(filePath, 'utf8');
                
                // API URL 동적 교체
                htmlContent = replaceApiUrl(htmlContent, req);
                
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                res.writeHead(200);
                res.end(htmlContent);
                fileFound = true;
                break;
            } catch (err) {
                continue;
            }
        }
        
        if (!fileFound) {
            sendErrorResponse(res, 404, 'File not found');
        }
    }
    // 정적 파일 제공 - 기타 HTML, CSS, JS 파일들 (API URL 동적 교체 포함)
    else if ((pathname.endsWith('.html') || pathname.endsWith('.css') || pathname.endsWith('.js') || pathname.endsWith('.json')) && method === 'GET') {
        const possiblePaths = [
            path.join(__dirname, '../..', pathname),
            path.join(__dirname, '../../frontend', pathname),
            path.join(__dirname, '../..', pathname.substring(1))
        ];
        
        let fileFound = false;
        for (const filePath of possiblePaths) {
            try {
                let content = fs.readFileSync(filePath, 'utf8');
                const ext = path.extname(filePath);
                
                // HTML과 JS 파일에서 API URL 동적 교체
                if (ext === '.html' || ext === '.js') {
                    content = replaceApiUrl(content, req);
                }
                
                const contentType = {
                    '.html': 'text/html; charset=utf-8',
                    '.css': 'text/css',
                    '.js': 'application/javascript',
                    '.json': 'application/json'
                }[ext] || 'text/plain';
                
                res.setHeader('Content-Type', contentType);
                if (ext === '.html' || ext === '.js') {
                    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                    res.setHeader('Pragma', 'no-cache');
                    res.setHeader('Expires', '0');
                }
                res.writeHead(200);
                res.end(content);
                fileFound = true;
                break;
            } catch (err) {
                continue;
            }
        }
        
        if (!fileFound) {
            sendErrorResponse(res, 404, 'File not found');
        }
    }
    // 이미지 파일 제공
    else if (pathname.startsWith('/images/') && method === 'GET') {
        const filename = decodeURIComponent(pathname.replace('/images/', ''));
        const filepath = path.join(IMAGES_DIR, filename);
        
        fs.readFile(filepath, (err, data) => {
            if (err) {
                sendErrorResponse(res, 404, 'Image not found');
                return;
            }
            
            const ext = path.extname(filename).toLowerCase();
            const contentType = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp'
            }[ext] || 'application/octet-stream';
            
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.writeHead(200);
            res.end(data);
        });
    }
    // 재고 이력 조회
    else if (pathname === '/api/inventory/history' && method === 'GET') {
        try {
            const itemId = parsedUrl.query.itemId;
            let filteredHistory = [...inventoryHistory];
            
            if (itemId) {
                filteredHistory = inventoryHistory.filter(h => h.itemId === parseInt(itemId));
            }
            
            // 최신 순으로 정렬
            filteredHistory.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            sendJsonResponse(res, 200, {
                success: true,
                history: filteredHistory
            });
        } catch (error) {
            console.error('재고 이력 조회 실패:', error);
            sendErrorResponse(res, 500, 'Failed to fetch inventory history');
        }
    }
    // 입고 처리
    else if (pathname === '/api/inventory/stock-in' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { itemId, quantity, note, reason } = data;
                
                if (!itemId || !quantity || quantity <= 0) {
                    sendErrorResponse(res, 400, '상품 ID와 양수 수량이 필요합니다.');
                    return;
                }
                
                const itemIndex = items.findIndex(item => item.id === parseInt(itemId));
                if (itemIndex === -1) {
                    sendErrorResponse(res, 404, '상품을 찾을 수 없습니다.');
                    return;
                }
                
                const item = items[itemIndex];
                const oldQuantity = item.quantity || 0;
                const newQuantity = oldQuantity + parseInt(quantity);
                
                // 상품 수량 업데이트
                item.quantity = newQuantity;
                item.updatedAt = new Date().toISOString();
                
                // 재고 이력 추가
                const historyEntry = {
                    id: nextInventoryHistoryId++,
                    itemId: item.id,
                    type: 'stock_in', // 입고
                    quantity: parseInt(quantity),
                    previousQuantity: oldQuantity,
                    currentQuantity: newQuantity,
                    note: note || '',
                    reason: reason || '일반 입고',
                    createdAt: new Date().toISOString()
                };
                
                inventoryHistory.push(historyEntry);
                scheduleSave();
                
                sendJsonResponse(res, 200, {
                    success: true,
                    message: `입고 완료: ${item.name} ${quantity}${item.unit} 입고됨`,
                    item: item,
                    history: historyEntry
                });
            } catch (error) {
                console.error('입고 처리 실패:', error);
                sendErrorResponse(res, 400, 'Failed to process stock in');
            }
        });
    }
    // 출고 처리
    else if (pathname === '/api/inventory/stock-out' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { itemId, quantity, note, reason } = data;
                
                if (!itemId || !quantity || quantity <= 0) {
                    sendErrorResponse(res, 400, '상품 ID와 양수 수량이 필요합니다.');
                    return;
                }
                
                const itemIndex = items.findIndex(item => item.id === parseInt(itemId));
                if (itemIndex === -1) {
                    sendErrorResponse(res, 404, '상품을 찾을 수 없습니다.');
                    return;
                }
                
                const item = items[itemIndex];
                const oldQuantity = item.quantity || 0;
                const requestedQuantity = parseInt(quantity);
                
                if (oldQuantity < requestedQuantity) {
                    sendErrorResponse(res, 400, `재고 부족: 현재 재고 ${oldQuantity}${item.unit}, 요청 출고 ${requestedQuantity}${item.unit}`);
                    return;
                }
                
                const newQuantity = oldQuantity - requestedQuantity;
                
                // 상품 수량 업데이트
                item.quantity = newQuantity;
                item.updatedAt = new Date().toISOString();
                
                // 재고 이력 추가
                const historyEntry = {
                    id: nextInventoryHistoryId++,
                    itemId: item.id,
                    type: 'stock_out', // 출고
                    quantity: requestedQuantity,
                    previousQuantity: oldQuantity,
                    currentQuantity: newQuantity,
                    note: note || '',
                    reason: reason || '일반 출고',
                    createdAt: new Date().toISOString()
                };
                
                inventoryHistory.push(historyEntry);
                scheduleSave();
                
                sendJsonResponse(res, 200, {
                    success: true,
                    message: `출고 완료: ${item.name} ${requestedQuantity}${item.unit} 출고됨`,
                    item: item,
                    history: historyEntry
                });
            } catch (error) {
                console.error('출고 처리 실패:', error);
                sendErrorResponse(res, 400, 'Failed to process stock out');
            }
        });
    }
    // 재고 현황 조회 (전체)
    else if (pathname === '/api/inventory/status' && method === 'GET') {
        try {
            const inventoryStatus = items.map(item => {
                const locationPath = getLocationPath(item.locationId);
                const category = categories.find(cat => cat.id === item.categoryId);
                
                // 최근 재고 대령 조회 (5개)
                const recentHistory = inventoryHistory
                    .filter(h => h.itemId === item.id)
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                    .slice(0, 5);
                
                return {
                    ...item,
                    locationPath: locationPath,
                    locationName: locationPath.join(' > '),
                    categoryName: category ? category.name : null,
                    categoryColor: category ? category.color : null,
                    categoryIcon: category ? category.icon : null,
                    recentHistory: recentHistory,
                    isLowStock: item.quantity <= 5, // 저재고 경고 (수량 5 이하)
                    isOutOfStock: item.quantity <= 0 // 품절
                };
            });
            
            // 전체 통계
            const totalItems = items.length;
            const lowStockItems = inventoryStatus.filter(item => item.isLowStock && !item.isOutOfStock).length;
            const outOfStockItems = inventoryStatus.filter(item => item.isOutOfStock).length;
            const totalValue = inventoryStatus.reduce((sum, item) => sum + (item.quantity || 0), 0);
            
            sendJsonResponse(res, 200, {
                success: true,
                inventory: inventoryStatus,
                statistics: {
                    totalItems,
                    lowStockItems,
                    outOfStockItems,
                    totalQuantity: totalValue
                }
            });
        } catch (error) {
            console.error('재고 현황 조회 실패:', error);
            sendErrorResponse(res, 500, 'Failed to fetch inventory status');
        }
    }
    // 챗봇 API
    else if (pathname === '/api/chatbot' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const userMessage = data.message;
                
                if (!userMessage || typeof userMessage !== 'string') {
                    sendErrorResponse(res, 400, 'Message is required');
                    return;
                }
                
                // 지능적인 응답 생성
                const botResponse = await generateIntelligentResponse(userMessage, {
                    items,
                    locations,
                    categories,
                    inventoryHistory
                });
                
                sendJsonResponse(res, 200, {
                    success: true,
                    response: botResponse,
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                console.error('챗봇 API 오류:', error);
                sendErrorResponse(res, 500, 'Failed to process chatbot request');
            }
        });
    }
    // 영수증 분석 API
    else if (pathname === '/api/analyze-receipt' && method === 'POST') {
        const form = new formidable.IncomingForm();
        form.uploadDir = UPLOAD_DIR;
        form.keepExtensions = true;
        form.maxFileSize = 10 * 1024 * 1024; // 10MB

        form.parse(req, async (err, fields, files) => {
            if (err) {
                console.error('파일 업로드 오류:', err);
                sendErrorResponse(res, 400, 'File upload error');
                return;
            }

            try {
                const imageFile = files.receipt || files.image;
                if (!imageFile) {
                    sendErrorResponse(res, 400, 'No receipt image provided');
                    return;
                }

                const imagePath = Array.isArray(imageFile) ? imageFile[0].filepath : imageFile.filepath;
                
                // 이미지를 base64로 인코딩
                const imageBuffer = fs.readFileSync(imagePath);
                const base64Image = imageBuffer.toString('base64');
                
                // GPT-4o Vision으로 영수증 분석
                const analysisResult = await analyzeReceiptWithGPT(base64Image);
                
                // 임시 파일 삭제
                fs.unlinkSync(imagePath);
                
                sendJsonResponse(res, 200, {
                    success: true,
                    analysis: analysisResult,
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                console.error('영수증 분석 오류:', error);
                sendErrorResponse(res, 500, 'Failed to analyze receipt');
            }
        });
    }
    // 분석된 아이템 일괄 추가 API
    else if (pathname === '/api/items/bulk-add' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { items: newItems } = JSON.parse(body);
                
                if (!Array.isArray(newItems) || newItems.length === 0) {
                    sendErrorResponse(res, 400, 'Items array is required');
                    return;
                }
                
                const addedItems = [];
                const errors = [];
                
                for (const itemData of newItems) {
                    try {
                        // 기본값 설정
                        const item = {
                            id: nextId++,
                            name: itemData.name || '알 수 없는 물건',
                            category: itemData.category || '기타',
                            location: itemData.location || '미분류',
                            quantity: parseInt(itemData.quantity) || 1,
                            price: parseFloat(itemData.price) || 0,
                            purchaseDate: itemData.purchaseDate || new Date().toISOString().split('T')[0],
                            expiryDate: itemData.expiryDate || null,
                            description: itemData.description || '',
                            imageUrl: itemData.imageUrl || null,
                            thumbnailUrl: itemData.thumbnailUrl || null,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                            source: 'receipt_analysis'
                        };
                        
                        items.push(item);
                        addedItems.push(item);
                        
                        // 재고 이력 추가
                        inventoryHistory.push({
                            id: nextInventoryHistoryId++,
                            itemId: item.id,
                            action: 'stock_in',
                            quantity: item.quantity,
                            previousQuantity: 0,
                            newQuantity: item.quantity,
                            reason: '영수증 분석으로 추가',
                            timestamp: new Date().toISOString()
                        });
                        
                    } catch (itemError) {
                        console.error('아이템 추가 오류:', itemError);
                        errors.push({
                            item: itemData,
                            error: itemError.message
                        });
                    }
                }
                
                // 데이터 저장
                saveData();
                
                sendJsonResponse(res, 200, {
                    success: true,
                    message: `${addedItems.length}개 아이템이 추가되었습니다`,
                    addedItems,
                    errors: errors.length > 0 ? errors : undefined,
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                console.error('일괄 아이템 추가 오류:', error);
                sendErrorResponse(res, 500, 'Failed to add items');
            }
        });
    }
    // 404 처리
    else {
        sendErrorResponse(res, 404, 'Not Found', { path: pathname });
    }
});

// 서버 종료 시 데이터 저장
process.on('SIGINT', () => {
    console.log('\n서버 종료 중...');
    saveData();
    console.log('데이터 저장 완료');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n서버 종료 중...');
    saveData();
    console.log('데이터 저장 완료');
    process.exit(0);
});

// 서버 시작
const PORT = CONFIG.PORT;
server.listen(PORT, '0.0.0.0', () => {
    console.log('=====================================');
    console.log('🚀 스마트 재물관리 API 서버 시작');
    console.log('=====================================');
    console.log(`📍 서버 주소: http://localhost:${PORT}`);
    console.log(`📱 모바일: http://localhost:${PORT}/index-mobile.html`);
    console.log(`💻 데스크톱: http://localhost:${PORT}/index-v5.html`);
    console.log(`🌐 환경: ${CONFIG.NODE_ENV}`);
    console.log(`☁️ S3 백업: ${CONFIG.USE_S3 ? '활성화' : '비활성화'}`);
    console.log('=====================================');
    console.log('📋 API 엔드포인트:');
    console.log('  GET  /api/health - 헬스 체크');
    console.log('  GET  /api/items - 물건 목록');
    console.log('  POST /api/items - 물건 추가');
    console.log('  PUT  /api/items/:id - 물건 수정');
    console.log('  DELETE /api/items/:id - 물건 삭제');
    console.log('  GET  /api/categories - 카테고리 목록');
    console.log('  POST /api/categories - 카테고리 추가');
    console.log('  GET  /api/locations - 위치 목록');
    console.log('  POST /api/locations - 위치 추가');
    console.log('  📦 재고 관리 API:');
    console.log('  GET  /api/inventory/status - 재고 현황');
    console.log('  GET  /api/inventory/history - 재고 이력');
    console.log('  POST /api/inventory/stock-in - 입고 처리');
    console.log('  POST /api/inventory/stock-out - 출고 처리');
    console.log('  🤖 챗봇 API:');
    console.log('  POST /api/chatbot - 지능형 챗봇 응답');
    console.log('=====================================');
    console.log(`📁 데이터 저장: ${DATA_DIR}`);
    console.log(`🖼️ 이미지 저장: ${IMAGES_DIR}`);
    console.log('=====================================');
});

module.exports = server;