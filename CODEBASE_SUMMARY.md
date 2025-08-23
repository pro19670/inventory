# 🏗️ Smart Inventory System - 전체 코드 요약

## 📊 **프로젝트 현황**
- **총 파일 수**: 29개 (정리 후)
- **백업 파일**: `smart-inventory-backup-20250820-1621.tar.gz` (4.5MB)
- **제거된 파일**: 38+개 (기존 67개 → 29개)

## 🗂️ **핵심 파일 구조**

### 📱 **프론트엔드 (HTML 파일들)**
```
index.html          (219KB) - 메인 애플리케이션, 채팅 기능 포함
login.html          (28KB)  - 가족 로그인 시스템
inventory.html      (38KB)  - 재고 관리 인터페이스
locations.html      (63KB)  - 위치 관리 시스템
categories.html     (29KB)  - 카테고리 관리
user-management.html (19KB) - 사용자 관리
user-profile.html   (22KB)  - 사용자 프로필
signup.html         (15KB)  - 회원가입
join.html           (17KB)  - 가족 초대 시스템
upload.html         (7KB)   - 파일 업로드
404.html            (1KB)   - 에러 페이지
```

### 🚀 **백엔드 (Node.js)**
```
backend/src/server.js       - 메인 서버 (ChatGPT 통합, 재고관리 API)
backend/src/family-auth.js  - 가족 인증 시스템
backend/package.json        - 의존성 관리
```

### ⚙️ **설정 파일들**
```
ecosystem.config.js  - PM2 프로세스 관리
manifest.json        - PWA 설정
.env                 - 환경변수
netlify.toml         - Netlify 배포 설정
vercel.json          - Vercel 배포 설정
```

## 🔑 **핵심 기능**

### 1. **ChatGPT 통합 재고 관리**
- 한국어 자연어 처리로 출고 요청 처리
- "계란 2개 출고해주세요" → 자동 재고 차감
- OpenAI GPT-3.5-turbo 모델 사용

### 2. **스마트 위치 추천**
- AI 기반 물품 위치 추천 시스템
- 물품 특성 분석하여 최적 보관 위치 제안

### 3. **가족 공유 시스템**
- 다중 가족 구성원 관리
- 역할 기반 접근 권한 (관리자/일반 사용자)
- 초대 시스템으로 가족 구성원 추가

### 4. **실시간 재고 추적**
- 입고/출고 이력 관리
- 재고 부족 알림
- 실시간 데이터 동기화

### 5. **모바일 최적화**
- PWA (Progressive Web App) 지원
- 반응형 디자인
- 터치 인터페이스 최적화

## 🛠️ **기술 스택**

### Frontend
- **HTML5/CSS3/JavaScript** - 순수 웹 기술
- **PWA** - 모바일 앱 경험
- **Service Worker** - 오프라인 지원

### Backend
- **Node.js** - 서버 런타임
- **Express.js 스타일** - HTTP 서버
- **OpenAI API** - ChatGPT 통합
- **AWS S3** - 이미지 저장
- **PM2** - 프로세스 관리

### Database
- **JSON 파일 기반** - 간단한 데이터 저장
- **메모리 캐시** - 빠른 데이터 접근

## 📋 **API 엔드포인트**

### 인증 & 사용자 관리
```
POST /api/family-auth/login        - 가족 로그인
POST /api/family-auth/signup-admin - 관리자 회원가입
POST /api/family-auth/join-family  - 가족 참여
GET  /api/family-auth/status       - 인증 상태 확인
```

### 재고 관리
```
GET  /api/items                    - 물품 목록 조회
POST /api/inventory/stock-in       - 입고 처리
POST /api/inventory/stock-out      - 출고 처리
GET  /api/inventory/history        - 재고 이력 조회
```

### AI 기능
```
POST /api/chatbot                  - ChatGPT 채팅
POST /api/receipt-analysis         - 영수증 분석 (GPT Vision)
```

### 기본 데이터
```
GET  /api/locations                - 위치 목록
GET  /api/categories               - 카테고리 목록
GET  /api/health                   - 서버 상태 확인
```

## 🔐 **보안 기능**
- 가족 단위 데이터 격리
- 토큰 기반 인증
- 역할 기반 접근 제어
- API 키 암호화 저장

## 🚀 **배포 환경**
- **개발 서버**: PM2로 관리
- **GitHub Pages**: 프론트엔드 배포
- **Netlify/Vercel**: 대안 배포 옵션

## 📝 **환경변수 설정**
```bash
# OpenAI ChatGPT
OPENAI_API_KEY=sk-...
USE_CHATGPT=true
CHATGPT_MODEL=gpt-3.5-turbo

# AWS S3 (이미지 저장)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=inventory-app-bucket
USE_S3=true

# 서버 설정
PORT=3001
NODE_ENV=development
```

## 🎯 **주요 개선사항 (파일 정리 후)**
1. ✅ 38+개 불필요한 파일 제거
2. ✅ 로그인 경로 수정 (절대 → 상대 경로)
3. ✅ GitHub Pages 호환성 개선
4. ✅ 저장소 크기 57% 감소
5. ✅ 모든 핵심 기능 정상 작동 확인

---

**📦 백업 위치**: `smart-inventory-backup-20250820-1621.tar.gz`
**📊 총 라인 수**: 약 8,000+ 줄
**💾 압축 크기**: 4.5MB