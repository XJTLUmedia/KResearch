// Simple Node.js test for the web search service
// This tests the core functionality without browser dependencies

const https = require('https');
const http = require('http');

// Mock fetch for Node.js environment
global.fetch = async (url, options = {}) => {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;
        
        const req = client.request(url, {
            method: options.method || 'GET',
            headers: options.headers || {}
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    statusText: res.statusMessage,
                    json: () => Promise.resolve(JSON.parse(data)),
                    text: () => Promise.resolve(data)
                });
            });
        });
        
        req.on('error', reject);
        req.setTimeout(8000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.end();
    });
};

// Test function
async function testWebSearch() {
    console.log('🧪 Testing Web Search Service...\n');
    
    // Test individual proxy services
    const testProxies = async () => {
        console.log('📡 Testing Proxy Services:');
        const testUrl = 'https://httpbin.org/json';
        const proxies = [
            { name: 'CORS X2U', url: `https://cors.x2u.in/${testUrl}` },
            { name: 'Thing Proxy', url: `https://thingproxy.freeboard.io/fetch/${testUrl}` },
            { name: 'AllOrigins JSON', url: `https://api.allorigins.win/get?url=${encodeURIComponent(testUrl)}` },
            { name: 'AllOrigins Raw', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(testUrl)}` },
            { name: 'CORS Proxy IO', url: `https://corsproxy.io/?url=${encodeURIComponent(testUrl)}` }
        ];
        
        for (const proxy of proxies) {
            try {
                const startTime = Date.now();
                const response = await fetch(proxy.url);
                const endTime = Date.now();
                
                if (response.ok) {
                    console.log(`  ✅ ${proxy.name}: OK (${endTime - startTime}ms)`);
                } else {
                    console.log(`  ❌ ${proxy.name}: HTTP ${response.status}`);
                }
            } catch (error) {
                console.log(`  ❌ ${proxy.name}: ${error.message}`);
            }
        }
        console.log();
    };
    
    // Test direct API endpoints
    const testDirectAPIs = async () => {
        console.log('🔗 Testing Direct API Endpoints:');
        const apis = [
            { name: 'Wikipedia', url: 'https://en.wikipedia.org/w/api.php?action=opensearch&search=artificial%20intelligence&limit=3&namespace=0&format=json&origin=*' },
            { name: 'arXiv', url: 'https://export.arxiv.org/api/query?search_query=all:machine%20learning&start=0&max_results=3' }
        ];
        
        for (const api of apis) {
            try {
                const startTime = Date.now();
                const response = await fetch(api.url);
                const endTime = Date.now();
                
                if (response.ok) {
                    const data = api.name === 'arXiv' ? await response.text() : await response.json();
                    console.log(`  ✅ ${api.name}: OK (${endTime - startTime}ms) - ${typeof data === 'string' ? 'XML' : 'JSON'} response`);
                } else {
                    console.log(`  ❌ ${api.name}: HTTP ${response.status}`);
                }
            } catch (error) {
                console.log(`  ❌ ${api.name}: ${error.message}`);
            }
        }
        console.log();
    };
    
    // Test search engines that require proxies
    const testProxyRequiredAPIs = async () => {
        console.log('🌐 Testing Proxy-Required APIs:');
        const apis = [
            { name: 'DuckDuckGo', url: 'https://api.duckduckgo.com/?q=test&format=json&no_html=1&skip_disambig=1' },
            { name: 'Reddit', url: 'https://www.reddit.com/search.json?q=test&limit=5&sort=relevance' }
        ];
        
        for (const api of apis) {
            try {
                // Try with AllOrigins proxy
                const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(api.url)}`;
                const startTime = Date.now();
                const response = await fetch(proxyUrl);
                const endTime = Date.now();
                
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.contents) {
                        console.log(`  ✅ ${api.name} (via proxy): OK (${endTime - startTime}ms)`);
                    } else {
                        console.log(`  ⚠️  ${api.name} (via proxy): Empty response`);
                    }
                } else {
                    console.log(`  ❌ ${api.name} (via proxy): HTTP ${response.status}`);
                }
            } catch (error) {
                console.log(`  ❌ ${api.name} (via proxy): ${error.message}`);
            }
        }
        console.log();
    };
    
    await testProxies();
    await testDirectAPIs();
    await testProxyRequiredAPIs();
    
    console.log('✨ Web Search Service Test Complete!');
    console.log('\n💡 If you see mostly ✅ marks, the service should work well.');
    console.log('💡 If you see ❌ marks, those specific services may have issues.');
    console.log('💡 The web search service uses multiple fallbacks, so some failures are expected.');
}

// Run the test
testWebSearch().catch(console.error);
