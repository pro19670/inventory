# AI물품관리 시스템 📦

현대적이고 직관적인 AI 기반 가족용 물품관리 웹 애플리케이션입니다.

## 🌟 주요 기능

### 👨‍👩‍👧‍👦 가족 계정 시스템
- **가족 기반 인증**: 각 가족별로 독립된 계정 시스템
- **역할 기반 권한**: 관리자, 부모, 자녀 역할별 차등 접근 권한
- **안전한 인증**: JWT 토큰과 bcrypt 암호화를 통한 보안

### 📱 모바일 최적화 PWA
- **반응형 디자인**: 모든 디바이스에서 완벽한 사용 경험
- **오프라인 지원**: 네트워크 연결 없이도 기본 기능 사용 가능
- **앱 설치**: 모바일 홈 화면에 앱처럼 설치 가능

### 📦 스마트 재고 관리
- **사진 기반 등록**: 카메라로 찍거나 앨범에서 선택하여 아이템 등록
- **자동 이미지 압축**: 최적화된 이미지 저장으로 빠른 로딩
- **카테고리 및 위치 관리**: 체계적인 아이템 분류 시스템
- **재고 추적**: 수량 변화 히스토리 및 알림

### 🎨 현대적 UI/UX
- **직관적 네비게이션**: 하단 탭 바를 통한 쉬운 탐색
- **일관된 디자인**: 통일된 아이콘과 색상 시스템
- **부드러운 애니메이션**: 자연스러운 화면 전환 효과

## 🚀 배포 및 접속

### GitHub Pages 배포
이 애플리케이션은 GitHub Pages를 통해 배포됩니다:

1. **저장소 설정**:
   - Repository → Settings → Pages
   - Source: Deploy from a branch
   - Branch: main / (root)

2. **접속 URL**:
   - https://your-username.github.io/family-inventory/

### 백엔드 서버
- **개발 환경**: E2B Sandbox (포트 3001)
- **프로덕션**: Render.com 또는 Railway 추천

## 🛠 기술 스택

### Frontend
- **HTML5/CSS3/JavaScript**: 순수 웹 기술 스택
- **PWA**: Service Worker를 통한 앱 경험
- **Responsive Design**: CSS Grid/Flexbox 활용

### Backend
- **Node.js**: Express.js 프레임워크
- **JWT Authentication**: 토큰 기반 인증
- **bcrypt**: 비밀번호 암호화
- **CORS**: 크로스 오리진 요청 지원

### 개발 도구
- **PM2**: 프로세스 관리
- **Git**: 버전 관리
- **GitHub Actions**: CI/CD 파이프라인

## 📋 시작하기

### 1. 저장소 클론
```bash
git clone https://github.com/your-username/family-inventory.git
cd family-inventory
```

### 2. 백엔드 설정
```bash
cd backend
npm install
npm start
```

### 3. 프론트엔드 실행
```bash
# 개발 서버 실행 (Python)
python -m http.server 8080

# 또는 Node.js 서버
npx serve . -p 8080
```

### 4. 접속
브라우저에서 `http://localhost:8080` 접속

## 👥 기본 계정

개발 및 테스트를 위한 기본 가족 계정:

### Kim 가족
- **관리자**: admin / password123
- **부모**: parent / password123  
- **자녀**: child / password123

### 역할별 권한
- **관리자**: 모든 기능 접근 가능
- **부모**: 아이템 CRUD, 카테고리/위치 관리
- **자녀**: 아이템 조회 및 추가, 개인 활동 조회

## 🔧 환경 설정

### API 엔드포인트 설정
`index.html`에서 API 기본 URL 수정:

```javascript
// 개발 환경
const API_BASE = 'http://localhost:3001';

// 프로덕션 환경
const API_BASE = 'https://your-backend-domain.com';
```

### PWA 설정
`manifest.json`에서 앱 정보 수정:

```json
{
  "name": "가족 재고 관리",
  "short_name": "재고관리",
  "start_url": "/",
  "display": "standalone"
}
```

## 📱 사용법

### 1. 로그인
- 좌측 상단 "로그인" 버튼 클릭
- 가족 계정으로 로그인

### 2. 아이템 추가
- 하단 네비게이션 바의 "+" 버튼 클릭
- 카메라 촬영 또는 앨범에서 사진 선택
- 아이템 정보 입력 후 저장

### 3. 재고 관리
- "재고관리" 탭에서 전체 아이템 조회
- 검색, 필터링, 정렬 기능 활용
- 아이템 클릭하여 상세 정보 확인

### 4. 설정
- "설정" 탭에서 카테고리, 위치 관리
- 사용자 프로필 및 앱 설정 변경

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다. 자세한 내용은 `LICENSE` 파일을 참고하세요.

## 🐛 버그 리포트 및 기능 요청

GitHub Issues를 통해 버그 리포트나 새로운 기능 요청을 해주세요.

## 📞 지원

문의사항이나 도움이 필요하시면 Issues 탭을 이용해 주세요.

---

**Made with ❤️ for families**