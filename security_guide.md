# 🔒 가족 공유 시 보안 가이드

## ✅ 현재 보안 상태

### 데이터 보호
- **로컬 저장**: 모든 데이터는 서버에 로컬 저장
- **외부 전송 없음**: 개인정보가 외부로 전송되지 않음
- **HTTPS 암호화**: 모든 통신이 암호화됨
- **API 키 보호**: OpenAI API 키가 .gitignore로 보호됨

### 개인정보 수집 현황
- **수집 안함**: 이름, 전화번호, 이메일 등 개인정보 미수집
- **익명 사용**: 로그인 없이 사용 가능
- **물품 정보만**: 물품명, 수량, 위치 정보만 저장

## 🏠 가족 내부 사용 권장사항

### 1. 네트워크 보안
```bash
# 가정용 라우터 보안 설정
- WiFi 패스워드 설정 (WPA3 권장)
- 게스트 네트워크 분리
- 방화벽 활성화
- 포트 포워딩 최소화
```

### 2. 접근 제어
- **가족 구성원만**: 링크를 가족에게만 공유
- **기기 보안**: 개인 기기에 화면 잠금 설정
- **브라우저 보안**: 자동 로그인 기능 주의

### 3. 데이터 백업
- **정기 백업**: 월 1회 데이터 내보내기
- **복사본 보관**: 중요 물품 목록은 별도 보관
- **클라우드 백업**: 필요시 개인 클라우드에 백업

## 🌐 공개 배포 시 추가 보안

### 환경변수 보호
```bash
# .env 파일 (절대 GitHub에 업로드 금지)
OPENAI_API_KEY=실제키
DB_PASSWORD=강력한패스워드
JWT_SECRET=랜덤시크릿키
```

### 데이터베이스 보안
```sql
-- 사용자별 권한 분리
CREATE USER 'family_read'@'localhost' IDENTIFIED BY 'strong_password';
GRANT SELECT ON inventory.* TO 'family_read'@'localhost';

CREATE USER 'family_write'@'localhost' IDENTIFIED BY 'another_strong_password';
GRANT SELECT, INSERT, UPDATE ON inventory.* TO 'family_write'@'localhost';
```

### API 보안
```javascript
// Rate Limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100 // 요청 제한
});

// CORS 설정
const cors = require('cors');
app.use(cors({
  origin: ['https://your-family-domain.com'],
  credentials: true
}));
```

## 👥 다중 사용자 보안 (향후)

### 사용자 인증
```javascript
// JWT 기반 인증
const jwt = require('jsonwebtoken');

// 가족 구성원별 역할
const roles = {
  'parent': ['read', 'write', 'delete', 'admin'],
  'child': ['read', 'write'],
  'guest': ['read']
};
```

### 개인정보 최소화
```javascript
// 개인정보 수집 최소화
const userProfile = {
  id: 'anonymous_user_1',
  role: 'family_member',
  // 실명, 연락처 등 수집하지 않음
};
```

## 🚨 주의사항

### 하지 말아야 할 것들
- ❌ 공개 SNS에 링크 공유
- ❌ 중요한 개인정보 (주민번호, 카드번호) 입력
- ❌ 공공 WiFi에서 사용
- ❌ 스크린샷을 외부에 공유

### 권장사항
- ✅ 가족 내부에서만 링크 공유
- ✅ 정기적인 데이터 백업
- ✅ 보안 업데이트 적용
- ✅ 의심스러운 접근 시 즉시 보고

## 📞 보안 사고 대응

### 의심스러운 활동 발견 시
1. **즉시 접근 중단**
2. **데이터 백업 확인**
3. **패스워드 변경**
4. **관리자에게 보고**

### 복구 절차
1. **새로운 환경 구축**
2. **백업 데이터 복원**
3. **보안 설정 강화**
4. **모니터링 강화**