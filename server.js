const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8080;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.apk': 'application/vnd.android.package-archive'
};

const server = http.createServer((req, res) => {
  // Disable caching for development
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let safePath = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  let filePath = path.join(ROOT, safePath);

  fs.stat(filePath, (err, stats) => {
    let targetPath = filePath;
    let targetStats = stats;

    if (err || !stats.isFile()) {
      // Fallback to index.html for client-side routing
      targetPath = path.join(ROOT, 'index.html');
      try {
        targetStats = fs.statSync(targetPath);
      } catch (e) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
    }

    const ext = path.extname(targetPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': contentType
    };

    if (targetStats && targetStats.size) {
      headers['Content-Length'] = targetStats.size;
    }

    if (ext === '.apk') {
      headers['Content-Disposition'] = 'attachment; filename="sman-saku.apk"';
    }

    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      res.end();
      return;
    }

    res.writeHead(200, headers);
    const stream = fs.createReadStream(targetPath);
    stream.on('error', (streamErr) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
      }
      res.end('500 Error: ' + streamErr.message);
    });
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Sman_Saku server berjalan di http://localhost:${PORT}`);
  console.log(`📁 Melayani direktori: ${ROOT}`);
  
  // Buka browser otomatis di Windows
  exec(`start http://localhost:${PORT}`, (err) => {
    if (err) {
      console.log(`Silakan buka peramban Anda di: http://localhost:${PORT}`);
    }
  });
});
