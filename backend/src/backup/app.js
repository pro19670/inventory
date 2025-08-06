const url = require('url');

class App {
    constructor() {
        this.routes = {
            GET: {},
            POST: {},
            PUT: {},
            DELETE: {}
        };
        this.setupRoutes();
    }

    setupRoutes() {
        // 라우트 정의
        this.route('GET', '/', this.handleHome.bind(this));
        this.route('GET', '/api/health', this.handleHealth.bind(this));
        this.route('GET', '/api/items', this.handleItems.bind(this));
    }

    route(method, path, handler) {
        this.routes[method][path] = handler;
    }

    async handleRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        const method = req.method;

        // CORS 헤더 설정
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // OPTIONS 요청 처리
        if (method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // 라우트 찾기
        const handler = this.routes[method][pathname];
        
        if (handler) {
            try {
                await handler(req, res);
            } catch (error) {
                console.error('Request error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not Found' }));
        }
    }

    handleHome(req, res) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            message: '물건 관리 API 서버',
            version: '1.0.0'
        }));
    }

    handleHealth(req, res) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString()
        }));
    }

    handleItems(req, res) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            items: [],
            message: 'Items endpoint working'
        }));
    }
}

module.exports = new App();