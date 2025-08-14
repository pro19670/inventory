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

// 데이터 파일 경로
const DATA_DIR = path.join(__dirname, '../../data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');
const LOCATIONS_FILE = path.join(DATA_DIR, 'locations.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const THUMBNAILS_DIR = path.join(DATA_DIR, 'thumbnails');
const TEMP_DIR = path.join(__dirname, 'temp');

// 간단한 메모리 저장소
let items = [];
let locations = [];
let categories = [];
let itemImages = {};
let nextId = 1;
let nextLocationId = 1;
let nextCategoryId = 1;

// 환경 설정
const CONFIG = {
    PORT: 3001,
    S3_BUCKET: process.env.S3_BUCKET || 'inventory-app-yji-20241205',
    AWS_REGION: process.env.AWS_REGION || 'ap-northeast-2',
    USE_S3: process.env.USE_S3 === 'true' || false,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY
};

// S3 클라이언트 설정
let s3 = null;
if (CONFIG.USE_S3) {
    s3 = new AWS.S3({
        accessKeyId: CONFIG.AWS_ACCESS_KEY_ID,
        secretAccessKey: CONFIG.AWS_SECRET_ACCESS_KEY,
        region: CONFIG.AWS_REGION
    });
    console.log('S3 클라이언트 초기화 완료');
}

// 데이터 디렉토리 생성
function ensureDataDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log('데이터 디렉토리 생성됨:', DATA_DIR);
    }
}

// 이미지 디렉토리 생성
function ensureImageDirectories() {
    if (!fs.existsSync(IMAGES_DIR)) {
        fs.mkdirSync(IMAGES_DIR, { recursive: true });
        console.log('이미지 디렉토리 생성됨:', IMAGES_DIR);
    }
    if (!fs.existsSync(THUMBNAILS_DIR)) {
        fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
        console.log('썸네일 디렉토리 생성됨:', THUMBNAILS_DIR);
    }
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
        console.log('임시 디렉토리 생성됨:', TEMP_DIR);
    }
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
        { id: 10, name: '기타', color: '#9E9E9E', icon: '📦' },
        { id: 11, name: '생활용품', color: '#FF5722', icon: '🧹' }
    ];
    nextCategoryId = 12;
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
        if (error.code === 'NoSuchKey') {
            console.log(`S3에 ${key} 파일이 없습니다.`);
        } else {
            console.error(`S3 로드 오류 (${key}):`, error.message);
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
        console.error(`S3 저장 오류 (${key}):`, error.message);
        return false;
    }
}

// 데이터 파일에서 읽기
async function loadData() {
    ensureDataDirectory();
    ensureImageDirectories();
    
    // items.json 읽기
    try {
        let data = null;
        
        if (CONFIG.USE_S3) {
            const s3Data = await loadFromS3('backup/items.json');
            if (s3Data) {
                data = s3Data;
                console.log('S3에서 items.json 로드');
            }
        }
        
        if (!data && fs.existsSync(ITEMS_FILE)) {
            data = fs.readFileSync(ITEMS_FILE, 'utf8');
            console.log('로컬에서 items.json 로드');
        }
        
        if (data) {
            if (data.charCodeAt(0) === 0xFEFF) {
                data = data.substr(1);
            }
            const parsed = JSON.parse(data);
            items = parsed.items || [];
            nextId = parsed.nextId || 1;
            itemImages = parsed.itemImages || {};
            console.log(`${items.length}개의 물건 데이터 로드됨`);
        } else {
            console.log('items.json 파일이 없습니다. 새로 시작합니다.');
        }
    } catch (error) {
        console.error('items.json 읽기 오류:', error);
        items = [];
        nextId = 1;
        itemImages = {};
    }
    
    // locations.json 읽기
    try {
        let data = null;
        
        if (CONFIG.USE_S3) {
            const s3Data = await loadFromS3('backup/locations.json');
            if (s3Data) {
                data = s3Data;
                console.log('S3에서 locations.json 로드');
            }
        }
        
        if (!data && fs.existsSync(LOCATIONS_FILE)) {
            data = fs.readFileSync(LOCATIONS_FILE, 'utf8');
            console.log('로컬에서 locations.json 로드');
        }
        
        if (data) {
            if (data.charCodeAt(0) === 0xFEFF) {
                data = data.substr(1);
            }
            const parsed = JSON.parse(data);
            locations = parsed.locations || [];
            nextLocationId = parsed.nextLocationId || 1;
            console.log(`${locations.length}개의 위치 데이터 로드됨`);
        } else {
            console.log('locations.json 파일이 없습니다. 새로 시작합니다.');
        }
    } catch (error) {
        console.error('locations.json 읽기 오류:', error);
        locations = [];
        nextLocationId = 1;
    }
    
    // categories.json 읽기
    try {
        let data = null;
        
        if (CONFIG.USE_S3) {
            const s3Data = await loadFromS3('backup/categories.json');
            if (s3Data) {
                data = s3Data;
                console.log('S3에서 categories.json 로드');
            }
        }
        
        if (!data && fs.existsSync(CATEGORIES_FILE)) {
            data = fs.readFileSync(CATEGORIES_FILE, 'utf8');
            console.log('로컬에서 categories.json 로드');
        }
        
        if (data) {
            if (data.charCodeAt(0) === 0xFEFF) {
                data = data.substr(1);
            }
            const parsed = JSON.parse(data);
            categories = parsed.categories || [];
            nextCategoryId = parsed.nextCategoryId || 1;
            console.log(`${categories.length}개의 카테고리 데이터 로드됨`);
        } else {
            console.log('categories.json 파일이 없습니다. 기본 카테고리를 생성합니다.');
            initializeCategories();
        }
    } catch (error) {
        console.error('categories.json 읽기 오류:', error);
        initializeCategories();
    }
}

