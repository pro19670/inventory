# Node.js 백엔드 Docker 이미지
FROM node:18-alpine

# 작업 디렉토리 설정
WORKDIR /app

# 패키지 파일 복사
COPY package*.json ./

# 프로덕션 의존성만 설치
RUN npm ci --only=production && npm cache clean --force

# 소스 코드 복사
COPY src/ ./src/
COPY test/ ./test/

# 데이터 디렉토리 생성
RUN mkdir -p data/images data/thumbnails data/backups uploads temp

# 권한 설정
RUN chown -R node:node /app

# 비루트 사용자로 실행
USER node

# 포트 노출
EXPOSE 3001

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

# 서버 시작
CMD ["node", "src/server.js"]