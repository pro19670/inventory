// 사용자별 데이터 관리 클래스
class UserDataManager {
    constructor() {
        this.currentUser = this.getCurrentUser();
        this.userDataPrefix = this.currentUser ? `user_${this.currentUser.id}_` : 'default_';
    }
    
    getCurrentUser() {
        const profile = localStorage.getItem('userProfile');
        return profile ? JSON.parse(profile) : null;
    }
    
    // 사용자 재로드 (프로필 변경 시)
    reloadUser() {
        this.currentUser = this.getCurrentUser();
        this.userDataPrefix = this.currentUser ? `user_${this.currentUser.id}_` : 'default_';
    }
    
    // 사용자별 데이터 저장
    setUserData(key, data) {
        const userKey = this.userDataPrefix + key;
        localStorage.setItem(userKey, JSON.stringify(data));
        this.updateUserActivity();
        return true;
    }
    
    // 사용자별 데이터 불러오기
    getUserData(key, defaultValue = null) {
        const userKey = this.userDataPrefix + key;
        const data = localStorage.getItem(userKey);
        return data ? JSON.parse(data) : defaultValue;
    }
    
    // 사용자 활동 업데이트
    updateUserActivity() {
        if (this.currentUser) {
            this.currentUser.stats.lastActivity = new Date().toISOString();
            localStorage.setItem('userProfile', JSON.stringify(this.currentUser));
        }
    }
    
    // 사용자별 통계 업데이트
    updateUserStats() {
        if (!this.currentUser) return;
        
        const items = this.getUserData('items', []);
        const categories = this.getUserData('categories', []);
        const locations = this.getUserData('locations', []);
        
        this.currentUser.stats = {
            ...this.currentUser.stats,
            totalItems: items.length,
            totalCategories: categories.length,
            totalLocations: locations.length,
            lastActivity: new Date().toISOString()
        };
        
        localStorage.setItem('userProfile', JSON.stringify(this.currentUser));
    }
    
    // 데이터 내보내기
    exportUserData() {
        if (!this.currentUser) {
            alert('사용자 프로필이 없습니다.');
            return;
        }
        
        const userData = {
            profile: this.currentUser,
            items: this.getUserData('items', []),
            categories: this.getUserData('categories', []),
            locations: this.getUserData('locations', []),
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
        
        const blob = new Blob([JSON.stringify(userData, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `재물관리_${this.currentUser.name}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        
        return true;
    }
    
    // 데이터 가져오기
    importUserData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const userData = JSON.parse(e.target.result);
                    
                    // 데이터 유효성 검사
                    if (!userData.profile || !userData.items) {
                        reject(new Error('유효하지 않은 데이터 형식입니다.'));
                        return;
                    }
                    
                    // 데이터 저장
                    this.setUserData('items', userData.items);
                    this.setUserData('categories', userData.categories || []);
                    this.setUserData('locations', userData.locations || []);
                    
                    // 통계 업데이트
                    this.updateUserStats();
                    
                    resolve(userData);
                } catch (error) {
                    reject(new Error('파일을 읽는 중 오류가 발생했습니다: ' + error.message));
                }
            };
            reader.readAsText(file);
        });
    }
    
    // 모든 사용자 데이터 초기화
    resetUserData() {
        if (!this.currentUser) return false;
        
        const keys = ['items', 'categories', 'locations'];
        keys.forEach(key => {
            const userKey = this.userDataPrefix + key;
            localStorage.removeItem(userKey);
        });
        
        // 통계 초기화
        this.currentUser.stats = {
            totalItems: 0,
            totalCategories: 0,
            totalLocations: 0,
            lastActivity: new Date().toISOString()
        };
        
        localStorage.setItem('userProfile', JSON.stringify(this.currentUser));
        
        return true;
    }
    
    // 사용자 프로필 삭제
    deleteUserProfile() {
        if (!this.currentUser) return false;
        
        // 사용자 데이터 모두 삭제
        this.resetUserData();
        
        // 프로필 삭제
        localStorage.removeItem('userProfile');
        
        this.currentUser = null;
        this.userDataPrefix = 'default_';
        
        return true;
    }
    
    // 사용자 존재 확인
    hasUser() {
        return this.currentUser !== null;
    }
    
    // 사용자 정보 가져오기
    getUserInfo() {
        return this.currentUser;
    }
}

// 전역 인스턴스 생성
const userDataManager = new UserDataManager();
