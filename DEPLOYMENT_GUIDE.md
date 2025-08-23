# 📱🌐 Smart Inventory System 배포 가이드

## 🚀 **배포 옵션 종합**

### 1. 🌐 **웹 서비스 배포**

#### **A. GitHub Pages (무료)**
```bash
# 자동 배포 (이미 설정됨)
git push origin main
# ➜ https://genspark-ai-developer.github.io/smart-inventory-system/
```

#### **B. Netlify (무료/유료)**
```bash
# 1. Netlify에 GitHub 저장소 연결
# 2. 빌드 설정: 
#    Build command: npm run build
#    Publish directory: .
# 3. 환경변수 설정 (대시보드에서)
```

#### **C. Vercel (무료/유료)**
```bash
npm install -g vercel
vercel --prod
# 또는 GitHub 저장소 자동 연결
```

#### **D. AWS S3 + CloudFront**
```bash
aws s3 sync . s3://smart-inventory-bucket --delete
aws cloudfront create-invalidation --distribution-id XXXXXX --paths "/*"
```

### 2. 🔧 **백엔드 서버 배포**

#### **A. Heroku (유료)**
```bash
# Heroku CLI 설치 후
heroku create smart-inventory-backend
heroku config:set OPENAI_API_KEY=sk-...
heroku config:set USE_S3=true
git subtree push --prefix backend heroku main
```

#### **B. Railway (무료/유료)**
```bash
# railway.app에서 GitHub 저장소 연결
# 환경변수 설정 후 자동 배포
```

#### **C. DigitalOcean App Platform**
```bash
# GitHub 저장소 연결 후 자동 배포
# docker-compose.yml 사용
```

#### **D. AWS ECS/EC2**
```bash
# Docker 이미지 빌드 및 배포
docker build -t smart-inventory .
docker tag smart-inventory:latest 123456789.dkr.ecr.region.amazonaws.com/smart-inventory:latest
docker push 123456789.dkr.ecr.region.amazonaws.com/smart-inventory:latest
```

### 3. 📱 **모바일 앱 배포**

#### **A. PWA 앱 설치 (즉시 가능)**
1. 웹사이트 방문
2. 브라우저에서 "홈 화면에 추가" 클릭
3. 네이티브 앱처럼 사용

#### **B. Android APK 빌드**
```bash
# Capacitor 설치
npm install -g @capacitor/cli
npm install @capacitor/core @capacitor/android

# Android 프로젝트 추가
npx cap add android

# 빌드
npm run build
npx cap sync android
npx cap open android

# Android Studio에서 APK 빌드
# Build > Generate Signed Bundle/APK
```

#### **C. iOS 앱 빌드**
```bash
# iOS 프로젝트 추가 (macOS 필요)
npx cap add ios
npx cap sync ios
npx cap open ios

# Xcode에서 빌드 및 App Store 제출
```

#### **D. 앱 스토어 배포**
- **Google Play Store**: APK/AAB 업로드
- **Apple App Store**: Xcode를 통한 제출
- **삼성 Galaxy Store**: APK 업로드
- **Huawei AppGallery**: APK 업로드

## 🔑 **환경변수 설정**

### **필수 환경변수**
```bash
# OpenAI ChatGPT
OPENAI_API_KEY=sk-proj-...
USE_CHATGPT=true
CHATGPT_MODEL=gpt-3.5-turbo

# AWS S3 (이미지 저장)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=smart-inventory-bucket
USE_S3=true
AWS_REGION=ap-northeast-2

# 서버 설정
PORT=3001
NODE_ENV=production
```

### **선택 환경변수**
```bash
# JWT 시크릿
JWT_SECRET=your-super-secret-key

# 모니터링
SENTRY_DSN=https://...
GOOGLE_ANALYTICS_ID=GA-...

# 데이터베이스 (확장시)
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

## 🚀 **빠른 배포 스크립트**

### **전체 배포**
```bash
# 모든 설정 완료된 상태에서
./deploy.sh

# 또는 단계별 배포
npm run docker:up    # Docker로 로컬 테스트
npm run deploy       # 프로덕션 배포
```

### **웹만 배포**
```bash
# 정적 사이트만 배포
git add .
git commit -m "feat: production ready"
git push origin main
```

### **앱 빌드**
```bash
# PWA 최적화
npm run pwa:build

# 모바일 앱 빌드
npm run app:build
npm run app:build-android
```

## 📊 **성능 최적화**

### **프론트엔드**
- ✅ PWA 지원 (오프라인 작동)
- ✅ Service Worker 캐싱
- ✅ 이미지 최적화
- ✅ Gzip 압축
- ✅ CSS/JS 최적화

### **백엔드**
- ✅ PM2 클러스터 모드
- ✅ 응답 압축
- ✅ API 캐싱
- ✅ 이미지 CDN (S3)
- ✅ 헬스체크 엔드포인트

## 🔒 **보안 설정**

### **HTTPS 강제**
- Netlify/Vercel: 자동 SSL
- Custom Domain: Let's Encrypt
- Cloudflare: 무료 SSL

### **보안 헤더**
- CSP (Content Security Policy)
- HSTS (HTTP Strict Transport Security)
- X-Frame-Options
- X-XSS-Protection

## 📈 **모니터링 도구**

### **웹 분석**
```bash
# Google Analytics 4
gtag('config', 'GA-XXXXXX');

# Hotjar 히트맵
# Mixpanel 이벤트 추적
```

### **에러 추적**
```bash
# Sentry 설정
npm install @sentry/browser
```

### **성능 모니터링**
```bash
# New Relic
# DataDog
# AWS CloudWatch
```

## 🌍 **도메인 설정**

### **커스텀 도메인 구매**
1. **Namecheap/GoDaddy**에서 도메인 구매
2. DNS 설정: `smart-inventory.com`
3. SSL 인증서 자동 발급

### **서브도메인 설정**
```
www.smart-inventory.com → 프론트엔드
api.smart-inventory.com → 백엔드
app.smart-inventory.com → 모바일 앱 다운로드
```

## 📱 **앱 스토어 준비사항**

### **Google Play Store**
- 개발자 계정: $25 (1회)
- APK/AAB 파일
- 앱 설명, 스크린샷
- 개인정보처리방침

### **Apple App Store**
- 개발자 계정: $99/년
- macOS + Xcode 필요
- IPA 파일
- 앱 심사 (7-14일)

## 🎯 **배포 체크리스트**

### **배포 전 확인**
- [ ] 모든 환경변수 설정
- [ ] HTTPS 인증서 확인
- [ ] API 엔드포인트 테스트
- [ ] 모바일 반응형 확인
- [ ] 크로스 브라우저 테스트
- [ ] 성능 테스트 (Google PageSpeed)

### **배포 후 확인**
- [ ] 웹사이트 접속 테스트
- [ ] API 기능 동작 확인
- [ ] PWA 설치 테스트
- [ ] 모바일에서 접속 확인
- [ ] 검색엔진 등록 (Google Search Console)

---

## 🚀 **즉시 사용 가능한 URL들**

### **개발 환경**
- Frontend: https://3000-i72krmbsmpnff1c7v14w6-6532622b.e2b.dev
- Backend: https://3001-i72krmbsmpnff1c7v14w6-6532622b.e2b.dev

### **프로덕션 배포 가능 URL들**
- GitHub Pages: https://genspark-ai-developer.github.io/smart-inventory-system/
- Netlify: https://smart-inventory-system.netlify.app
- Vercel: https://smart-inventory-system.vercel.app

배포에 필요한 모든 설정이 완료되었습니다! 🎉