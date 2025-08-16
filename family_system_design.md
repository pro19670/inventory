# 👨‍👩‍👧‍👦 가족 로그인 시스템 설계

## 🎯 시스템 목표
- 한 가족이 하나의 물품 데이터베이스를 공유
- 개별 로그인으로 사용자 구분
- 역할별 권한 관리
- 개인별 활동 추적
- 가족 통계 및 대시보드

## 🏗️ 시스템 구조

### 데이터 모델
```javascript
// 가족 (Family)
{
  id: "family_001",
  name: "김씨네 가족",
  code: "KIM2024", // 가족 초대 코드
  createdAt: "2024-01-01",
  settings: {
    language: "ko",
    timezone: "Asia/Seoul",
    currency: "KRW"
  }
}

// 사용자 (User)
{
  id: "user_001",
  familyId: "family_001",
  username: "아빠",
  email: "dad@family.com", // 선택사항
  role: "parent", // parent, child, admin
  avatar: "👨‍💼",
  preferences: {
    notifications: true,
    theme: "light"
  },
  createdAt: "2024-01-01",
  lastLogin: "2024-01-15"
}

// 물품 (Item) - 기존 + 사용자 정보
{
  id: "item_001",
  familyId: "family_001",
  name: "우유",
  category: "dairy",
  location: "냉장고",
  quantity: 2,
  addedBy: "user_001", // 등록한 사용자
  lastModifiedBy: "user_002", // 마지막 수정한 사용자
  // ... 기존 필드들
}

// 활동 로그 (Activity)
{
  id: "activity_001",
  familyId: "family_001",
  userId: "user_001",
  action: "add_item", // add_item, update_item, delete_item, stock_in, stock_out
  targetId: "item_001",
  details: {
    itemName: "우유",
    quantity: 2,
    location: "냉장고"
  },
  timestamp: "2024-01-15T10:30:00Z"
}
```

### 사용자 역할 (Roles)
```javascript
const roles = {
  admin: {
    name: "관리자",
    permissions: ["*"], // 모든 권한
    description: "가족 설정 및 사용자 관리"
  },
  parent: {
    name: "부모",
    permissions: [
      "read_items", "write_items", "delete_items",
      "manage_categories", "manage_locations",
      "view_analytics", "manage_family_settings"
    ],
    description: "전체 관리 권한"
  },
  child: {
    name: "자녀",
    permissions: [
      "read_items", "write_items", 
      "view_own_activities"
    ],
    description: "기본 사용 권한"
  },
  guest: {
    name: "손님",
    permissions: ["read_items"],
    description: "읽기 전용"
  }
};
```

## 🔐 인증 시스템

### JWT 기반 인증
```javascript
// JWT 토큰 구조
{
  userId: "user_001",
  familyId: "family_001",
  role: "parent",
  username: "아빠",
  iat: 1642234567,
  exp: 1642320967
}
```

### 로그인 플로우
1. 사용자명/비밀번호 입력
2. 서버에서 인증 확인
3. JWT 토큰 발급
4. 클라이언트에 토큰 저장
5. API 요청 시 토큰 검증

## 🏠 가족 관리 기능

### 가족 생성
- 첫 번째 사용자가 가족 생성
- 자동으로 admin 역할 부여
- 가족 초대 코드 생성

### 가족 구성원 초대
- 초대 코드 공유
- 새 구성원 등록 시 가족 자동 연결
- 역할 설정

### 가족 설정
- 가족 이름 변경
- 초대 코드 재생성
- 구성원 역할 변경
- 구성원 제거

## 📊 개인화 기능

### 개인 대시보드
- 내가 등록한 물품
- 내 활동 내역
- 개인 통계

### 가족 대시보드
- 전체 물품 현황
- 구성원별 활동
- 가족 통계

### 알림 시스템
- 재고 부족 알림
- 새 물품 등록 알림
- 가족 구성원 활동 알림