#!/bin/bash

# AI물품관리 시스템 - OpenAI API 키 업데이트 스크립트

echo "🔑 OpenAI API 키 업데이트 도구"
echo "================================"

# 현재 API 키 상태 확인
echo "📋 현재 설정 확인 중..."
if [ -f "./backend/.env" ]; then
    current_key=$(grep "OPENAI_API_KEY" ./backend/.env | cut -d'=' -f2)
    if [[ $current_key == sk-* ]]; then
        echo "✅ API 키가 설정되어 있습니다: ${current_key:0:20}..."
    else
        echo "❌ 올바른 API 키가 설정되지 않았습니다"
    fi
else
    echo "❌ .env 파일을 찾을 수 없습니다"
    exit 1
fi

echo
echo "새로운 API 키를 입력하세요 (sk-로 시작):"
read -r new_api_key

# API 키 형식 검증
if [[ ! $new_api_key =~ ^sk-.+ ]]; then
    echo "❌ 올바른 API 키 형식이 아닙니다. sk-로 시작해야 합니다."
    exit 1
fi

echo
echo "🔄 API 키 업데이트 중..."

# 백엔드 .env 파일 업데이트
sed -i "s/OPENAI_API_KEY=.*/OPENAI_API_KEY=$new_api_key/" ./backend/.env

# 프론트엔드 .env 파일도 업데이트 (있는 경우)
if [ -f "./.env" ]; then
    sed -i "s/OPENAI_API_KEY=.*/OPENAI_API_KEY=$new_api_key/" ./.env
fi

echo "✅ API 키가 업데이트되었습니다"

# PM2 서비스 재시작
echo "🔄 서버 재시작 중..."
pm2 restart smart-inventory --update-env

echo "✅ 서버가 재시작되었습니다"

echo
echo "🧪 테스트 방법:"
echo "1. 웹 애플리케이션에서 챗봇 기능 테스트"
echo "2. 응답에 '🤖 OpenAI GPT-3.5-turbo 응답'이 표시되면 성공"
echo
echo "🌐 웹 애플리케이션 접속: https://8080-i72krmbsmpnff1c7v14w6-6532622b.e2b.dev"