/**
 * Test Evidence Suite: Google Apps Script API_KEY Security Layer
 * Verifies doGet / doPost access control with and without API_KEY.
 */

const fs = require('fs');
const path = require('path');

console.log('========================================================================');
console.log('KIỂM THỬ BẢO MẬT API_KEY: TRUY CẬP doGet / doPost GOOGLE APPS SCRIPT');
console.log('========================================================================\n');

// 1. Tạo môi trường giả lập Google Apps Script runtime (Sandbox Mock)
const scriptPath = path.join(__dirname, '../google_apps_script.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf8');

const propertiesStore = {
    'API_KEY': 'THACO_CPHC_2026_SECURE_TOKEN'
};

const PropertiesService = {
    getScriptProperties: function() {
        return {
            getProperty: function(key) { return propertiesStore[key] || null; },
            setProperty: function(key, val) { propertiesStore[key] = val; }
        };
    }
};

const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: function(text) {
        return {
            content: text,
            setMimeType: function(mime) { return this; },
            getData: function() { return JSON.parse(this.content); }
        };
    }
};

const SpreadsheetApp = {
    getActiveSpreadsheet: function() {
        return {
            getSheetByName: function() { return null; },
            insertSheet: function() { return null; }
        };
    }
};

// 2. Nạp logic GAS vào context thực thi
const vm = require('vm');
const context = {
    PropertiesService,
    ContentService,
    SpreadsheetApp,
    console,
    Date
};
vm.createContext(context);
vm.runInContext(scriptCode, context);

const doGet = context.doGet;
const doPost = context.doPost;

console.log(`🔐 Khóa API_KEY bảo mật đã cấu hình: "${propertiesStore['API_KEY']}"\n`);

const results = [];

// TEST 1: Gọi doGet KHÔNG kèm api_key
const resGetNoKey = doGet({ parameter: { action: 'get_all' } }).getData();
console.log('▶ [TEST 1] Gọi doGet() KHÔNG kèm API_KEY:');
console.log('   Phản hồi:', JSON.stringify(resGetNoKey, null, 2));
const pass1 = resGetNoKey.code === 401 && resGetNoKey.status === 'error';
console.log(`   Kết quả: ${pass1 ? '✅ ĐẠT (Chặn 401 Unauthorized thành công)' : '❌ THẤT BẠI'}\n`);
results.push({ test: 'doGet không kèm api_key', expected: 'Lỗi 401', actual: resGetNoKey.code, status: pass1 ? 'PASS ✅' : 'FAIL ❌' });

// TEST 2: Gọi doPost KHÔNG kèm api_key
const postBodyNoKey = JSON.stringify({ action: 'save_cphc_data', data: [] });
const resPostNoKey = doPost({ postData: { contents: postBodyNoKey } }).getData();
console.log('▶ [TEST 2] Gọi doPost() KHÔNG kèm API_KEY:');
console.log('   Phản hồi:', JSON.stringify(resPostNoKey, null, 2));
const pass2 = resPostNoKey.code === 401 && resPostNoKey.status === 'error';
console.log(`   Kết quả: ${pass2 ? '✅ ĐẠT (Chặn 401 Unauthorized thành công)' : '❌ THẤT BẠI'}\n`);
results.push({ test: 'doPost không kèm api_key', expected: 'Lỗi 401', actual: resPostNoKey.code, status: pass2 ? 'PASS ✅' : 'FAIL ❌' });

// TEST 3: Gọi doGet với api_key SAI
const resGetWrongKey = doGet({ parameter: { action: 'get_all', api_key: 'WRONG_INVALID_KEY' } }).getData();
console.log('▶ [TEST 3] Gọi doGet() với API_KEY SAI ("WRONG_INVALID_KEY"):');
console.log('   Phản hồi:', JSON.stringify(resGetWrongKey, null, 2));
const pass3 = resGetWrongKey.code === 401 && resGetWrongKey.status === 'error';
console.log(`   Kết quả: ${pass3 ? '✅ ĐẠT (Từ chối khóa sai 401 thành công)' : '❌ THẤT BẠI'}\n`);
results.push({ test: 'doGet với api_key sai', expected: 'Lỗi 401', actual: resGetWrongKey.code, status: pass3 ? 'PASS ✅' : 'FAIL ❌' });

// TEST 4: Gọi doPost với api_key SAI trong Body
const postBodyWrongKey = JSON.stringify({ action: 'save_cphc_data', api_key: 'HACKER_TOKEN_999' });
const resPostWrongKey = doPost({ postData: { contents: postBodyWrongKey } }).getData();
console.log('▶ [TEST 4] Gọi doPost() với API_KEY SAI trong Body:');
console.log('   Phản hồi:', JSON.stringify(resPostWrongKey, null, 2));
const pass4 = resPostWrongKey.code === 401 && resPostWrongKey.status === 'error';
console.log(`   Kết quả: ${pass4 ? '✅ ĐẠT (Từ chối ghi dữ liệu 401 thành công)' : '❌ THẤT BẠI'}\n`);
results.push({ test: 'doPost với api_key sai', expected: 'Lỗi 401', actual: resPostWrongKey.code, status: pass4 ? 'PASS ✅' : 'FAIL ❌' });

// TEST 5: Gọi doGet với api_key ĐÚNG (Ping / test_key)
const resGetValidKey = doGet({ parameter: { action: 'test_key', api_key: 'THACO_CPHC_2026_SECURE_TOKEN' } }).getData();
console.log('▶ [TEST 5] Gọi doGet() với API_KEY ĐÚNG ("THACO_CPHC_2026_SECURE_TOKEN"):');
console.log('   Phản hồi:', JSON.stringify(resGetValidKey, null, 2));
const pass5 = resGetValidKey.status === 'success' && resGetValidKey.authenticated === true;
console.log(`   Kết quả: ${pass5 ? '✅ ĐẠT (Xác thực HTTP 200 thành công)' : '❌ THẤT BẠI'}\n`);
results.push({ test: 'doGet với api_key đúng', expected: 'Success 200', actual: resGetValidKey.status, status: pass5 ? 'PASS ✅' : 'FAIL ❌' });

// TEST 6: Gọi doPost với api_key ĐÚNG trong Body
const postBodyValidKey = JSON.stringify({ action: 'test_key', api_key: 'THACO_CPHC_2026_SECURE_TOKEN' });
const resPostValidKey = doPost({ postData: { contents: postBodyValidKey } }).getData();
console.log('▶ [TEST 6] Gọi doPost() với API_KEY ĐÚNG trong Body:');
console.log('   Phản hồi:', JSON.stringify(resPostValidKey, null, 2));
const pass6 = resPostValidKey.status === 'success' || (resPostValidKey.code !== 401);
console.log(`   Kết quả: ${pass6 ? '✅ ĐẠT (Vượt qua bảo mật API_KEY thành công)' : '❌ THẤT BẠI'}\n`);
results.push({ test: 'doPost với api_key đúng', expected: 'Vượt qua 401', actual: resPostValidKey.code || resPostValidKey.status, status: pass6 ? 'PASS ✅' : 'FAIL ❌' });

console.log('--- BẢNG TỔNG HỢP KẾT QUẢ KIỂM THỬ BẢO MẬT API_KEY ---');
console.table(results);
