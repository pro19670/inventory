const http = require('http');

class APITester {
    constructor(host = 'localhost', port = 3001) {
        this.host = host;
        this.port = port;
        // ?œë²„ ?œìž‘ ??ì½˜ì†”??ì¶œë ¥??API ?¤ë? ?¬ê¸°???…ë ¥
        this.masterKey = '6ee5d0b5a85da6337563a0a93f5b0e49704db7d42b5b051f1bb374df66c58006';  // ?¤ì œ ?¤ë¡œ ë³€ê²??„ìš”
        this.readonlyKey = '2fca140596949869db396c898398ee00a787e28fe2c4c8f9b824ceecd4f1686b';  // ?¤ì œ ?¤ë¡œ ë³€ê²??„ìš”
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
            
            // ?¸ì¦ ?¤ë” ì¶”ê?
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
        console.log('?§ª API ?ŒìŠ¤???œìž‘...\n');
        console.log('?œë²„ ì£¼ì†Œ:', `http://${this.host}:${this.port}`);
        console.log('=====================================\n');
        
        const tests = [
            // 1. ê³µê°œ ?”ë“œ?¬ì¸???ŒìŠ¤??
            {
                name: 'ê³µê°œ API - ?¬ìŠ¤ ì²´í¬',
                method: 'GET',
                path: '/api/health',
                expectedStatus: 200
            },
            {
                name: 'ê³µê°œ API - ê¸°ë³¸ ?•ë³´',
                method: 'GET',
                path: '/',
                expectedStatus: 200
            },
            
            // 2. ?¸ì¦ ?¤íŒ¨ ?ŒìŠ¤??
            {
                name: '?¸ì¦ ?†ì´ ?‘ê·¼ ?œë„',
                method: 'GET',
                path: '/api/items',
                expectedStatus: 401
            },
            {
                name: '?˜ëª»??API ??,
                method: 'GET',
                path: '/api/items',
                apiKey: 'invalid-key',
                expectedStatus: 401
            },
            
            // 3. ë¡œê·¸???ŒìŠ¤??
            {
                name: 'ë¡œê·¸??- Master Key',
                method: 'POST',
                path: '/api/auth/login',
                data: { apiKey: this.masterKey },
                expectedStatus: 200,
                saveToken: true
            },
            
            // 4. ?½ê¸° ê¶Œí•œ ?ŒìŠ¤??
            {
                name: '?½ê¸° ?„ìš© ?¤ë¡œ ì¡°íšŒ',
                method: 'GET',
                path: '/api/items',
                apiKey: this.readonlyKey,
                expectedStatus: 200
            },
            {
                name: '?½ê¸° ?„ìš© ?¤ë¡œ ?°ê¸° ?œë„',
                method: 'POST',
                path: '/api/items',
                apiKey: this.readonlyKey,
                data: { name: 'Test Item' },
                expectedStatus: 403
            },
            
            // 5. Master ê¶Œí•œ ?ŒìŠ¤??
            {
                name: 'Master ?¤ë¡œ ë¬¼ê±´ ì¶”ê?',
                method: 'POST',
                path: '/api/items',
                apiKey: this.masterKey,
                data: {
                    name: '?ŒìŠ¤??ë¬¼ê±´',
                    quantity: 5,
                    description: '?ŒìŠ¤???¤ëª…'
                },
                expectedStatus: 201,
                saveItemId: true
            },
            
            // 6. ? í° ?¸ì¦ ?ŒìŠ¤??
            {
                name: '? í°?¼ë¡œ ì¡°íšŒ',
                method: 'GET',
                path: '/api/items',
                useToken: true,
                expectedStatus: 200
            },
            
            // 7. ?…ë ¥ ê²€ì¦??ŒìŠ¤??
            {
                name: '?˜ëª»???°ì´?°ë¡œ ë¬¼ê±´ ì¶”ê?',
                method: 'POST',
                path: '/api/items',
                apiKey: this.masterKey,
                data: {
                    quantity: 'not-a-number'
                },
                expectedStatus: 400
            },
            {
                name: '?„ìˆ˜ ?„ë“œ ?„ë½',
                method: 'POST',
                path: '/api/items',
                apiKey: this.masterKey,
                data: {
                    description: 'Name is missing'
                },
                expectedStatus: 400
            },
            
            // 8. ì¹´í…Œê³ ë¦¬ ?ŒìŠ¤??
            {
                name: 'ì¹´í…Œê³ ë¦¬ ëª©ë¡ ì¡°íšŒ',
                method: 'GET',
                path: '/api/categories',
                apiKey: this.readonlyKey,
                expectedStatus: 200
            },
            {
                name: 'ì¹´í…Œê³ ë¦¬ ì¶”ê?',
                method: 'POST',
                path: '/api/categories',
                apiKey: this.masterKey,
                data: {
                    name: '?ŒìŠ¤??ì¹´í…Œê³ ë¦¬',
                    color: '#FF0000',
                    icon: '?§ª'
                },
                expectedStatus: 201
            },
            
            // 9. ?„ì¹˜ ?ŒìŠ¤??
            {
                name: '?„ì¹˜ ëª©ë¡ ì¡°íšŒ',
                method: 'GET',
                path: '/api/locations',
                apiKey: this.readonlyKey,
                expectedStatus: 200
            },
            {
                name: '?„ì¹˜ ì¶”ê?',
                method: 'POST',
                path: '/api/locations',
                apiKey: this.masterKey,
                data: {
                    name: '?ŒìŠ¤???„ì¹˜'
                },
                expectedStatus: 201
            }
        ];
        
        let passed = 0;
        let failed = 0;
        let itemId = null;
        
        for (const test of tests) {
            try {
                // API ???ëŠ” ? í° ?¤ì •
                let apiKey = test.apiKey || null;
                let token = test.useToken ? this.token : null;
                
                const result = await this.request(
                    test.method,
                    test.path,
                    test.data,
                    apiKey,
                    token
                );
                
                // ? í° ?€??
                if (test.saveToken && result.body && result.body.token) {
                    this.token = result.body.token;
                    console.log('  ?’¾ ? í° ?€?¥ë¨');
                }
                
                // ?„ì´??ID ?€??
                if (test.saveItemId && result.body && result.body.item) {
                    itemId = result.body.item.id;
                    console.log('  ?’¾ ?„ì´??ID ?€?¥ë¨:', itemId);
                }
                
                // ê²°ê³¼ ?•ì¸
                if (result.status === test.expectedStatus) {
                    console.log(`??${test.name}`);
                    if (test.method === 'GET' && result.body) {
                        console.log(`   ?°ì´?? ${JSON.stringify(result.body).substring(0, 100)}...`);
                    }
                    passed++;
                } else {
                    console.log(`??${test.name}`);
                    console.log(`   ?ˆìƒ: ${test.expectedStatus}, ?¤ì œ: ${result.status}`);
                    if (result.body && result.body.error) {
                        console.log(`   ?ëŸ¬: ${result.body.error}`);
                    }
                    failed++;
                }
                
            } catch (error) {
                console.log(`??${test.name}`);
                console.log(`   ?ëŸ¬: ${error.message}`);
                failed++;
            }
            
            // ?ŒìŠ¤??ê°??œë ˆ??
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // ì¶”ê? ?ŒìŠ¤?? ?ì„±???„ì´???? œ
        if (itemId) {
            console.log('\n?§¹ ?•ë¦¬ ?‘ì—…...');
            try {
                const deleteResult = await this.request(
                    'DELETE',
                    `/api/items/${itemId}`,
                    null,
                    this.masterKey
                );
                if (deleteResult.status === 200) {
                    console.log('???ŒìŠ¤???„ì´???? œ ?„ë£Œ');
                }
            } catch (error) {
                console.log('???ŒìŠ¤???„ì´???? œ ?¤íŒ¨');
            }
        }
        
        // ê²°ê³¼ ?”ì•½
        console.log('\n=====================================');
        console.log('?“Š ?ŒìŠ¤??ê²°ê³¼');
        console.log('=====================================');
        console.log(`???±ê³µ: ${passed}ê°?);
        console.log(`???¤íŒ¨: ${failed}ê°?);
        console.log(`?“ˆ ?±ê³µë¥? ${Math.round((passed / (passed + failed)) * 100)}%`);
        console.log('=====================================');
        
        if (failed === 0) {
            console.log('\n?Ž‰ ëª¨ë“  ?ŒìŠ¤???µê³¼!');
        } else {
            console.log('\n? ï¸ ?¼ë? ?ŒìŠ¤???¤íŒ¨. ë¡œê·¸ë¥??•ì¸?˜ì„¸??');
        }
    }
}

// ?˜ê²½ ë³€?˜ì—??API ???½ê¸° (? íƒ?¬í•­)
if (process.env.TEST_MASTER_KEY) {
    APITester.prototype.masterKey = process.env.TEST_MASTER_KEY;
}
if (process.env.TEST_READONLY_KEY) {
    APITester.prototype.readonlyKey = process.env.TEST_READONLY_KEY;
}

// ?ŒìŠ¤???¤í–‰
async function main() {
    const tester = new APITester();
    
    // ?œë²„ê°€ ì¤€ë¹„ë  ?Œê¹Œì§€ ?€ê¸?
    console.log('???œë²„ ?°ê²° ?•ì¸ ì¤?..');
    let retries = 5;
    while (retries > 0) {
        try {
            const result = await tester.request('GET', '/api/health');
            if (result.status === 200) {
                console.log('???œë²„ ?°ê²° ?±ê³µ!\n');
                break;
            }
        } catch (error) {
            retries--;
            if (retries === 0) {
                console.log('???œë²„???°ê²°?????†ìŠµ?ˆë‹¤.');
                console.log('   ?œë²„ê°€ ?¤í–‰ ì¤‘ì¸ì§€ ?•ì¸?˜ì„¸??');
                process.exit(1);
            }
            console.log(`   ?¬ì‹œ??ì¤?.. (${retries}ë²??¨ìŒ)`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // ?ŒìŠ¤???¤í–‰
    await tester.runTests();
}

// ?¤í–‰
main().catch(console.error);
