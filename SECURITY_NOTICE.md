# 🔒 중요한 보안 안내사항

## ⚠️ 긴급 조치 필요

**API 키와 AWS 자격 증명이 노출되었습니다!** 즉시 다음 조치를 취하세요:

### 🔑 OpenAI API 키 보안 조치

1. **노출된 API 키 비활성화**
   - [OpenAI Platform](https://platform.openai.com/api-keys) 접속
   - 현재 사용 중인 API 키 찾기: `sk-svcacct-CJdCF0OQ...`
   - **"Delete" 버튼을 눌러 즉시 삭제**

2. **새로운 API 키 생성 및 설정**
   - OpenAI Platform에서 "Create new secret key" 클릭
   - 키 이름 설정 (예: "Family-Inventory-App")
   - 새로 생성된 키를 안전하게 설정: `./update_api_key.sh`

### 🗄️ AWS S3 자격 증명 보안 조치

1. **노출된 AWS 자격 증명 비활성화**
   - [AWS IAM 콘솔](https://console.aws.amazon.com/iam/) 접속
   - Access Key `AKIARXOJ4L252N5CNZQT` 찾기
   - **즉시 삭제** 또는 비활성화

2. **새로운 AWS 자격 증명 생성 및 설정**
   - IAM에서 새 Access Key 생성
   - 안전하게 설정: `./update_aws_credentials.sh`

### 🚀 빠른 복구 명령어
```bash
# OpenAI API 키 업데이트
./update_api_key.sh

# AWS S3 자격 증명 업데이트
./update_aws_credentials.sh

# 서비스 재시작
pm2 restart smart-inventory --update-env
```

## 🛡️ 보안 모범 사례

### ✅ 해야 할 것들
- API 키를 환경변수로만 관리
- .env 파일을 .gitignore에 포함
- 정기적으로 API 키 순환
- 사용량 모니터링 및 한도 설정

### ❌ 하지 말아야 할 것들
- 코드에 API 키 하드코딩 금지
- 채팅, 이메일, 메신저로 API 키 공유 금지
- 스크린샷에 API 키 포함 금지
- 공개 저장소에 .env 파일 업로드 금지

## 📊 현재 시스템 상태

### API 키 설정 확인 방법
1. 웹 애플리케이션 접속
2. 챗봇 기능 테스트
3. 응답 메시지 확인:
   - `🤖 OpenAI GPT-3.5-turbo 응답` ← 정상 작동
   - `🧠 고급 AI 로컬 모드` ← API 키 문제 있음

### 비용 관리
- **모델**: gpt-3.5-turbo (비용 효율적)
- **예상 비용**: 메시지당 ~$0.001-0.002
- **월 사용량**: 적정 수준에서 $5-10 범위

## 🔗 접속 URL

- **웹 애플리케이션**: https://8080-i72krmbsmpnff1c7v14w6-6532622b.e2b.dev
- **API 서버**: https://3001-i72krmbsmpnff1c7v14w6-6532622b.e2b.dev

---

**💡 참고**: 이 시스템은 API 키가 없어도 고급 로컬 AI로 작동하므로, 
새 키 설정 전에도 모든 기능을 사용할 수 있습니다.