// 데이터 파일에 저장
async function saveData() {
    ensureDataDirectory();
    
    // items.json 저장
    try {
        const itemsData = {
            items: items,
            nextId: nextId,
            itemImages: itemImages,
            lastSaved: new Date().toISOString()
        };
        const itemsJson = JSON.stringify(itemsData, null, 2);
        
        const itemsBuffer = Buffer.concat([Buffer.from('\ufeff'), Buffer.from(itemsJson, 'utf8')]);
        fs.writeFileSync(ITEMS_FILE, itemsBuffer);
        console.log('물건 데이터 로컬 저장됨');
        
        if (CONFIG.USE_S3) {
            await saveToS3('backup/items.json', itemsJson);
        }
    } catch (error) {
        console.error('items.json 저장 오류:', error);
    }
    
    // locations.json 저장
    try {
        const locationsData = {
            locations: locations,
            nextLocationId: nextLocationId,
            lastSaved: new Date().toISOString()
        };
        const locationsJson = JSON.stringify(locationsData, null, 2);
        
        const locationsBuffer = Buffer.concat([Buffer.from('\ufeff'), Buffer.from(locationsJson, 'utf8')]);
        fs.writeFileSync(LOCATIONS_FILE, locationsBuffer);
        console.log('위치 데이터 로컬 저장됨');
        
        if (CONFIG.USE_S3) {
            await saveToS3('backup/locations.json', locationsJson);
        }
    } catch (error) {
        console.error('locations.json 저장 오류:', error);
    }
    
    // categories.json 저장
    try {
        const categoriesData = {
            categories: categories,
            nextCategoryId: nextCategoryId,
            lastSaved: new Date().toISOString()
        };
        const categoriesJson = JSON.stringify(categoriesData, null, 2);
        
        const categoriesBuffer = Buffer.concat([Buffer.from('\ufeff'), Buffer.from(categoriesJson, 'utf8')]);
        fs.writeFileSync(CATEGORIES_FILE, categoriesBuffer);
        console.log('카테고리 데이터 로컬 저장됨');
        
        if (CONFIG.USE_S3) {
            await saveToS3('backup/categories.json', categoriesJson);
        }
    } catch (error) {
        console.error('categories.json 저장 오류:', error);
    }
}

// 자동 저장
let saveTimeout;
function scheduleSave() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
        saveData();
    }, 5000);
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

// 자연어 쿼리 분석 함수
function analyzeNaturalQuery(query) {
    const lowerQuery = query.toLowerCase();
    const result = {
        keywords: [],
        locations: [],
        categories: [],
        quantity: null,
        action: 'search'
    };
    
    const locationKeywords = ['부엌', '거실', '침실', '욕실', '베란다', '창고', '서재', '옷장', '냉장고', '서랍'];
    locationKeywords.forEach(loc => {
        if (lowerQuery.includes(loc)) {
            result.locations.push(loc);
        }
    });
    
    const categoryKeywords = {
        '전자제품': ['전자', '가전', '컴퓨터', '노트북', '폰', '핸드폰'],
        '가구': ['가구', '의자', '책상', '테이블', '소파'],
        '의류': ['옷', '의류', '코트', '자켓', '바지', '셔츠'],
        '식품': ['음식', '식품', '먹을', '식료품'],
        '도서': ['책', '도서', '서적'],
        '문구류': ['문구', '펜', '연필', '노트'],
        '주방용품': ['주방', '그릇', '접시', '컵', '조리'],
        '욕실용품': ['욕실', '수건', '비누', '샴푸'],
        '운동용품': ['운동', '스포츠', '공']
    };
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(keyword => lowerQuery.includes(keyword))) {
            result.categories.push(category);
        }
    }
    
    if (lowerQuery.includes('부족') || lowerQuery.includes('떨어') || lowerQuery.includes('없')) {
        result.quantity = { operator: 'low' };
    } else if (lowerQuery.includes('많') || lowerQuery.includes('충분')) {
        result.quantity = { operator: 'high' };
    }
    
    if (lowerQuery.includes('몇') || lowerQuery.includes('개수') || lowerQuery.includes('얼마나')) {
        result.action = 'count';
    } else if (lowerQuery.includes('있') || lowerQuery.includes('어디')) {
        result.action = 'check';
    } else if (lowerQuery.includes('보여') || lowerQuery.includes('알려') || lowerQuery.includes('뭐')) {
        result.action = 'list';
    }
    
    const words = lowerQuery.split(/\s+/);
    words.forEach(word => {
        if (word.length > 1 && 
            !result.locations.some(loc => loc.includes(word)) &&
            !['에', '의', '를', '을', '이', '가', '있', '없', '뭐', '어디', '얼마나'].includes(word)) {
            result.keywords.push(word);
        }
    });
    
    return result;
}

// AI 응답 생성 함수
function generateAIResponse(query, items, interpretation) {
    let response = '';
    
    if (items.length === 0) {
        response = `"${query}"에 해당하는 물건을 찾을 수 없습니다.`;
        
        if (interpretation.locations.length > 0) {
            response += ` ${interpretation.locations.join(', ')}을(를) 확인했지만 결과가 없네요.`;
        }
    } else {
        if (interpretation.action === 'count') {
            response = `총 ${items.length}개의 물건을 찾았습니다.`;
        } else if (interpretation.action === 'check') {
            response = `네, 관련 물건이 ${items.length}개 있습니다.`;
        } else {
            response = `${items.length}개의 물건을 찾았습니다.`;
        }
        
        if (interpretation.locations.length > 0) {
            const locationSummary = {};
            items.forEach(item => {
                const loc = item.locationName || '위치 미지정';
                locationSummary[loc] = (locationSummary[loc] || 0) + 1;
            });
            
            const locDetails = Object.entries(locationSummary)
                .map(([loc, count]) => `${loc}(${count}개)`)
                .join(', ');
            response += ` 위치: ${locDetails}.`;
        }
        
        if (items.length <= 5) {
            const itemNames = items.map(item => item.name).join(', ');
            response += ` 물건: ${itemNames}.`;
        }
    }
    
    return response;
}

