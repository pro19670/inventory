const CACHE_NAME = 'inventory-v1.0.1';
const urlsToCache = [
    '/inventory/',
    '/inventory/index.html',
    '/inventory/index-mobile.html',
    '/inventory/index-v5.html',
    '/inventory/locations.html',
    '/inventory/categories.html',
    '/inventory/manifest.json'
];

self.addEventListener('install', event => {
    console.log('Service Worker 설치 중...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('캐시 열림:', CACHE_NAME);
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.error('캐시 추가 실패:', error);
            })
    );
    // 즉시 활성화
    self.skipWaiting();
});

self.addEventListener('fetch', event => {
    // GitHub Pages와 API 요청 구분
    if (event.request.url.includes('onrender.com')) {
        // API 요청은 항상 네트워크 우선
        event.respondWith(
            fetch(event.request)
                .catch(error => {
                    console.log('API 요청 실패, 오프라인 모드');
                    return new Response(JSON.stringify({
                        success: false,
                        message: '오프라인 상태입니다'
                    }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                })
        );
    } else {
        // 정적 파일은 캐시 우선
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    if (response) {
                        return response;
                    }
                    return fetch(event.request)
                        .catch(error => {
                            console.log('네트워크 요청 실패:', event.request.url);
                            // 기본 오프라인 페이지 반환 가능
                            return caches.match('/inventory/');
                        });
                })
        );
    }
});

self.addEventListener('activate', event => {
    console.log('Service Worker 활성화');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('오래된 캐시 삭제:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // 모든 클라이언트 즉시 제어
    return self.clients.claim();
});

// 백그라운드 동기화 (선택사항)
self.addEventListener('sync', event => {
    if (event.tag === 'background-sync') {
        console.log('백그라운드 동기화 실행');
        event.waitUntil(doBackgroundSync());
    }
});

function doBackgroundSync() {
    // 오프라인 상태에서 저장된 데이터를 서버와 동기화
    return Promise.resolve();
}