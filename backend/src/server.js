require('dotenv').config();

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
    NODE_ENV: process.env.NODE_ENV || 'development'
};

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

// 공개 엔드포인트 목록
const publicEndpoints = [
    { path: '/', method: 'GET' },
    { path: '/api/health', method: 'GET' },
    { path: '/api/auth/login', method: 'POST' }
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

// 지능적인 챗봇 응답 생성
async function generateIntelligentResponse(userMessage, context) {
    const message = userMessage.toLowerCase().trim();
    const { items, locations, categories, inventoryHistory } = context;
    
    // 현재 시간
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    
    // 데이터 분석
    const totalItems = items.length;
    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalCategories = categories.length;
    const totalLocations = locations.length;
    
    // 재고 부족 아이템
    const lowStockItems = items.filter(item => (item.quantity || 0) <= 2);
    
    // 최근 입출고 이력
    const recentHistory = inventoryHistory
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5);
    
    // 인사 및 기본 상호작용
    if (message.includes('안녕') || message.includes('hi') || message.includes('hello') || message === '안녕하세요') {
        const greetings = [
            `안녕하세요! 😊 현재 시간은 ${timeStr}입니다.<br>총 ${totalItems}개의 물품을 관리하고 있어요. 무엇을 도와드릴까요?`,
            `반갑습니다! 🤗 물품관리 도우미입니다.<br>현재 ${totalCategories}개 카테고리에 ${totalItems}개 물품이 등록되어 있어요.`,
            `안녕하세요! ✨ 오늘도 물품관리를 도와드릴게요.<br>총 ${totalLocations}개 위치에 물품들이 정리되어 있습니다.`
        ];
        return greetings[Math.floor(Math.random() * greetings.length)];
    }
    
    // 재고 현황 관련
    if (message.includes('재고') || message.includes('현황') || message.includes('수량') || message.includes('얼마')) {
        let response = `📊 <strong>현재 재고 현황</strong><br><br>`;
        response += `• 전체 물품: ${totalItems}개<br>`;
        response += `• 총 수량: ${totalQuantity}개<br>`;
        response += `• 카테고리: ${totalCategories}개<br>`;
        response += `• 위치: ${totalLocations}개<br><br>`;
        
        if (lowStockItems.length > 0) {
            response += `⚠️ <strong>재고 부족 알림</strong><br>`;
            lowStockItems.slice(0, 3).forEach(item => {
                response += `• ${item.name}: ${item.quantity || 0}${item.unit || '개'}<br>`;
            });
            if (lowStockItems.length > 3) {
                response += `• 외 ${lowStockItems.length - 3}개 품목<br>`;
            }
        } else {
            response += `✅ 모든 물품의 재고가 충분합니다!`;
        }
        
        return response;
    }
    
    // 특정 물품 조회
    const foundItems = items.filter(item => 
        message.includes(item.name.toLowerCase()) || 
        item.name.toLowerCase().includes(message.replace(/재고|현황|수량|얼마|있어|없어|찾아|어디/g, '').trim())
    );
    
    if (foundItems.length > 0) {
        const item = foundItems[0];
        const category = categories.find(cat => cat.id === item.categoryId);
        const location = getLocationPath(item.locationId).join(' > ');
        
        let response = `🔍 <strong>${item.name}</strong> 정보<br><br>`;
        response += `📦 현재 수량: <strong>${item.quantity || 0}${item.unit || '개'}</strong><br>`;
        response += `🏷️ 카테고리: ${category ? category.name : '미분류'}<br>`;
        response += `📍 위치: ${location}<br>`;
        
        if (item.description) {
            response += `📝 설명: ${item.description}<br>`;
        }
        
        // 최근 이력
        const itemHistory = recentHistory.filter(h => h.itemId === item.id).slice(0, 2);
        if (itemHistory.length > 0) {
            response += `<br>📋 <strong>최근 이력</strong><br>`;
            itemHistory.forEach(history => {
                const date = new Date(history.createdAt).toLocaleDateString('ko-KR');
                const type = history.type === 'stock-in' ? '입고' : '출고';
                response += `• ${date} ${type}: ${history.quantity}${history.unit || '개'}<br>`;
            });
        }
        
        return response;
    }
    
    // 물건 추가 관련
    if (message.includes('추가') || message.includes('등록') || message.includes('새로') || message.includes('넣기')) {
        return `➕ <strong>새 물건 등록하기</strong><br><br>` +
               `1️⃣ 우측 하단 ➕ 버튼 클릭<br>` +
               `2️⃣ '📝 새 물건 등록' 선택<br>` +
               `3️⃣ 다음 정보 입력:<br>` +
               `   • 물건명 (필수)<br>` +
               `   • 카테고리 선택<br>` +
               `   • 위치 선택<br>` +
               `   • 수량 및 단위<br>` +
               `   • 설명 (선택사항)<br>` +
               `4️⃣ 저장 버튼 클릭<br><br>` +
               `💡 팁: 사진을 찍어서 물건을 등록할 수도 있어요!`;
    }
    
    // 사용/출고 관련
    if (message.includes('사용') || message.includes('출고') || message.includes('빼기') || message.includes('소모')) {
        return `📤 <strong>물건 사용(출고) 등록</strong><br><br>` +
               `<strong>방법 1: 재고관리 페이지</strong><br>` +
               `1️⃣ 하단 '재고관리' 메뉴 클릭<br>` +
               `2️⃣ '출고' 탭 선택<br>` +
               `3️⃣ 물건과 수량 선택<br>` +
               `4️⃣ 사용 목적 입력<br>` +
               `5️⃣ 등록 완료<br><br>` +
               `<strong>방법 2: 빠른 등록</strong><br>` +
               `• ➕ 버튼 > 빠른 출고 등록<br><br>` +
               `💡 출고 시 재고가 자동으로 차감됩니다!`;
    }
    
    // 위치 관련
    if (message.includes('위치') || message.includes('장소') || message.includes('어디') || message.includes('찾기')) {
        return `📍 <strong>위치 관리 시스템</strong><br><br>` +
               `<strong>계층형 위치 구조:</strong><br>` +
               `🏠 Level 0: 집, 사무실, 창고<br>` +
               `🏢 Level 1: 1층, 2층, 지하<br>` +
               `🚪 Level 2: 거실, 침실, 부엌<br>` +
               `📦 Level 3: 서랍, 선반, 냉장고<br><br>` +
               `<strong>위치 관리 방법:</strong><br>` +
               `1️⃣ 하단 '위치' 메뉴 클릭<br>` +
               `2️⃣ 새 위치 추가 또는 수정<br>` +
               `3️⃣ 상위 위치 선택<br>` +
               `4️⃣ 위치명 입력 후 저장<br><br>` +
               `💡 정확한 위치 설정으로 물건을 쉽게 찾을 수 있어요!`;
    }
    
    // 카테고리 관련
    if (message.includes('카테고리') || message.includes('분류') || message.includes('종류')) {
        const categoryList = categories.slice(0, 5).map(cat => 
            `${cat.icon || '📁'} ${cat.name}`
        ).join('<br>');
        
        return `🏷️ <strong>카테고리 관리</strong><br><br>` +
               `<strong>현재 카테고리 (${categories.length}개):</strong><br>` +
               `${categoryList}<br>` +
               `${categories.length > 5 ? `외 ${categories.length - 5}개...<br>` : ''}<br>` +
               `<strong>카테고리 추가 방법:</strong><br>` +
               `1️⃣ 하단 '카테고리' 메뉴 클릭<br>` +
               `2️⃣ ➕ 버튼으로 새 카테고리 추가<br>` +
               `3️⃣ 이름, 색상, 아이콘 설정<br><br>` +
               `💡 카테고리별로 물건을 체계적으로 관리하세요!`;
    }
    
    // 통계 관련
    if (message.includes('통계') || message.includes('분석') || message.includes('리포트') || message.includes('요약')) {
        const topCategories = categories
            .map(cat => ({
                ...cat,
                itemCount: items.filter(item => item.categoryId === cat.id).length
            }))
            .sort((a, b) => b.itemCount - a.itemCount)
            .slice(0, 3);
            
        let response = `📈 <strong>물품관리 통계</strong><br><br>`;
        response += `📊 <strong>전체 현황</strong><br>`;
        response += `• 총 물품: ${totalItems}개<br>`;
        response += `• 총 수량: ${totalQuantity}개<br>`;
        response += `• 카테고리: ${totalCategories}개<br>`;
        response += `• 위치: ${totalLocations}개<br><br>`;
        
        if (topCategories.length > 0) {
            response += `🏆 <strong>카테고리별 물품 수</strong><br>`;
            topCategories.forEach((cat, index) => {
                response += `${index + 1}. ${cat.name}: ${cat.itemCount}개<br>`;
            });
            response += `<br>`;
        }
        
        if (recentHistory.length > 0) {
            response += `📋 <strong>최근 활동</strong><br>`;
            recentHistory.slice(0, 3).forEach(history => {
                const date = new Date(history.createdAt).toLocaleDateString('ko-KR');
                const type = history.type === 'stock-in' ? '입고' : '출고';
                response += `• ${date} ${type}: ${history.quantity}${history.unit || '개'}<br>`;
            });
        }
        
        return response;
    }
    
    // 도움말
    if (message.includes('도움') || message.includes('help') || message.includes('사용법') || message.includes('매뉴얼')) {
        return `❓ <strong>물품관리 시스템 사용법</strong><br><br>` +
               `🏠 <strong>홈</strong>: 챗봇과 대화<br>` +
               `📍 <strong>위치</strong>: 물건 보관 장소 관리<br>` +
               `🏷️ <strong>카테고리</strong>: 물건 분류 관리<br>` +
               `📦 <strong>재고관리</strong>: 입고/출고 처리<br>` +
               `⚙️ <strong>설정</strong>: 앱 환경 설정<br><br>` +
               `<strong>자주 사용하는 질문:</strong><br>` +
               `• "휴지 재고 확인해줘"<br>` +
               `• "물건 추가하는 방법"<br>` +
               `• "재고 현황 보여줘"<br>` +
               `• "위치 설정하는 법"<br><br>` +
               `💬 자연스럽게 대화하듯 질문해보세요!`;
    }
    
    // 감사 인사
    if (message.includes('고마워') || message.includes('감사') || message.includes('thanks') || message.includes('thank you')) {
        const thanks = [
            `천만에요! 😊 언제든지 물품관리에 대해 궁금한 게 있으면 물어보세요!`,
            `도움이 되었다니 기뻐요! 🤗 다른 궁금한 것도 언제든 말씀해주세요.`,
            `별말씀을요! ✨ 효율적인 물품관리를 위해 항상 여기 있을게요!`
        ];
        return thanks[Math.floor(Math.random() * thanks.length)];
    }
    
    // 기본 응답 - 더 지능적이고 맥락을 고려한 응답
    const contextualResponses = [
        `🤔 "${userMessage}"에 대해 더 구체적으로 알려주시면 정확한 답변을 드릴 수 있어요!<br><br>` +
        `예를 들어:<br>` +
        `• "휴지 재고 얼마나 있어?" (특정 물품 조회)<br>` +
        `• "물건 어떻게 추가해?" (기능 사용법)<br>` +
        `• "전체 재고 현황 보여줘" (통계 요청)`,
        
        `💡 좋은 질문이네요! 다음 중 어떤 것을 도와드릴까요?<br><br>` +
        `📊 재고 현황 확인<br>` +
        `➕ 새 물건 등록<br>` +
        `📤 물건 사용 등록<br>` +
        `📍 위치 관리<br>` +
        `❓ 사용법 안내`,
        
        `🔍 "${userMessage}"와 관련해서 이런 기능들을 사용할 수 있어요:<br><br>` +
        `• 현재 ${totalItems}개 물품 관리 중<br>` +
        `• ${totalCategories}개 카테고리로 분류<br>` +
        `• ${totalLocations}개 위치에 보관<br><br>` +
        `더 구체적으로 무엇을 도와드릴까요?`
    ];
    
    return contextualResponses[Math.floor(Math.random() * contextualResponses.length)];
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
                            const fileExtension = getFileExtension(imagePart.filename || imagePart.contentType);
                            const filename = `item_${newItem.id}_${Date.now()}${fileExtension}`;
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
                                
                                newItem.imageUrl = `/images/${filename}`;
                                newItem.thumbnailUrl = `/thumbnails/${thumbnailFilename}`;
                            } catch (error) {
                                console.warn('썸네일 생성 실패:', error);
                                newItem.imageUrl = `/images/${filename}`;
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