// 가족 로그인 시스템
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// JWT 시크릿 키 (실제 환경에서는 환경변수로 관리)
const JWT_SECRET = process.env.JWT_SECRET || 'family-inventory-secret-key-2024';
const JWT_EXPIRES_IN = '7d'; // 7일 유효

// 사용자 역할 정의
const ROLES = {
    admin: {
        name: "관리자",
        permissions: ["*"],
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

class FamilyAuthSystem {
    constructor() {
        this.families = new Map(); // familyId -> Family
        this.users = new Map();    // userId -> User
        this.sessions = new Map(); // sessionId -> Session
        this.activities = [];      // Activity logs
        
        // 초기 데모 데이터 생성
        this.initializeDemoData();
    }

    // 초기 데모 데이터
    initializeDemoData() {
        // 데모 가족 생성
        const demoFamily = {
            id: "family_demo",
            name: "데모 가족",
            code: "DEMO2024",
            createdAt: new Date().toISOString(),
            settings: {
                language: "ko",
                timezone: "Asia/Seoul",
                currency: "KRW"
            }
        };
        this.families.set(demoFamily.id, demoFamily);

        // 데모 사용자들 생성
        const demoUsers = [
            {
                id: "user_admin",
                familyId: "family_demo",
                username: "관리자",
                password: bcrypt.hashSync("admin123", 10),
                role: "admin",
                avatar: "👨‍💼",
                email: "admin@demo.family",
                preferences: {
                    notifications: true,
                    theme: "light"
                },
                createdAt: new Date().toISOString()
            },
            {
                id: "user_mom",
                familyId: "family_demo",
                username: "엄마",
                password: bcrypt.hashSync("mom123", 10),
                role: "parent",
                avatar: "👩‍🍳",
                preferences: {
                    notifications: true,
                    theme: "light"
                },
                createdAt: new Date().toISOString()
            },
            {
                id: "user_dad",
                familyId: "family_demo",
                username: "아빠",
                password: bcrypt.hashSync("dad123", 10),
                role: "parent",
                avatar: "👨‍💼",
                preferences: {
                    notifications: true,
                    theme: "dark"
                },
                createdAt: new Date().toISOString()
            },
            {
                id: "user_child1",
                familyId: "family_demo",
                username: "첫째",
                password: bcrypt.hashSync("child123", 10),
                role: "child",
                avatar: "👧",
                preferences: {
                    notifications: false,
                    theme: "light"
                },
                createdAt: new Date().toISOString()
            },
            {
                id: "user_child2",
                familyId: "family_demo",
                username: "둘째",
                password: bcrypt.hashSync("child123", 10),
                role: "child",
                avatar: "👦",
                preferences: {
                    notifications: false,
                    theme: "light"
                },
                createdAt: new Date().toISOString()
            }
        ];

        demoUsers.forEach(user => {
            this.users.set(user.id, user);
        });

        console.log('🏠 데모 가족 시스템 초기화 완료');
        console.log('📝 데모 계정:');
        console.log('   관리자: admin123');
        console.log('   엄마: mom123');
        console.log('   아빠: dad123');
        console.log('   첫째/둘째: child123');
    }

    // 로그인
    async login(username, password) {
        try {
            // 사용자 찾기
            const user = Array.from(this.users.values())
                .find(u => u.username === username);
            
            if (!user) {
                throw new Error('사용자를 찾을 수 없습니다');
            }

            // 비밀번호 확인
            const isValidPassword = await bcrypt.compare(password, user.password);
            if (!isValidPassword) {
                throw new Error('비밀번호가 틀렸습니다');
            }

            // JWT 토큰 생성
            const token = jwt.sign({
                userId: user.id,
                familyId: user.familyId,
                role: user.role,
                username: user.username
            }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

            // 로그인 시간 업데이트
            user.lastLogin = new Date().toISOString();

            // 활동 로그 기록
            this.logActivity(user.id, 'login', null, {
                username: user.username,
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    avatar: user.avatar,
                    familyId: user.familyId,
                    permissions: ROLES[user.role].permissions
                }
            };
        } catch (error) {
            console.error('로그인 실패:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 토큰 검증
    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = this.users.get(decoded.userId);
            
            if (!user) {
                throw new Error('사용자가 존재하지 않습니다');
            }

            return {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    avatar: user.avatar,
                    familyId: user.familyId,
                    permissions: ROLES[user.role].permissions
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 권한 확인
    hasPermission(userRole, permission) {
        const rolePermissions = ROLES[userRole]?.permissions || [];
        return rolePermissions.includes('*') || rolePermissions.includes(permission);
    }

    // 가족 구성원 목록
    getFamilyMembers(familyId) {
        return Array.from(this.users.values())
            .filter(user => user.familyId === familyId)
            .map(user => ({
                id: user.id,
                username: user.username,
                role: user.role,
                avatar: user.avatar,
                lastLogin: user.lastLogin,
                createdAt: user.createdAt
            }));
    }

    // 새 사용자 등록
    async registerUser(userData) {
        try {
            const userId = 'user_' + crypto.randomBytes(8).toString('hex');
            const hashedPassword = await bcrypt.hash(userData.password, 10);
            
            const newUser = {
                id: userId,
                familyId: userData.familyId,
                username: userData.username,
                password: hashedPassword,
                role: userData.role || 'child',
                avatar: userData.avatar || '👤',
                email: userData.email,
                preferences: {
                    notifications: true,
                    theme: 'light'
                },
                createdAt: new Date().toISOString()
            };

            this.users.set(userId, newUser);

            // 활동 로그 기록
            this.logActivity(userId, 'register', null, {
                username: newUser.username,
                role: newUser.role
            });

            return {
                success: true,
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    role: newUser.role,
                    avatar: newUser.avatar
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 활동 로그 기록
    logActivity(userId, action, targetId, details) {
        const user = this.users.get(userId);
        if (!user) return;

        const activity = {
            id: 'activity_' + crypto.randomBytes(8).toString('hex'),
            familyId: user.familyId,
            userId,
            username: user.username,
            action,
            targetId,
            details,
            timestamp: new Date().toISOString()
        };

        this.activities.push(activity);
        
        // 최대 1000개의 활동만 유지 (메모리 관리)
        if (this.activities.length > 1000) {
            this.activities = this.activities.slice(-1000);
        }
    }

    // 가족 활동 내역 조회
    getFamilyActivities(familyId, limit = 50) {
        return this.activities
            .filter(activity => activity.familyId === familyId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    // 개인 활동 내역 조회
    getUserActivities(userId, limit = 50) {
        return this.activities
            .filter(activity => activity.userId === userId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    // 가족 정보 조회
    getFamily(familyId) {
        return this.families.get(familyId);
    }

    // 사용자 정보 조회
    getUser(userId) {
        const user = this.users.get(userId);
        if (!user) return null;
        
        // 비밀번호 제외하고 반환
        const { password, ...userInfo } = user;
        return userInfo;
    }
}

module.exports = {
    FamilyAuthSystem,
    ROLES
};