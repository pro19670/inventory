const http = require('http');

class APITester {
    constructor(host = 'localhost', port = 3001) {
        this.host = host;
        this.port = port;
        // ?�버 ?�작 ??콘솔??출력??API ?��? ?�기???�력
        this.masterKey = '6ee5d0b5a85da6337563a0a93f5b0e49704db7d42b5b051f1bb374df66c58006';  // ?�제 ?�로 변�??�요
        this.readonlyKey = '2fca140596949869db396c898398ee00a787e28fe2c4c8f9b824ceecd4f1686b';  // ?�제 ?�로 변�??�요
        this.token = null;
    }
    
    async request(method, path, data = null, apiKey = null, token = null) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.host,
                port: this.port,
                path: path,
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                }
            };
            
            // ?�증 ?�더 추�?
            if (apiKey) {
                options.headers['X-API-Key'] = apiKey;
            }
            if (token) {
                options.headers['Authorization'] = `Bearer ${token}`;
            }
            
            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            body: body ? JSON.parse(body) : null
                        });
                    } catch (e) {
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            body: body
                        });
                    }
                });
            });
            
            req.on('error', reject);
            
            if (data) {
                req.write(JSON.stringify(data));
            }
            
            req.end();
        });
    }
    
    async runTests() {
        console.log('?�� API ?�스???�작...\n');
        console.log('?�버 주소:', `http://${this.host}:${this.port}`);
        console.log('=====================================\n');
        
        const tests = [
            // 1. 공개 ?�드?�인???�스??
            {
                name: '공개 API - ?�스 체크',
                method: 'GET',
                path: '/api/health',
                expectedStatus: 200
            },
            {
                name: '공개 API - 기본 ?�보',
                method: 'GET',
                path: '/',
                expectedStatus: 200
            },
            
            // 2. ?�증 ?�패 ?�스??
            {
                name: '?�증 ?�이 ?�근 ?�도',
                method: 'GET',
                path: '/api/items',
                expectedStatus: 401
            },
            {
                name: '?�못??API ??,
                method: 'GET',
                path: '/api/items',
                apiKey: 'invalid-key',
                expectedStatus: 401
            },
            
            // 3. 로그???�스??
            {
                name: '로그??- Master Key',
                method: 'POST',
                path: '/api/auth/login',
                data: { apiKey: this.masterKey },
                expectedStatus: 200,
                saveToken: true
            },
            
            // 4. ?�기 권한 ?�스??
            {
                name: '?�기 ?�용 ?�로 조회',
                method: 'GET',
                path: '/api/items',
                apiKey: this.readonlyKey,
                expectedStatus: 200
            },
            {
                name: '?�기 ?�용 ?�로 ?�기 ?�도',
                method: 'POST',
                path: '/api/items',
                apiKey: this.readonlyKey,
                data: { name: 'Test Item' },
                expectedStatus: 403
            },
            
            // 5. Master 권한 ?�스??
            {
                name: 'Master ?�로 물건 추�?',
                method: 'POST',
                path: '/api/items',
                apiKey: this.masterKey,
                data: {
                    name: '?�스??물건',
                    quantity: 5,
                    description: '?�스???�명'
                },
                expectedStatus: 201,
                saveItemId: true
            },
            
            // 6. ?�큰 ?�증 ?�스??
            {
                name: '?�큰?�로 조회',
                method: 'GET',
                path: '/api/items',
                useToken: true,
                expectedStatus: 200
            },
            
            // 7. ?�력 검�??�스??
            {
                name: '?�못???�이?�로 물건 추�?',
                method: 'POST',
                path: '/api/items',
                apiKey: this.masterKey,
                data: {
                    quantity: 'not-a-number'
                },
                expectedStatus: 400
            },
            {
                name: '?�수 ?�드 ?�락',
                method: 'POST',
                path: '/api/items',
                apiKey: this.masterKey,
                data: {
                    description: 'Name is missing'
                },
                expectedStatus: 400
            },
            
            // 8. 카테고리 ?�스??
            {
                name: '카테고리 목록 조회',
                method: 'GET',
                path: '/api/categories',
                apiKey: this.readonlyKey,
                expectedStatus: 200
            },
            {
                name: '카테고리 추�?',
                method: 'POST',
                path: '/api/categories',
                apiKey: this.masterKey,
                data: {
                    name: '?�스??카테고리',
                    color: '#FF0000',
                    icon: '?��'
                },
                expectedStatus: 201
            },
            
            // 9. ?�치 ?�스??
            {
                name: '?�치 목록 조회',
                method: 'GET',
                path: '/api/locations',
                apiKey: this.readonlyKey,
                expectedStatus: 200
            },
            {
                name: '?�치 추�?',
                method: 'POST',
                path: '/api/locations',
                apiKey: this.masterKey,
                data: {
                    name: '?�스???�치'
                },
                expectedStatus: 201
            }
        ];
        
        let passed = 0;
        let failed = 0;
        let itemId = null;
        
        for (const test of tests) {
            try {
                // API ???�는 ?�큰 ?�정
                let apiKey = test.apiKey || null;
                let token = test.useToken ? this.token : null;
                
                const result = await this.request(
                    test.method,
                    test.path,
                    test.data,
                    apiKey,
                    token
                );
                
                // ?�큰 ?�??
                if (test.saveToken && result.body && result.body.token) {
                    this.token = result.body.token;
                    console.log('  ?�� ?�큰 ?�?�됨');
                }
                
                // ?�이??ID ?�??
                if (test.saveItemId && result.body && result.body.item) {
                    itemId = result.body.item.id;
                    console.log('  ?�� ?�이??ID ?�?�됨:', itemId);
                }
                
                // 결과 ?�인
                if (result.status === test.expectedStatus) {
                    console.log(`??${test.name}`);
                    if (test.method === 'GET' && result.body) {
                        console.log(`   ?�이?? ${JSON.stringify(result.body).substring(0, 100)}...`);
                    }
                    passed++;
                } else {
                    console.log(`??${test.name}`);
                    console.log(`   ?�상: ${test.expectedStatus}, ?�제: ${result.status}`);
                    if (result.body && result.body.error) {
                        console.log(`   ?�러: ${result.body.error}`);
                    }
                    failed++;
                }
                
            } catch (error) {
                console.log(`??${test.name}`);
                console.log(`   ?�러: ${error.message}`);
                failed++;
            }
            
            // ?�스??�??�레??
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // 추�? ?�스?? ?�성???�이????��
        if (itemId) {
            console.log('\n?�� ?�리 ?�업...');
            try {
                const deleteResult = await this.request(
                    'DELETE',
                    `/api/items/${itemId}`,
                    null,
                    this.masterKey
                );
                if (deleteResult.status === 200) {
                    console.log('???�스???�이????�� ?�료');
                }
            } catch (error) {
                console.log('???�스???�이????�� ?�패');
            }
        }
        
        // 결과 ?�약
        console.log('\n=====================================');
        console.log('?�� ?�스??결과');
        console.log('=====================================');
        console.log(`???�공: ${passed}�?);
        console.log(`???�패: ${failed}�?);
        console.log(`?�� ?�공�? ${Math.round((passed / (passed + failed)) * 100)}%`);
        console.log('=====================================');
        
        if (failed === 0) {
            console.log('\n?�� 모든 ?�스???�과!');
        } else {
            console.log('\n?�️ ?��? ?�스???�패. 로그�??�인?�세??');
        }
    }
}

// ?�경 변?�에??API ???�기 (?�택?�항)
if (process.env.TEST_MASTER_KEY) {
    APITester.prototype.masterKey = process.env.TEST_MASTER_KEY;
}
if (process.env.TEST_READONLY_KEY) {
    APITester.prototype.readonlyKey = process.env.TEST_READONLY_KEY;
}

// ?�스???�행
async function main() {
    const tester = new APITester();
    
    // ?�버가 준비될 ?�까지 ?��?
    console.log('???�버 ?�결 ?�인 �?..');
    let retries = 5;
    while (retries > 0) {
        try {
            const result = await tester.request('GET', '/api/health');
            if (result.status === 200) {
                console.log('???�버 ?�결 ?�공!\n');
                break;
            }
        } catch (error) {
            retries--;
            if (retries === 0) {
                console.log('???�버???�결?????�습?�다.');
                console.log('   ?�버가 ?�행 중인지 ?�인?�세??');
                process.exit(1);
            }
            console.log(`   ?�시??�?.. (${retries}�??�음)`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // ?�스???�행
    await tester.runTests();
}

// ?�행
main().catch(console.error);