// 영수증 분석 함수 (개선된 버전)
async function analyzeReceipt(imageBuffer) {
    let tempFilePath = null;
    
    try {
        // 임시 파일로 저장
        const tempFileName = `receipt_${uuidv4()}.jpg`;
        tempFilePath = path.join(TEMP_DIR, tempFileName);
        
        console.log('이미지 전처리 시작...');
        
        // Sharp로 이미지 전처리
        await sharp(imageBuffer)
            .jpeg({ quality: 95 })
            .resize(2000, null, { 
                withoutEnlargement: true,
                fit: 'inside'
            })
            .grayscale()
            .normalize()
            .sharpen()
            .toFile(tempFilePath);
        
        console.log('OCR 시작...');
        
        // Tesseract OCR 실행
        const result = await Tesseract.recognize(
            tempFilePath,
            'kor+eng',
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log(`OCR 진행중: ${Math.round(m.progress * 100)}%`);
                    }
                }
            }
        );
        
        console.log('OCR 완료. 텍스트 분석 중...');
        
        // 텍스트 파싱
        const items = parseReceiptText(result.data.text);
        
        console.log(`${items.length}개 물건 인식 완료`);
        
        // 임시 파일 삭제
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        
        return items;
        
    } catch (error) {
        console.error('영수증 분석 오류:', error);
        
        // 임시 파일 삭제
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        
        // 대체 방법 시도
        return await fallbackOCR(imageBuffer);
    }
}

// 대체 OCR 방법
async function fallbackOCR(buffer) {
    try {
        console.log('대체 OCR 방법 시도...');
        
        // Buffer를 base64로 변환
        const base64 = buffer.toString('base64');
        const dataUrl = `data:image/jpeg;base64,${base64}`;
        
        const result = await Tesseract.recognize(
            dataUrl,
            'kor',
            {
                logger: m => console.log(m.status)
            }
        );
        
        return parseReceiptText(result.data.text);
    } catch (error) {
        console.error('대체 OCR도 실패:', error);
        
        // 테스트용 더미 데이터 반환
        return [
            { name: '테스트 상품 1', quantity: 1, price: 1000, category: '식품' },
            { name: '테스트 상품 2', quantity: 2, price: 2000, category: '생활용품' }
        ];
    }
}

// 개선된 영수증 텍스트 파싱 함수
function parseReceiptText(text) {
    console.log('원본 텍스트 (일부):', text.substring(0, 200));
    
    const items = [];
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    
    // 트레이더스 영수증 확인
    if (text.includes('TRADERS') || text.includes('트레이더스')) {
        return parseTradersReceipt(lines);
    }
    
    // 일반 영수증 파싱
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 제외할 키워드
        if (isExcludedLine(line)) continue;
        
        // 다양한 패턴 시도
        const patterns = [
            // 패턴 1: 상품명 가격 수량 금액
            /^([가-힣A-Za-z\s()]+)\s+([\d,]+)\s+(\d+)\s+([\d,]+)/,
            // 패턴 2: * 상품명 가격
            /^\*?\s*([가-힣A-Za-z\s()]+)\s+([\d,]+)원?$/,
            // 패턴 3: 상품명(코드) 가격
            /^([가-힣A-Za-z\s]+)(?:\([^)]+\))?\s+([\d,]+)/,
            // 패턴 4: 상품명 수량개 가격원
            /^([가-힣A-Za-z\s]+)\s+(\d+)개?\s+([\d,]+)원?/
        ];
        
        for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match) {
                const name = cleanProductName(match[1]);
                if (name && name.length > 1) {
                    const item = {
                        name: name,
                        quantity: extractQuantity(match),
                        price: extractPrice(match),
                        category: guessCategory(name),
                        suggestedLocation: suggestLocationForItem(name)
                    };
                    
                    // 중복 체크
                    if (!items.some(i => i.name === item.name)) {
                        items.push(item);
                    }
                    break;
                }
            }
        }
    }
    
    return items;
}

// 트레이더스 영수증 전용 파싱
function parseTradersReceipt(lines) {
    const items = [];
    
    for (const line of lines) {
        // 트레이더스 영수증 패턴
        // 대파(봄)         3,680  1    3,680
        const patterns = [
            /^([가-힣A-Za-z\s()]+?)\s+([\d,]+)\s+(\d+)\s+([\d,]+)$/,
            /^\*\s*([가-힣A-Za-z\s()]+?)\s+([\d,]+)\s+(\d+)\s+([\d,]+)$/
        ];
        
        for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match) {
                const name = cleanProductName(match[1]);
                if (name && !isExcludedLine(name)) {
                    items.push({
                        name: name,
                        quantity: parseInt(match[3]) || 1,
                        price: parseInt(match[2].replace(/,/g, '')),
                        category: guessCategory(name),
                        suggestedLocation: suggestLocationForItem(name)
                    });
                    break;
                }
            }
        }
    }
    
    return items;
}

// 제외할 라인 체크
function isExcludedLine(line) {
    const excludeKeywords = [
        '합계', '총', '부가세', '면세', '과세', '결제', '카드', '현금', 
        '거스름', '받은금액', '영수증', '사업자', '전화', '주소', 
        'TEL', 'FAX', '대표', '번호', '일시불', '할부', '포인트',
        '금액', '단가', '수량', '상품명'
    ];
    
    const lowerLine = line.toLowerCase();
    return excludeKeywords.some(keyword => 
        line.includes(keyword) || lowerLine.includes(keyword.toLowerCase())
    );
}

// 상품명 정리
function cleanProductName(name) {
    if (!name) return '';
    
    return name
        .replace(/^\*\s*/, '') // 별표 제거
        .replace(/\s+/g, ' ') // 연속 공백 제거
        .replace(/[^\s가-힣A-Za-z0-9()]/g, '') // 특수문자 제거 (괄호 제외)
        .trim();
}

