// backend/test/api-test.js
const http = require('http');

class APITester {
    constructor(host = 'localhost', port = 3001) {
        this.host = host;
        this.port = port;
        this.masterKey = '6ee5d0b5a85da6337563a0a93f5b0e49704db7d42b5b051f1bb374df66c58006';
        this.readonlyKey = '2fca140596949869db396c898398ee00a787e28fe2c4c8f9b824ceecd4f1686b';
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
            
            if (apiKey) {
                options.headers['X-API-Key'] = apiKey;
            }
            if (token) {
                options.headers['Authorization'] = 'Bearer ' + token;
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
        console.log('API Test Starting...\n');
        console.log('Server: http://' + this.host + ':' + this.port);
        console.log('=====================================\n');
        
        const tests = [
            {
                name: 'Public API - Health Check',
                method: 'GET',
                path: '/api/health',
                expectedStatus: 200
            },
            {
                name: 'Public API - Basic Info',
                method: 'GET',
                path: '/',
                expectedStatus: 200
            },
            {
                name: 'No Auth - Should Fail',
                method: 'GET',
                path: '/api/items',
                expectedStatus: 401
            },
            {
                name: 'Invalid API Key',
                method: 'GET',
                path: '/api/items',
                apiKey: 'invalid-key',
                expectedStatus: 401
            },
            {
                name: 'Login with Master Key',
                method: 'POST',
                path: '/api/auth/login',
                data: { apiKey: this.masterKey },
                expectedStatus: 200,
                saveToken: true
            },
            {
                name: 'Read with Readonly Key',
                method: 'GET',
                path: '/api/items',
                apiKey: this.readonlyKey,
                expectedStatus: 200
            },
            {
                name: 'Write with Readonly Key - Should Fail',
                method: 'POST',
                path: '/api/items',
                apiKey: this.readonlyKey,
                data: { name: 'Test Item' },
                expectedStatus: 403
            },
            {
                name: 'Add Item with Master Key',
                method: 'POST',
                path: '/api/items',
                apiKey: this.masterKey,
                data: {
                    name: 'Test Item',
                    quantity: 5,
                    description: 'Test Description'
                },
                expectedStatus: 201,
                saveItemId: true
            },
            {
                name: 'Get Items with Token',
                method: 'GET',
                path: '/api/items',
                useToken: true,
                expectedStatus: 200
            },
            {
                name: 'Invalid Data - Should Fail',
                method: 'POST',
                path: '/api/items',
                apiKey: this.masterKey,
                data: {
                    quantity: 'not-a-number'
                },
                expectedStatus: 400
            },
            {
                name: 'Missing Required Field',
                method: 'POST',
                path: '/api/items',
                apiKey: this.masterKey,
                data: {
                    description: 'Name is missing'
                },
                expectedStatus: 400
            },
            {
                name: 'Get Categories',
                method: 'GET',
                path: '/api/categories',
                apiKey: this.readonlyKey,
                expectedStatus: 200
            },
            {
                name: 'Add Category',
                method: 'POST',
                path: '/api/categories',
                apiKey: this.masterKey,
                data: {
                    name: 'Test Category',
                    color: '#FF0000',
                    icon: 'T'
                },
                expectedStatus: 201
            },
            {
                name: 'Get Locations',
                method: 'GET',
                path: '/api/locations',
                apiKey: this.readonlyKey,
                expectedStatus: 200
            },
            {
                name: 'Add Location',
                method: 'POST',
                path: '/api/locations',
                apiKey: this.masterKey,
                data: {
                    name: 'Test Location'
                },
                expectedStatus: 201
            }
        ];
        
        let passed = 0;
        let failed = 0;
        let itemId = null;
        
        for (const test of tests) {
            try {
                let apiKey = test.apiKey || null;
                let token = test.useToken ? this.token : null;
                
                const result = await this.request(
                    test.method,
                    test.path,
                    test.data,
                    apiKey,
                    token
                );
                
                if (test.saveToken && result.body && result.body.token) {
                    this.token = result.body.token;
                    console.log('  Token saved');
                }
                
                if (test.saveItemId && result.body && result.body.item) {
                    itemId = result.body.item.id;
                    console.log('  Item ID saved: ' + itemId);
                }
                
                if (result.status === test.expectedStatus) {
                    console.log('PASS: ' + test.name);
                    passed++;
                } else {
                    console.log('FAIL: ' + test.name);
                    console.log('  Expected: ' + test.expectedStatus + ', Got: ' + result.status);
                    if (result.body && result.body.error) {
                        console.log('  Error: ' + result.body.error);
                    }
                    failed++;
                }
                
            } catch (error) {
                console.log('ERROR: ' + test.name);
                console.log('  ' + error.message);
                failed++;
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (itemId) {
            console.log('\nCleaning up...');
            try {
                const deleteResult = await this.request(
                    'DELETE',
                    '/api/items/' + itemId,
                    null,
                    this.masterKey
                );
                if (deleteResult.status === 200) {
                    console.log('Test item deleted');
                }
            } catch (error) {
                console.log('Failed to delete test item');
            }
        }
        
        console.log('\n=====================================');
        console.log('Test Results');
        console.log('=====================================');
        console.log('Passed: ' + passed);
        console.log('Failed: ' + failed);
        console.log('Success Rate: ' + Math.round((passed / (passed + failed)) * 100) + '%');
        console.log('=====================================');
        
        if (failed === 0) {
            console.log('\nAll tests passed!');
        } else {
            console.log('\nSome tests failed. Check the logs.');
        }
    }
}

async function main() {
    const tester = new APITester();
    
    console.log('Checking server connection...');
    let retries = 5;
    while (retries > 0) {
        try {
            const result = await tester.request('GET', '/api/health');
            if (result.status === 200) {
                console.log('Server connected!\n');
                break;
            }
        } catch (error) {
            retries--;
            if (retries === 0) {
                console.log('Cannot connect to server.');
                console.log('Make sure server is running.');
                process.exit(1);
            }
            console.log('Retrying... (' + retries + ' left)');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    await tester.runTests();
}

main().catch(console.error);
