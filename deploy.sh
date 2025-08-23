#!/bin/bash

# Smart Inventory System - 프로덕션 배포 스크립트

set -e  # 오류 발생시 스크립트 중단

echo "🚀 Smart Inventory System 프로덕션 배포 시작..."

# 환경 변수 확인
if [ -z "$OPENAI_API_KEY" ]; then
    echo "⚠️  OPENAI_API_KEY가 설정되지 않았습니다."
fi

# 의존성 설치
echo "📦 의존성 설치 중..."
cd backend && npm ci --production

# 프로덕션 환경 설정
echo "⚙️  프로덕션 환경 설정..."
export NODE_ENV=production
export USE_CHATGPT=true
export USE_S3=true

# 데이터 디렉토리 생성
echo "📁 데이터 디렉토리 설정..."
mkdir -p data/images data/thumbnails data/backups

# 서비스 시작 (PM2 사용)
echo "🔥 서비스 시작..."
pm2 stop all || true
pm2 delete all || true

# 백엔드 서비스 시작
pm2 start ecosystem.config.js --env production

# 프론트엔드 서비스 시작 (정적 파일 서빙)
pm2 start static-server.js --name "frontend-prod" -- --port 8080

# 서비스 저장 (재부팅시 자동 시작)
pm2 save
pm2 startup

echo "✅ 배포 완료!"
echo ""
echo "📊 서비스 상태:"
pm2 status

echo ""
echo "🌐 접속 URL:"
echo "  Frontend: http://localhost:8080"
echo "  Backend:  http://localhost:3001"
echo ""
echo "📋 로그 확인: pm2 logs"
echo "🔄 재시작:   pm2 restart all"
echo "🛑 중지:     pm2 stop all"