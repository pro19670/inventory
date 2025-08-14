// backend/src/utils/validator.js
class Validator {
    // 물건 데이터 검증
    validateItem(data) {
        const errors = [];
        
        if (!data.name || typeof data.name !== 'string') {
            errors.push('Name is required and must be a string');
        } else if (data.name.length < 1 || data.name.length > 100) {
            errors.push('Name must be between 1 and 100 characters');
        }
        
        if (data.quantity !== undefined) {
            if (typeof data.quantity !== 'number' || data.quantity < 0) {
                errors.push('Quantity must be a non-negative number');
            }
        }
        
        if (data.categoryId !== undefined && data.categoryId !== null) {
            if (typeof data.categoryId !== 'number') {
                errors.push('Category ID must be a number');
            }
        }
        
        if (data.locationId !== undefined && data.locationId !== null) {
            if (typeof data.locationId !== 'number') {
                errors.push('Location ID must be a number');
            }
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    // 파일 검증
    validateFile(file, options = {}) {
        const {
            maxSize = 10 * 1024 * 1024, // 10MB
            allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
        } = options;
        
        const errors = [];
        
        if (!file) {
            errors.push('File is required');
            return { valid: false, errors };
        }
        
        if (file.size > maxSize) {
            errors.push(`File size exceeds ${maxSize / 1024 / 1024}MB limit`);
        }
        
        if (file.mimetype && !allowedTypes.includes(file.mimetype)) {
            errors.push(`File type ${file.mimetype} is not allowed`);
        }
        
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            errors.push(`File extension ${ext} is not allowed`);
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    // SQL Injection 방지
    sanitizeString(str) {
        if (typeof str !== 'string') return str;
        
        // 위험한 문자 제거
        return str
            .replace(/[<>]/g, '') // HTML 태그 방지
            .replace(/javascript:/gi, '') // JavaScript 실행 방지
            .replace(/on\w+=/gi, '') // 이벤트 핸들러 방지
            .trim();
    }
    
    // XSS 방지
    escapeHtml(str) {
        const htmlEscapes = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '/': '&#x2F;'
        };
        
        return str.replace(/[&<>"'/]/g, char => htmlEscapes[char]);
    }
}

module.exports = Validator;