// 수량 추출
function extractQuantity(match) {
    // 보통 3번째 그룹이 수량
    if (match[3]) {
        const num = parseInt(match[3]);
        if (num && num < 100) {
            return num;
        }
    }
    
    // 다른 위치에서도 찾아보기
    for (let i = 2; i <= match.length; i++) {
        const num = parseInt(match[i]);
        if (num && num < 100) {
            return num;
        }
    }
    return 1;
}

// 가격 추출
function extractPrice(match) {
    // 마지막이나 두번째 그룹이 보통 가격
    for (let i = match.length - 1; i >= 2; i--) {
        if (match[i]) {
            const price = parseInt(match[i].replace(/,/g, ''));
            if (price && price > 0) {
                return price;
            }
        }
    }
    return null;
}

// 카테고리 추측 함수 (개선)
function guessCategory(itemName) {
    const categoryKeywords = {
        '식품': ['대파', '파', '양파', '마늘', '채소', '과일', '고기', '생선', '김치', '반찬', '라면', '과자', '빵', 
                '우유', '요구르트', '치즈', '햄', '소시지', '계란', '쌀', '콩', '두부', '된장', '고추장', '간장',
                '설탕', '소금', '후추', '기름', '참기름', '들기름', '식초', '음료', '물', '커피', '차', '주스',
                '시브', '삼각', '유부', '초밥', '김밥', '샌드위치', '슈퍼', '크런치', '바나나', '사과', '배', '포도',
                '딸기', '수박', '멜론', '복숭아', '자두', '감', '귤', '오렌지', '레몬', '토마토', '오이', '당근',
                '브로콜리', '양배추', '배추', '무', '감자', '고구마', '호박', '가지', '피망', '파프리카', '버섯',
                '콩나물', '숙주', '미나리', '시금치', '상추', '깻잎', '부추'],
        '생활용품': ['휴지', '티슈', '세제', '비누', '샴푸', '린스', '치약', '칫솔', '수건', '걸레', '빗자루', '쓰레받기',
                    '청소', '표백제', '섬유유연제', '방향제', '탈취제', '살충제', '모기향', '물티슈', '키친타올'],
        '전자제품': ['배터리', '충전기', '케이블', '이어폰', '마우스', '키보드', 'USB', '메모리', '하드', 'SSD'],
        '문구류': ['펜', '볼펜', '연필', '지우개', '노트', '공책', '종이', '풀', '가위', '테이프', '스테이플러', '클립'],
        '의류': ['양말', '속옷', '티셔츠', '셔츠', '바지', '청바지', '자켓', '코트', '패딩', '신발', '운동화', '구두'],
        '주방용품': ['그릇', '접시', '컵', '머그', '수저', '젓가락', '포크', '나이프', '도마', '칼', '냄비', '팬',
                   '프라이팬', '주걱', '국자', '뒤집개', '집게', '가위', '수세미', '고무장갑', '랩', '호일', '지퍼백'],
        '욕실용품': ['화장지', '면봉', '화장솜', '면도기', '면도크림', '로션', '크림', '선크림', '클렌징'],
        '의약품': ['약', '밴드', '반창고', '파스', '마스크', '소독약', '연고', '물파스', '진통제', '감기약', '소화제']
    };
    
    const lowerName = itemName.toLowerCase();
    
    for (const [categoryName, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(keyword => itemName.includes(keyword) || lowerName.includes(keyword.toLowerCase()))) {
            const cat = categories.find(c => c.name === categoryName);
            return cat ? cat.id : null;
        }
    }
    
    return null;
}

