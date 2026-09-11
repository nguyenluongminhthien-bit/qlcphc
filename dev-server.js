const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  // Giả lập Web App Google Apps Script (ContentService) cho môi trường kiểm thử trực tiếp
  if (reqPath === '/api/gas') {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const key = parsedUrl.searchParams.get('api_key') || parsedUrl.searchParams.get('apiKey');
    // GAS ContentService LUÔN trả về HTTP 200, lỗi chỉ nằm trong nội dung JSON
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    if (key === 'THACO_CPHC_2026_SECURE_TOKEN') {
      res.end(JSON.stringify({
        status: 'success',
        categories: [],
        allCostRows: [],
        message: 'Xác thực API_KEY thành công!'
      }));
    } else {
      res.end(JSON.stringify({
        status: 'error',
        code: 401,
        message: 'Từ chối truy cập: Khóa API_KEY không hợp lệ hoặc chưa được cung cấp. Vui lòng kiểm tra lại cấu hình kết nối trên Web App.'
      }));
    }
    return;
  }

  const filePath = path.join(ROOT_DIR, reqPath);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <div style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h2 style="color: #e11d48;">404 Not Found</h2>
          <p>Không tìm thấy tập tin: <code>${reqPath}</code></p>
          <a href="/" style="color: #00529C; text-decoration: underline;">Quay về Trang chủ</a>
        </div>
      `);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log('=======================================================');
  console.log('🚀 THACO AUTO COST MANAGEMENT DEV SERVER ĐANG CHẠY!');
  console.log(`🌐 Truy cập ứng dụng tại: ${url}`);
  console.log('👉 Nhấn Ctrl + C để dừng máy chủ');
  console.log('=======================================================');

  // Mở trình duyệt tự động trên Windows (bỏ qua nếu NO_OPEN=1)
  if (process.platform === 'win32' && !process.env.NO_OPEN) {
    exec(`start ${url}`);
  }
});
