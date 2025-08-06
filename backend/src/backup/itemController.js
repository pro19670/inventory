@"
class ItemController {
    constructor() {
        // 임시 메모리 저장소 (DB 연결 전)
        this.items = [];
        this.nextId = 1;
    }

    async getItems(req, res) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            data: this.items
        }));
    }

    async createItem(req, res) {
        const newItem = {
            id: this.nextId++,
            ...req.body,
            createdAt: new Date().toISOString()
        };
        
        this.items.push(newItem);
        
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            data: newItem
        }));
    }

    async getItem(req, res) {
        const id = parseInt(req.params.id);
        const item = this.items.find(i => i.id === id);
        
        if (!item) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Item not found' }));
            return;
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            data: item
        }));
    }

    async updateItem(req, res) {
        const id = parseInt(req.params.id);
        const index = this.items.findIndex(i => i.id === id);
        
        if (index === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Item not found' }));
            return;
        }
        
        this.items[index] = {
            ...this.items[index],
            ...req.body,
            updatedAt: new Date().toISOString()
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            data: this.items[index]
        }));
    }

    async deleteItem(req, res) {
        const id = parseInt(req.params.id);
        const index = this.items.findIndex(i => i.id === id);
        
        if (index === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Item not found' }));
            return;
        }
        
        this.items.splice(index, 1);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: 'Item deleted successfully'
        }));
    }
}

module.exports = new ItemController();
"@ | Out-File -FilePath backend\src\controllers\itemController.js -Encoding UTF8