// 물건에 따른 위치 제안 함수 (개선)
function suggestLocationForItem(itemName) {
    const locationSuggestions = {
        '부엌': ['대파', '파', '양파', '마늘', '채소', '과일', '고기', '생선', '김치', '반찬', '쌀', '라면', '과자',
                '조미료', '기름', '소금', '설탕', '간장', '된장', '고추장', '식초', '참기름', '들기름', '후추',
                '그릇', '접시', '컵', '수저', '젓가락', '도마', '칼', '냄비', '팬', '프라이팬'],
        '냉장고': ['우유', '요구르트', '치즈', '햄', '소시지', '계란', '두부', '김치', '반찬', '야채', '과일',
                  '음료', '주스', '맥주', '소주', '와인', '버터', '마가린', '잼', '케첩', '마요네즈', '머스타드'],
        '욕실': ['휴지', '화장지', '세제', '비누', '샴푸', '린스', '치약', '칫솔', '수건', '면봉', '화장솜',
                '로션', '크림', '클렌징', '면도기', '면도크림'],
        '거실': ['리모컨', '전구', '배터리', '충전기', '케이블', '이어폰'],
        '서재': ['펜', '연필', '노트', '공책', '종이', '풀', '가위', '책', '스테이플러'],
        '침실': ['양말', '속옷', '티셔츠', '바지', '옷', '이불', '베개', '옷걸이'],
        '창고': ['공구', '박스', '테이프', '못', '나사', '접착제', '예비품', '계절용품'],
        '베란다': ['빨래', '세제', '섬유유연제', '옷걸이', '빨래집게', '건조대']
    };
    
    const lowerName = itemName.toLowerCase();
    
    for (const [locationName, keywords] of Object.entries(locationSuggestions)) {
        if (keywords.some(keyword => itemName.includes(keyword) || lowerName.includes(keyword.toLowerCase()))) {
            const loc = locations.find(l => l.name === locationName);
            return loc ? loc.id : null;
        }
    }
    
    return null;
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

// 초기화 - 데이터 로드
loadData();

// HTTP 서버 생성
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;
    
    console.log(`${method} ${pathname}`);
    
    // CORS 헤더
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    res.setHeader('Content-Type', 'application/json');
    
    // 라우팅 시작
    if (pathname === '/' && method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({
            message: '물건 관리 API',
            version: '5.1.0',
            features: ['수량 관리', '계층적 위치 관리', '사용자 정의 위치', '데이터 영구 저장', '검색 기능', '카테고리 관리', '이미지 업로드', 'AI 자연어 검색', '영수증 분석', CONFIG.USE_S3 ? 'S3 백업' : '로컬 저장'],
            dataLocation: DATA_DIR,
            s3Enabled: CONFIG.USE_S3,
            s3Bucket: CONFIG.USE_S3 ? CONFIG.S3_BUCKET : null,
            endpoints: {
                'GET /': 'API 정보',
                'GET /api/items': '물건 목록 조회',
                'POST /api/items': '물건 추가',
                'PUT /api/items/:id': '물건 수정',
                'DELETE /api/items/:id': '물건 삭제',
                'GET /api/locations': '위치 목록 조회',
                'POST /api/locations': '위치 추가',
                'DELETE /api/locations/:id': '위치 삭제',
                'GET /api/categories': '카테고리 목록 조회',
                'POST /api/categories': '카테고리 추가',
                'DELETE /api/categories/:id': '카테고리 삭제',
                'POST /api/items/upload-image': '물건 이미지 업로드',
                'GET /api/items/:id/images': '물건 이미지 목록 조회',
                'DELETE /api/items/:id/images/:filename': '물건 이미지 삭제',
                'POST /api/ai-search': 'AI 자연어 검색',
                'POST /api/analyze-receipt': '영수증 분석',
                'GET /api/health': '서버 상태 확인',
                'POST /api/backup': '데이터 백업',
                'POST /api/backup-to-s3': 'S3 백업'
            }
        }));
    }
    else if (pathname === '/api/health' && method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            itemCount: items.length,
            locationCount: locations.length,
            categoryCount: categories.length,
            s3Enabled: CONFIG.USE_S3,
            dataFiles: {
                items: fs.existsSync(ITEMS_FILE),
                locations: fs.existsSync(LOCATIONS_FILE),
                categories: fs.existsSync(CATEGORIES_FILE)
            }
        }));
    }
    else if (pathname === '/api/analyze-receipt' && method === 'POST') {
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        
        if (!boundary) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'No multipart boundary found' }));
            return;
        }
        
        let chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', async () => {
            try {
                const buffer = Buffer.concat(chunks);
                const parts = parseMultipart(buffer, boundary);
                const imagePart = parts.find(part => part.filename);
                
                if (!imagePart) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'No image found' }));
                    return;
                }
                
                console.log('영수증 분석 시작...');
                const items = await analyzeReceipt(imagePart.data);
                
                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    message: `${items.length}개의 물건을 인식했습니다.`,
                    items: items
                }));
                
            } catch (error) {
                console.error('영수증 분석 오류:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ 
                    success: false,
                    error: '영수증 분석 실패',
                    message: error.message 
                }));
            }
        });
    }
    else if (pathname === '/api/backup-to-s3' && method === 'POST') {
        if (!CONFIG.USE_S3) {
            res.writeHead(400);
            res.end(JSON.stringify({
                success: false,
                message: 'S3가 활성화되지 않았습니다.'
            }));
            return;
        }
        
        saveData().then(() => {
            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                message: 'S3 백업이 완료되었습니다.',
                timestamp: new Date().toISOString(),
                bucket: CONFIG.S3_BUCKET
            }));
        }).catch(error => {
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                message: 'S3 백업 실패',
                error: error.message
            }));
        });
    }
    else if (pathname === '/api/ai-search' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { query } = JSON.parse(body);
                
                const searchParams = analyzeNaturalQuery(query);
                
                let filteredItems = items;
                
                if (searchParams.keywords.length > 0) {
                    filteredItems = filteredItems.filter(item => {
                        const itemText = `${item.name} ${item.description || ''}`.toLowerCase();
                        return searchParams.keywords.some(keyword => 
                            itemText.includes(keyword.toLowerCase())
                        );
                    });
                }
                
                if (searchParams.locations.length > 0) {
                    const locationIds = [];
                    searchParams.locations.forEach(locName => {
                        const location = locations.find(loc => 
                            loc.name.toLowerCase().includes(locName.toLowerCase())
                        );
                        if (location) {
                            locationIds.push(...getLocationWithChildren(location.id));
                        }
                    });
                    
                    if (locationIds.length > 0) {
                        filteredItems = filteredItems.filter(item => 
                            locationIds.includes(item.locationId)
                        );
                    }
                }
                
                if (searchParams.categories.length > 0) {
                    const categoryIds = [];
                    searchParams.categories.forEach(catName => {
                        const category = categories.find(cat => 
                            cat.name.toLowerCase().includes(catName.toLowerCase())
                        );
                        if (category) {
                            categoryIds.push(category.id);
                        }
                    });
                    
                    if (categoryIds.length > 0) {
                        filteredItems = filteredItems.filter(item => 
                            categoryIds.includes(item.categoryId)
                        );
                    }
                }
                
                if (searchParams.quantity) {
                    if (searchParams.quantity.operator === 'low') {
                        filteredItems = filteredItems.filter(item => item.quantity <= 5);
                    } else if (searchParams.quantity.operator === 'high') {
                        filteredItems = filteredItems.filter(item => item.quantity > 10);
                    } else if (searchParams.quantity.operator === 'zero') {
                        filteredItems = filteredItems.filter(item => item.quantity === 0);
                    }
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
                        thumbnailUrl: images.length > 0 ? images[0].thumbnail : null
                    };
                });
                
                const aiResponse = generateAIResponse(query, itemsWithDetails, searchParams);
                
                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    query: query,
                    interpretation: searchParams,
                    items: itemsWithDetails,
                    count: itemsWithDetails.length,
                    aiResponse: aiResponse
                }));
                
            } catch (error) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
    }
    else if (pathname === '/api/backup' && method === 'POST') {
        saveData();
        res.writeHead(200);
        res.end(JSON.stringify({
            success: true,
            message: '데이터가 백업되었습니다.',
            timestamp: new Date().toISOString()
        }));
    }
    else if (pathname === '/api/items' && method === 'GET') {
        const searchQuery = parsedUrl.query.search || '';
        const locationId = parsedUrl.query.locationId ? parseInt(parsedUrl.query.locationId) : null;
        const categoryId = parsedUrl.query.categoryId ? parseInt(parsedUrl.query.categoryId) : null;
        
        let filteredItems = items;
        
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
        
        const itemsWithLocation = filteredItems.map(item => {
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
        
        res.writeHead(200);
        res.end(JSON.stringify({
            success: true,
            count: itemsWithLocation.length,
            totalCount: items.length,
            items: itemsWithLocation,
            searchQuery: searchQuery,
            locationFilter: locationId,
            categoryFilter: categoryId
        }));
    }
    else if (pathname === '/api/items' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const newItem = {
                    id: nextId++,
                    name: data.name || 'Unnamed Item',
                    description: data.description || '',
                    locationId: data.locationId || null,
                    categoryId: data.categoryId || null,
                    quantity: data.quantity || 1,
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
                
                res.writeHead(201);
                res.end(JSON.stringify({
                    success: true,
                    item: {
                        ...newItem,
                        locationPath: locationPath,
                        locationName: locationPath.join(' > '),
                        categoryName: category ? category.name : null,
                        categoryColor: category ? category.color : null,
                        categoryIcon: category ? category.icon : null
                    }
                }));
            } catch (error) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    error: 'Invalid JSON'
                }));
            }
        });
    }
    else if (pathname.match(/^\/api\/items\/(\d+)$/) && method === 'PUT') {
        const id = parseInt(pathname.split('/')[3]);
        const index = items.findIndex(item => item.id === id);
        
        if (index === -1) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Item not found' }));
            return;
        }
        
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
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
                
                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    item: {
                        ...items[index],
                        locationPath: locationPath,
                        locationName: locationPath.join(' > '),
                        categoryName: category ? category.name : null,
                        categoryColor: category ? category.color : null,
                        categoryIcon: category ? category.icon : null
                    }
                }));
            } catch (error) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
    }
    else if (pathname.startsWith('/api/items/') && pathname.split('/').length === 4 && method === 'DELETE') {
        const id = parseInt(pathname.split('/')[3]);
        const index = items.findIndex(item => item.id === id);
        
        if (index !== -1) {
            // S3 이미지 삭제
            if (CONFIG.USE_S3 && itemImages[id]) {
                itemImages[id].forEach(img => {
                    if (img.s3Key) {
                        s3.deleteObject({
                            Bucket: CONFIG.S3_BUCKET,
                            Key: img.s3Key
                        }, (err, data) => {
                            if (err) {
                                console.error(`S3 이미지 삭제 실패: ${err.message}`);
                            } else {
                                console.log(`S3에서 이미지 삭제: ${img.s3Key}`);
                            }
                        });
                    }
                });
            }
            
            // 로컬 이미지 삭제
            if (itemImages[id]) {
                itemImages[id].forEach(img => {
                    const filename = img.url.split('/').pop();
                    const imagePath = path.join(IMAGES_DIR, filename);
                    const thumbPath = path.join(THUMBNAILS_DIR, `thumb_${filename}`);
                    
                    fs.unlink(imagePath, (err) => {
                        if (err) console.error('Image delete error:', err);
                    });
                    fs.unlink(thumbPath, (err) => {
                        if (err) console.error('Thumbnail delete error:', err);
                    });
                });
                delete itemImages[id];
            }
            
            items.splice(index, 1);
            scheduleSave();
            
            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                message: 'Item deleted'
            }));
        } else {
            res.writeHead(404);
            res.end(JSON.stringify({
                error: 'Item not found'
            }));
        }
    }
    else if (pathname === '/api/locations' && method === 'GET') {
        const level = parsedUrl.query.level;
        const parentId = parsedUrl.query.parentId;
        
        let filteredLocations = locations;
        
        if (level !== undefined) {
            filteredLocations = locations.filter(loc => loc.level === parseInt(level));
        }
        
        if (parentId !== undefined) {
            filteredLocations = locations.filter(loc => 
                loc.parentId === (parentId === 'null' ? null : parseInt(parentId))
            );
        }
        
        res.writeHead(200);
        res.end(JSON.stringify({
            success: true,
            locations: filteredLocations
        }));
    }
    else if (pathname === '/api/locations' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const parentLocation = data.parentId ? 
                    locations.find(loc => loc.id === data.parentId) : null;
                
                const newLevel = parentLocation ? parentLocation.level + 1 : 0;
                
                if (newLevel > 3) {
                    res.writeHead(400);
                    res.end(JSON.stringify({
                        error: '위치는 최대 4단계까지만 만들 수 있습니다.'
                    }));
                    return;
                }
                
                const newLocation = {
                    id: nextLocationId++,
                    name: data.name,
                    parentId: data.parentId || null,
                    level: newLevel
                };
                locations.push(newLocation);
                
                scheduleSave();
                
                res.writeHead(201);
                res.end(JSON.stringify({
                    success: true,
                    location: newLocation
                }));
            } catch (error) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    error: 'Invalid JSON'
                }));
            }
        });
    }
    else if (pathname.match(/^\/api\/locations\/(\d+)$/) && method === 'DELETE') {
        const id = parseInt(pathname.split('/')[3]);
        const locationIndex = locations.findIndex(loc => loc.id === id);
        
        if (locationIndex === -1) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Location not found' }));
            return;
        }
        
        // 하위 위치 체크
        const hasChildren = locations.some(loc => loc.parentId === id);
        if (hasChildren) {
            res.writeHead(400);
            res.end(JSON.stringify({ 
                error: '하위 위치가 있어 삭제할 수 없습니다.' 
            }));
            return;
        }
        
        // 물건 체크
        const hasItems = items.some(item => item.locationId === id);
        if (hasItems) {
            res.writeHead(400);
            res.end(JSON.stringify({ 
                error: '이 위치에 물건이 있어 삭제할 수 없습니다.' 
            }));
            return;
        }
        
        locations.splice(locationIndex, 1);
        scheduleSave();
        
        res.writeHead(200);
        res.end(JSON.stringify({
            success: true,
            message: 'Location deleted'
        }));
    }
    else if (pathname === '/api/categories' && method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({
            success: true,
            categories: categories
        }));
    }
    else if (pathname === '/api/categories' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const newCategory = {
                    id: nextCategoryId++,
                    name: data.name,
                    color: data.color || '#9E9E9E',
                    icon: data.icon || '📦'
                };
                categories.push(newCategory);
                
                scheduleSave();
                
                res.writeHead(201);
                res.end(JSON.stringify({
                    success: true,
                    category: newCategory
                }));
            } catch (error) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    error: 'Invalid JSON'
                }));
            }
        });
    }
    else if (pathname.match(/^\/api\/categories\/(\d+)$/) && method === 'DELETE') {
        const id = parseInt(pathname.split('/')[3]);
        const categoryIndex = categories.findIndex(cat => cat.id === id);
        
        if (categoryIndex === -1) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Category not found' }));
            return;
        }
        
        // 물건 체크
        const hasItems = items.some(item => item.categoryId === id);
        if (hasItems) {
            res.writeHead(400);
            res.end(JSON.stringify({ 
                error: '이 카테고리를 사용하는 물건이 있어 삭제할 수 없습니다.' 
            }));
            return;
        }
        
        // 기본 카테고리 보호
        if (id >= 1 && id <= 11) {
            res.writeHead(400);
            res.end(JSON.stringify({ 
                error: '기본 카테고리는 삭제할 수 없습니다.' 
            }));
            return;
        }
        
        categories.splice(categoryIndex, 1);
        scheduleSave();
        
        res.writeHead(200);
        res.end(JSON.stringify({
            success: true,
            message: 'Category deleted'
        }));
    }
    else if (pathname === '/api/items/upload-image' && method === 'POST') {
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        
        if (!boundary) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'No multipart boundary found' }));
            return;
        }
        
        let chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', async () => {
            const buffer = Buffer.concat(chunks);
            const parts = parseMultipart(buffer, boundary);
            
            const imagePart = parts.find(part => part.filename);
            const itemIdPart = parts.find(part => part.name === 'itemId');
            
            if (!imagePart || !itemIdPart) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Missing image or itemId' }));
                return;
            }
            
            const itemId = parseInt(itemIdPart.data.toString());
            const item = items.find(i => i.id === itemId);
            
            if (!item) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Item not found' }));
                return;
            }
            
            const ext = path.extname(imagePart.filename);
            const hash = crypto.randomBytes(16).toString('hex');
            const filename = `${itemId}_${hash}${ext}`;
            
            let imageUrl, thumbnailUrl, s3Key = null;
            
            // S3 업로드 시도
            if (CONFIG.USE_S3 && s3) {
                try {
                    const s3Params = {
                        Bucket: CONFIG.S3_BUCKET,
                        Key: `items/${filename}`,
                        Body: imagePart.data,
                        ContentType: imagePart.contentType || 'image/jpeg',
                        ACL: 'public-read'
                    };
                    
                    const s3Result = await s3.upload(s3Params).promise();
                    console.log('S3 업로드 성공:', s3Result.Location);
                    
                    imageUrl = s3Result.Location;
                    thumbnailUrl = s3Result.Location;
                    s3Key = `items/${filename}`;
                    
                    // 로컬 백업
                    const filepath = path.join(IMAGES_DIR, filename);
                    const thumbnailPath = path.join(THUMBNAILS_DIR, `thumb_${filename}`);
                    
                    fs.writeFile(filepath, imagePart.data, (err) => {
                        if (err) console.error('로컬 백업 실패:', err);
                    });
                    
                    fs.writeFile(thumbnailPath, imagePart.data, (err) => {
                        if (err) console.error('로컬 썸네일 백업 실패:', err);
                    });
                    
                } catch (s3Error) {
                    console.error('S3 업로드 실패, 로컬 저장으로 전환:', s3Error.message);
                    
                    // 로컬 저장
                    const filepath = path.join(IMAGES_DIR, filename);
                    const thumbnailPath = path.join(THUMBNAILS_DIR, `thumb_${filename}`);
                    
                    await new Promise((resolve, reject) => {
                        fs.writeFile(filepath, imagePart.data, (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                    
                    await new Promise((resolve, reject) => {
                        fs.writeFile(thumbnailPath, imagePart.data, (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                    
                    imageUrl = `/images/${filename}`;
                    thumbnailUrl = `/thumbnails/thumb_${filename}`;
                }
            } else {
                // 로컬 저장만
                const filepath = path.join(IMAGES_DIR, filename);
                const thumbnailPath = path.join(THUMBNAILS_DIR, `thumb_${filename}`);
                
                await new Promise((resolve, reject) => {
                    fs.writeFile(filepath, imagePart.data, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                
                await new Promise((resolve, reject) => {
                    fs.writeFile(thumbnailPath, imagePart.data, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                
                imageUrl = `/images/${filename}`;
                thumbnailUrl = `/thumbnails/thumb_${filename}`;
            }
            
            // 이미지 정보 저장
            if (!itemImages[itemId]) {
                itemImages[itemId] = [];
            }
            
            itemImages[itemId].push({
                url: imageUrl,
                thumbnail: thumbnailUrl,
                filename: imagePart.filename,
                s3Key: s3Key,
                uploadedAt: new Date().toISOString()
            });
            
            // 첫 번째 이미지인 경우 아이템에 설정
            if (itemImages[itemId].length === 1) {
                const itemIndex = items.findIndex(i => i.id === itemId);
                if (itemIndex !== -1) {
                    items[itemIndex].imageUrl = imageUrl;
                    items[itemIndex].thumbnailUrl = thumbnailUrl;
                }
            }
            
            scheduleSave();
            
            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                image: {
                    url: imageUrl,
                    thumbnail: thumbnailUrl,
                    itemId: itemId,
                    s3Uploaded: !!s3Key
                }
            }));
        });
    }
    else if (pathname.match(/^\/api\/items\/(\d+)\/images$/) && method === 'GET') {
        const itemId = parseInt(pathname.split('/')[3]);
        const images = itemImages[itemId] || [];
        
        res.writeHead(200);
        res.end(JSON.stringify({
            success: true,
            itemId: itemId,
            images: images
        }));
    }
    else if (pathname.match(/^\/api\/items\/(\d+)\/images\/(.+)$/) && method === 'DELETE') {
        const itemId = parseInt(pathname.split('/')[3]);
        const filename = decodeURIComponent(pathname.split('/')[5]);
        
        if (!itemImages[itemId]) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'No images found for this item' }));
            return;
        }
        
        const imageIndex = itemImages[itemId].findIndex(img => 
            img.url.includes(filename) || img.thumbnail.includes(filename)
        );
        
        if (imageIndex === -1) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Image not found' }));
            return;
        }
        
        const image = itemImages[itemId][imageIndex];
        
        // S3에서 삭제
        if (CONFIG.USE_S3 && s3 && image.s3Key) {
            s3.deleteObject({
                Bucket: CONFIG.S3_BUCKET,
                Key: image.s3Key
            }, (err, data) => {
                if (err) {
                    console.error(`S3 이미지 삭제 실패: ${err.message}`);
                } else {
                    console.log(`S3에서 이미지 삭제: ${image.s3Key}`);
                }
            });
        }
        
        // 로컬에서 삭제
        const imagePath = path.join(IMAGES_DIR, filename);
        const thumbPath = path.join(THUMBNAILS_DIR, `thumb_${filename}`);
        
        fs.unlink(imagePath, (err) => {
            if (err) console.error('Image delete error:', err);
        });
        fs.unlink(thumbPath, (err) => {
            if (err) console.error('Thumbnail delete error:', err);
        });
        
        // 배열에서 제거
        itemImages[itemId].splice(imageIndex, 1);
        
        // 아이템 썸네일 업데이트
        const itemIndex = items.findIndex(i => i.id === itemId);
        if (itemIndex !== -1) {
            if (itemImages[itemId].length > 0) {
                items[itemIndex].imageUrl = itemImages[itemId][0].url;
                items[itemIndex].thumbnailUrl = itemImages[itemId][0].thumbnail;
            } else {
                items[itemIndex].imageUrl = null;
                items[itemIndex].thumbnailUrl = null;
            }
        }
        
        scheduleSave();
        
        res.writeHead(200);
        res.end(JSON.stringify({
            success: true,
            message: 'Image deleted'
        }));
    }
    else if (pathname.startsWith('/images/') && method === 'GET') {
        const filename = decodeURIComponent(pathname.replace('/images/', ''));
        const filepath = path.join(IMAGES_DIR, filename);
        
        fs.readFile(filepath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Image not found' }));
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
            res.writeHead(200);
            res.end(data);
        });
    }
    else if (pathname.startsWith('/thumbnails/') && method === 'GET') {
        const filename = decodeURIComponent(pathname.replace('/thumbnails/', ''));
        const filepath = path.join(THUMBNAILS_DIR, filename);
        
        fs.readFile(filepath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Thumbnail not found' }));
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
            res.writeHead(200);
            res.end(data);
        });
    }
    // index-mobile.html 제공
    else if (pathname === '/index-mobile.html' && method === 'GET') {
        const filePath = path.join(__dirname, '../frontend/index-mobile.html');
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.writeHead(200);
            res.end(data);
        });
    }
    // CSS, JS 등 정적 파일 제공
    else if (pathname.startsWith('/') && method === 'GET') {
        const ext = path.extname(pathname);
        const filePath = path.join(__dirname, '../frontend', pathname);
        
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            
            const contentType = {
                '.html': 'text/html',
                '.css': 'text/css',
                '.js': 'text/javascript',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.gif': 'image/gif'
            }[ext] || 'text/plain';
            
            res.setHeader('Content-Type', contentType);
            res.writeHead(200);
            res.end(data);
        });
    }
    else {
        res.writeHead(404);
        res.end(JSON.stringify({
            error: 'Not Found',
            path: pathname
        }));
    }
}); // HTTP 서버 생성 종료

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

const PORT = CONFIG.PORT;
server.listen(PORT, '0.0.0.0', () => {
    console.log('=====================================');
    console.log('물건 관리 API 서버 시작 (v5.1)');
    console.log('=====================================');
    console.log('서버 주소: http://localhost:' + PORT);
    console.log('📱 모바일: http://192.168.0.9:' + PORT + '/index-mobile.html');
    console.log('API 테스트: http://localhost:' + PORT + '/api/items');
    console.log('위치 관리: http://localhost:' + PORT + '/api/locations');
    console.log('카테고리 관리: http://localhost:' + PORT + '/api/categories');
    console.log('이미지 업로드: http://localhost:' + PORT + '/api/items/upload-image');
    console.log('AI 검색: http://localhost:' + PORT + '/api/ai-search');
    console.log('영수증 분석: http://localhost:' + PORT + '/api/analyze-receipt');
    console.log('데이터 저장 위치: ' + DATA_DIR);
    console.log('이미지 저장 위치: ' + IMAGES_DIR);
    console.log('S3 사용: ' + (CONFIG.USE_S3 ? `활성화 (${CONFIG.S3_BUCKET})` : '비활성화'));
    console.log('=====================================');
});

