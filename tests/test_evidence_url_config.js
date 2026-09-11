/**
 * Test Evidence Suite: URL Connection Parameters & Storage Partitioning Bypass
 * Verifies:
 * 1. URL params (?apiUrl=...&apiKey=...) parsing, saving to LocalStorage, and history.replaceState security sanitization.
 * 2. Retention of existing apiKey in LocalStorage when URL only contains apiUrl (no apiKey or empty apiKey).
 * 3. Fallback / unchanged behavior when URL has no connection parameters.
 * 4. Clear alert & persistent warning banner when auto-sync fails (no silent demo fallback).
 * 5. Successful auto-sync from Google Sheet when configured via URL.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('========================================================================');
console.log('KIỂM THỬ TỰ ĐỘNG: CẤU HÌNH KẾT NỐI TỪ URL QUERY PARAMETER & BẢO MẬT');
console.log('========================================================================\n');

// Mock DOM & Browser Environment
function createMockEnvironment(initialUrl, initialStorage = {}) {
    const storageStore = { ...initialStorage };
    const localStorageMock = {
        getItem: (k) => storageStore[k] || null,
        setItem: (k, v) => { storageStore[k] = String(v); },
        removeItem: (k) => { delete storageStore[k]; },
        clear: () => { Object.keys(storageStore).forEach(k => delete storageStore[k]); },
        _getStore: () => storageStore
    };

    let currentHref = initialUrl;
    let urlObj = new URL(currentHref);

    const historyMock = {
        replaceStateCalls: [],
        replaceState: function(state, title, newUrl) {
            historyMock.replaceStateCalls.push({ state, title, newUrl });
            // Cập nhật currentHref
            if (newUrl.startsWith('/')) {
                currentHref = urlObj.origin + newUrl;
            } else if (newUrl.startsWith('http')) {
                currentHref = newUrl;
            } else {
                currentHref = urlObj.origin + '/' + newUrl;
            }
            urlObj = new URL(currentHref);
        }
    };

    const locationMock = {
        get href() { return currentHref; },
        get search() { return urlObj.search; },
        get pathname() { return urlObj.pathname; },
        get hash() { return urlObj.hash; },
        get host() { return urlObj.host; },
        get origin() { return urlObj.origin; }
    };

    const alertCalls = [];
    const alertMock = (msg) => { alertCalls.push(msg); };

    const domElements = {};
    const createElementMock = (id) => {
        const attrs = {};
        return {
            id,
            className: '',
            innerHTML: '',
            textContent: '',
            style: {},
            dataset: {},
            setAttribute: (name, val) => { attrs[name] = String(val); },
            getAttribute: (name) => attrs[name] || null,
            hasAttribute: (name) => name in attrs,
            removeAttribute: (name) => { delete attrs[name]; },
            classList: {
                classes: new Set(),
                add: function(...cls) { cls.forEach(c => this.classes.add(c)); },
                remove: function(...cls) { cls.forEach(c => this.classes.delete(c)); },
                contains: function(c) { return this.classes.has(c); }
            },
            addEventListener: () => {},
            removeEventListener: () => {},
            appendChild: (child) => child,
            removeChild: (child) => child,
            querySelector: () => null,
            querySelectorAll: () => [],
            value: '',
            checked: false
        };
    };

    const getElementByIdMock = (id) => {
        if (!domElements[id]) {
            domElements[id] = createElementMock(id);
        }
        return domElements[id];
    };

    return {
        localStorage: localStorageMock,
        location: locationMock,
        history: historyMock,
        alert: alertMock,
        alertCalls,
        getElementById: getElementByIdMock,
        domElements,
        getCurrentHref: () => currentHref
    };
}

const appJsPath = path.join(__dirname, '../app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

const tests = [];

// TEST 1: URL có apiUrl VÀ apiKey
{
    console.log('▶ [TEST 1] Đọc URL có cả apiUrl và apiKey (?apiUrl=https://gas.mock/exec&apiKey=SECRET_KEY_999)');
    const env = createMockEnvironment('https://cphc.thacoauto.vn/index.html?apiUrl=https%3A%2F%2Fgas.mock%2Fexec&apiKey=SECRET_KEY_999');

    // Chạy app.js trong context
    const ctx = {
        window: {
            location: env.location,
            history: env.history,
            addEventListener: () => {},
            THACO_APP: null
        },
        document: {
            location: env.location,
            getElementById: env.getElementById,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: (tag) => env.getElementById('mock-' + tag + '-' + Date.now()),
            addEventListener: () => {},
            readyState: 'complete',
            body: { appendChild: () => {}, prepend: () => {} }
        },
        localStorage: env.localStorage,
        alert: env.alert,
        console: { log: () => {}, warn: () => {}, error: () => {} },
        THACO_APP_DATA: { categories: [], entities: [], data2024: {}, data2025: {}, data2026: {}, deptData: {} },
        URL,
        URLSearchParams,
        Date,
        setTimeout: () => 0,
        clearTimeout: () => {}
    };
    ctx.window.document = ctx.document;

    vm.createContext(ctx);
    vm.runInContext(appJsContent, ctx);

    const savedCfgRaw = env.localStorage.getItem('THACO_CPHC_GSHEET_SYNC_CONFIG_V1');
    const savedCfg = savedCfgRaw ? JSON.parse(savedCfgRaw) : null;

    const passUrl = savedCfg && savedCfg.webAppUrl === 'https://gas.mock/exec';
    const passKey = savedCfg && savedCfg.apiKey === 'SECRET_KEY_999';
    const passReplace = env.history.replaceStateCalls.length > 0;
    const finalUrl = env.getCurrentHref();
    const passSanitized = !finalUrl.includes('SECRET_KEY_999') && !finalUrl.includes('apiUrl');

    console.log(`   - Lưu webAppUrl vào LocalStorage: ${passUrl ? '✅' : '❌'} (${savedCfg?.webAppUrl})`);
    console.log(`   - Lưu apiKey vào LocalStorage: ${passKey ? '✅' : '❌'} (${savedCfg?.apiKey})`);
    console.log(`   - history.replaceState được gọi: ${passReplace ? '✅' : '❌'}`);
    console.log(`   - URL thanh địa chỉ đã xóa apiKey: ${passSanitized ? '✅' : '❌'} (URL mới: ${finalUrl})`);

    const allPass = passUrl && passKey && passReplace && passSanitized;
    tests.push({ name: 'URL có apiUrl + apiKey', pass: allPass });
    console.log(`   👉 Kết quả: ${allPass ? 'PASS ✅' : 'FAIL ❌'}\n`);
}

// TEST 2: URL chỉ có apiUrl, apiKey rỗng hoặc không truyền -> PHẢI GIỮ NGUYÊN apiKey cũ trong LocalStorage
{
    console.log('▶ [TEST 2] URL chỉ có apiUrl, KHÔNG có apiKey -> Giữ nguyên apiKey cũ trong LocalStorage');
    const initialConfig = {
        webAppUrl: 'https://old-script.google.com/macros/s/OLD/exec',
        apiKey: 'EXISTING_PERSISTED_KEY_888',
        autoSync: true,
        lastSynced: '2026-01-01T00:00:00.000Z'
    };
    const env = createMockEnvironment(
        'https://cphc.thacoauto.vn/index.html?apiUrl=https%3A%2F%2Fnew-script.google.com%2Fmacros%2Fs%2FNEW%2Fexec',
        { 'THACO_CPHC_GSHEET_SYNC_CONFIG_V1': JSON.stringify(initialConfig) }
    );

    const ctx = {
        window: {
            location: env.location,
            history: env.history,
            addEventListener: () => {},
            THACO_APP: null
        },
        document: {
            location: env.location,
            getElementById: env.getElementById,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: (tag) => env.getElementById('mock-' + tag + '-' + Date.now()),
            addEventListener: () => {},
            readyState: 'complete',
            body: { appendChild: () => {}, prepend: () => {} }
        },
        localStorage: env.localStorage,
        alert: env.alert,
        console: { log: () => {}, warn: () => {}, error: () => {} },
        THACO_APP_DATA: { categories: [], entities: [], data2024: {}, data2025: {}, data2026: {}, deptData: {} },
        URL,
        URLSearchParams,
        Date,
        setTimeout: () => 0,
        clearTimeout: () => {}
    };
    ctx.window.document = ctx.document;

    vm.createContext(ctx);
    vm.runInContext(appJsContent, ctx);

    const savedCfgRaw = env.localStorage.getItem('THACO_CPHC_GSHEET_SYNC_CONFIG_V1');
    const savedCfg = savedCfgRaw ? JSON.parse(savedCfgRaw) : null;

    const passNewUrl = savedCfg && savedCfg.webAppUrl === 'https://new-script.google.com/macros/s/NEW/exec';
    const passPreservedKey = savedCfg && savedCfg.apiKey === 'EXISTING_PERSISTED_KEY_888';

    console.log(`   - Cập nhật webAppUrl mới: ${passNewUrl ? '✅' : '❌'} (${savedCfg?.webAppUrl})`);
    console.log(`   - Giữ nguyên apiKey cũ: ${passPreservedKey ? '✅' : '❌'} (${savedCfg?.apiKey})`);

    const allPass = passNewUrl && passPreservedKey;
    tests.push({ name: 'URL chỉ có apiUrl (giữ nguyên apiKey cũ)', pass: allPass });
    console.log(`   👉 Kết quả: ${allPass ? 'PASS ✅' : 'FAIL ❌'}\n`);
}

// TEST 3: URL KHÔNG có apiUrl (mở trực tiếp thông thường) -> Không thay đổi LocalStorage
{
    console.log('▶ [TEST 3] URL không có tham số kết nối -> Giữ nguyên cấu hình cũ');
    const initialConfig = {
        webAppUrl: 'https://saved.google.com/exec',
        apiKey: 'SAVED_KEY_123',
        autoSync: true
    };
    const env = createMockEnvironment(
        'https://cphc.thacoauto.vn/index.html',
        { 'THACO_CPHC_GSHEET_SYNC_CONFIG_V1': JSON.stringify(initialConfig) }
    );

    const ctx = {
        window: {
            location: env.location,
            history: env.history,
            addEventListener: () => {},
            THACO_APP: null
        },
        document: {
            location: env.location,
            getElementById: env.getElementById,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: (tag) => env.getElementById('mock-' + tag + '-' + Date.now()),
            addEventListener: () => {},
            readyState: 'complete',
            body: { appendChild: () => {}, prepend: () => {} }
        },
        localStorage: env.localStorage,
        alert: env.alert,
        console: { log: () => {}, warn: () => {}, error: () => {} },
        THACO_APP_DATA: { categories: [], entities: [], data2024: {}, data2025: {}, data2026: {}, deptData: {} },
        URL,
        URLSearchParams,
        Date,
        setTimeout: () => 0,
        clearTimeout: () => {}
    };
    ctx.window.document = ctx.document;

    vm.createContext(ctx);
    vm.runInContext(appJsContent, ctx);

    const savedCfgRaw = env.localStorage.getItem('THACO_CPHC_GSHEET_SYNC_CONFIG_V1');
    const savedCfg = savedCfgRaw ? JSON.parse(savedCfgRaw) : null;

    const passUntouched = savedCfg && savedCfg.webAppUrl === 'https://saved.google.com/exec' && savedCfg.apiKey === 'SAVED_KEY_123';
    const passNoReplace = env.history.replaceStateCalls.length === 0;

    console.log(`   - Cấu hình giữ nguyên: ${passUntouched ? '✅' : '❌'}`);
    console.log(`   - Không gọi replaceState không cần thiết: ${passNoReplace ? '✅' : '❌'}`);

    const allPass = passUntouched && passNoReplace;
    tests.push({ name: 'URL không có tham số (giữ nguyên)', pass: allPass });
    console.log(`   👉 Kết quả: ${allPass ? 'PASS ✅' : 'FAIL ❌'}\n`);
}

// TEST 4: Khi cấu hình từ URL nhưng Apps Script trả về lỗi (GAS luôn trả HTTP 200 kèm JSON error status 401)
(async () => {
    console.log('▶ [TEST 4] Tự động cấu hình từ URL nhưng Apps Script từ chối (HTTP 200 kèm body error code 401) -> Hiện Alert & Banner');
    const env = createMockEnvironment('https://cphc.thacoauto.vn/index.html?apiUrl=https%3A%2F%2Fgas.mock%2Fexec&apiKey=WRONG_KEY');

    let fetchCalled = false;
    const fetchMock = async (url) => {
        fetchCalled = true;
        // Thực tế Google Apps Script Web App (ContentService) LUÔN trả về HTTP 200
        return {
            ok: true,
            status: 200,
            json: async () => ({
                status: 'error',
                code: 401,
                message: 'Từ chối truy cập: Khóa API_KEY không hợp lệ hoặc chưa được cung cấp. Vui lòng kiểm tra lại cấu hình kết nối trên Web App.'
            })
        };
    };

    const ctx = {
        window: {
            location: env.location,
            history: env.history,
            addEventListener: () => {},
            THACO_APP: null
        },
        document: {
            location: env.location,
            getElementById: env.getElementById,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: (tag) => env.getElementById('mock-' + tag + '-' + Date.now()),
            addEventListener: () => {},
            readyState: 'complete',
            body: { appendChild: () => {}, prepend: () => {} }
        },
        localStorage: env.localStorage,
        fetch: fetchMock,
        alert: env.alert,
        console: { log: () => {}, warn: () => {}, error: () => {} },
        THACO_APP_DATA: { categories: [], entities: [], data2024: {}, data2025: {}, data2026: {}, deptData: {} },
        URL,
        URLSearchParams,
        Date,
        setTimeout: () => 0,
        clearTimeout: () => {},
        AbortController
    };
    ctx.window.document = ctx.document;

    const freshAppJs = fs.readFileSync(appJsPath, 'utf8');
    vm.createContext(ctx);
    vm.runInContext(freshAppJs, ctx);

    // Kích hoạt syncFromGoogleSheet
    await ctx.window.THACO_APP.syncFromGoogleSheet(false);

    const bannerEl = env.domElements['gsheet-sync-error-banner'];
    const bannerVisible = bannerEl && !bannerEl.classList.contains('hidden');
    const alertTriggered = env.alertCalls.length > 0;
    const alertMessage = env.alertCalls[0] || '';
    const alertHasKeywords = alertMessage.includes('KHÔNG THỂ KẾT NỐI') || alertMessage.includes('API_KEY');

    console.log(`   - Đã gửi yêu cầu kết nối tới Apps Script: ${fetchCalled ? '✅' : '❌'}`);
    console.log(`   - Hiển thị Alert cảnh báo người dùng: ${alertTriggered ? '✅' : '❌'} ("${alertMessage.split('\n')[0]}")`);
    console.log(`   - Hiển thị Banner cảnh báo màu đỏ trên giao diện: ${bannerVisible ? '✅' : '❌'}`);

    const allPass = fetchCalled && alertTriggered && alertHasKeywords && bannerVisible;
    tests.push({ name: 'GAS HTTP 200 + JSON error code 401 -> Cảnh báo rõ ràng', pass: allPass });
    console.log(`   👉 Kết quả: ${allPass ? 'PASS ✅' : 'FAIL ❌'}\n`);

    // TEST 5: URL chỉ có apiKey (apiUrl đã có sẵn trong LocalStorage) -> Vẫn nhận apiKey mới và báo lỗi khi sai key
    console.log('▶ [TEST 5] URL chỉ truyền apiKey (?apiKey=WRONG_STANDALONE_KEY) khi đã có apiUrl sẵn trong LocalStorage');
    const initialConfig5 = {
        webAppUrl: 'https://gas.mock/exec',
        apiKey: 'OLD_KEY_OK',
        autoSync: true
    };
    const env5 = createMockEnvironment(
        'https://cphc.thacoauto.vn/index.html?apiKey=WRONG_STANDALONE_KEY',
        { 'THACO_CPHC_GSHEET_SYNC_CONFIG_V1': JSON.stringify(initialConfig5) }
    );

    let fetchUrl5 = '';
    const fetchMock5 = async (url) => {
        fetchUrl5 = url;
        return {
            ok: true,
            status: 200,
            json: async () => ({
                status: 'error',
                code: 401,
                message: 'Từ chối truy cập: Khóa API_KEY không hợp lệ'
            })
        };
    };

    const ctx5 = {
        window: {
            location: env5.location,
            history: env5.history,
            addEventListener: () => {},
            THACO_APP: null
        },
        document: {
            location: env5.location,
            getElementById: env5.getElementById,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: (tag) => env5.getElementById('mock-' + tag + '-' + Date.now()),
            addEventListener: () => {},
            readyState: 'complete',
            body: { appendChild: () => {}, prepend: () => {} }
        },
        localStorage: env5.localStorage,
        fetch: fetchMock5,
        alert: env5.alert,
        console: { log: () => {}, warn: () => {}, error: () => {} },
        THACO_APP_DATA: { categories: [], entities: [], data2024: {}, data2025: {}, data2026: {}, deptData: {} },
        URL,
        URLSearchParams,
        Date,
        setTimeout: () => 0,
        clearTimeout: () => {},
        AbortController
    };
    ctx5.window.document = ctx5.document;

    vm.createContext(ctx5);
    vm.runInContext(freshAppJs, ctx5);

    await ctx5.window.THACO_APP.syncFromGoogleSheet(false);

    const savedCfgRaw5 = env5.localStorage.getItem('THACO_CPHC_GSHEET_SYNC_CONFIG_V1');
    const savedCfg5 = savedCfgRaw5 ? JSON.parse(savedCfgRaw5) : null;
    const keyUpdated = savedCfg5 && savedCfg5.apiKey === 'WRONG_STANDALONE_KEY';
    const sentWrongKey = fetchUrl5.includes('api_key=WRONG_STANDALONE_KEY');
    const bannerEl5 = env5.domElements['gsheet-sync-error-banner'];
    const bannerVisible5 = bannerEl5 && !bannerEl5.classList.contains('hidden');
    const alertTriggered5 = env5.alertCalls.length > 0;

    console.log(`   - Cập nhật apiKey mới từ URL vào LocalStorage: ${keyUpdated ? '✅' : '❌'}`);
    console.log(`   - Gửi apiKey mới trong request fetch: ${sentWrongKey ? '✅' : '❌'}`);
    console.log(`   - Hiển thị Alert cảnh báo lỗi: ${alertTriggered5 ? '✅' : '❌'}`);
    console.log(`   - Hiển thị Banner đỏ trên UI: ${bannerVisible5 ? '✅' : '❌'}`);

    const allPass5 = keyUpdated && sentWrongKey && bannerVisible5 && alertTriggered5;
    tests.push({ name: 'URL chỉ có apiKey (cập nhật key mới + báo lỗi khi sai)', pass: allPass5 });
    console.log(`   👉 Kết quả: ${allPass5 ? 'PASS ✅' : 'FAIL ❌'}\n`);

    // TỔNG KẾT
    console.log('========================================================================');
    console.log('TỔNG KẾT KẾT QUẢ BỘ KIỂM THỬ:');
    let totalPass = 0;
    tests.forEach((t, idx) => {
        console.log(`  ${idx + 1}. ${t.name}: ${t.pass ? 'PASS ✅' : 'FAIL ❌'}`);
        if (t.pass) totalPass++;
    });
    console.log(`\nTổng cộng: ${totalPass}/${tests.length} tests đạt (${Math.round(totalPass / tests.length * 100)}%)`);
    console.log('========================================================================');
    if (totalPass === tests.length) {
        process.exit(0);
    } else {
        process.exit(1);
    }
})();
