#!/bin/bash

# AI물품관리 시스템 - AWS S3 자격 증명 업데이트 스크립트

echo "🔐 AWS S3 자격 증명 업데이트 도구"
echo "=================================="

# 현재 S3 설정 확인
echo "📋 현재 S3 설정 확인 중..."
if [ -f "./backend/.env" ]; then
    use_s3=$(grep "USE_S3" ./backend/.env | cut -d'=' -f2)
    current_access_key=$(grep "AWS_ACCESS_KEY_ID" ./backend/.env | cut -d'=' -f2)
    current_bucket=$(grep "S3_BUCKET" ./backend/.env | cut -d'=' -f2)
    
    echo "S3 사용: $use_s3"
    echo "현재 Access Key: ${current_access_key:0:10}..."
    echo "S3 버킷: $current_bucket"
else
    echo "❌ .env 파일을 찾을 수 없습니다"
    exit 1
fi

echo
echo "⚠️  중요: 기존 AWS 자격 증명이 노출되었습니다!"
echo "AWS IAM 콘솔에서 기존 키를 즉시 삭제하고 새 키를 생성하세요."
echo

echo "새로운 AWS Access Key ID를 입력하세요:"
read -r new_access_key

echo "새로운 AWS Secret Access Key를 입력하세요:"
read -s -r new_secret_key

echo
echo "AWS 리전을 입력하세요 (기본값: ap-northeast-2):"
read -r new_region
new_region=${new_region:-ap-northeast-2}

echo "S3 버킷 이름을 입력하세요 (기본값: $current_bucket):"
read -r new_bucket
new_bucket=${new_bucket:-$current_bucket}

# 자격 증명 형식 검증
if [[ ! $new_access_key =~ ^AKIA[0-9A-Z]{16}$ ]]; then
    echo "❌ 올바른 AWS Access Key 형식이 아닙니다. AKIA로 시작하는 20자여야 합니다."
    exit 1
fi

if [[ ${#new_secret_key} -ne 40 ]]; then
    echo "❌ AWS Secret Access Key는 40자여야 합니다."
    exit 1
fi

echo
echo "🔄 AWS 자격 증명 업데이트 중..."

# 백엔드 .env 파일 업데이트
sed -i "s/USE_S3=.*/USE_S3=true/" ./backend/.env
sed -i "s/AWS_ACCESS_KEY_ID=.*/AWS_ACCESS_KEY_ID=$new_access_key/" ./backend/.env
sed -i "s/AWS_SECRET_ACCESS_KEY=.*/AWS_SECRET_ACCESS_KEY=$new_secret_key/" ./backend/.env
sed -i "s/AWS_REGION=.*/AWS_REGION=$new_region/" ./backend/.env
sed -i "s/S3_BUCKET=.*/S3_BUCKET=$new_bucket/" ./backend/.env

echo "✅ AWS 자격 증명이 업데이트되었습니다"

# PM2 서비스 재시작
echo "🔄 서버 재시작 중..."
pm2 restart smart-inventory --update-env

echo "✅ 서버가 재시작되었습니다"

echo
echo "🧪 S3 연결 테스트:"
echo "1. 웹 애플리케이션에서 이미지 업로드 테스트"
echo "2. 로그에서 S3 업로드 성공 메시지 확인"
echo "3. AWS S3 콘솔에서 파일 업로드 확인"
echo
echo "📊 로그 확인: pm2 logs smart-inventory --nostream"
echo "🌐 웹 애플리케이션: https://8080-i72krmbsmpnff1c7v14w6-6532622b.e2b.dev"