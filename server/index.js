'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'docs');
const port = Number.parseInt(process.env.CLIENT_PORT || process.env.PORT || '8082', 10);
const host = process.env.CLIENT_HOST || '0.0.0.0';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8'
};

function resolveRequestPath(urlPath) {
  let requestPath;
  try {
    requestPath = decodeURIComponent(String(urlPath || '/').split('?')[0]);
  } catch (error) {
    requestPath = '/';
  }

  if (requestPath === '/') requestPath = '/index.html';
  const resolved = path.resolve(publicDir, '.' + requestPath);
  if (!resolved.startsWith(publicDir)) return null;
  return resolved;
}

function send(res, status, body, contentType) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''));
  res.writeHead(status, {
    'Content-Type': contentType || 'text/plain; charset=utf-8',
    'Content-Length': buffer.length,
    'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store'
  });
  res.end(buffer);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method not allowed');
    return;
  }

  const filePath = resolveRequestPath(req.url);
  if (!filePath) {
    send(res, 400, 'Bad request');
    return;
  }

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      send(res, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Content-Length': buffer.length,
        'Cache-Control': 'public, max-age=60'
      });
      res.end();
      return;
    }

    send(res, 200, buffer, contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  });
});

server.listen(port, host, () => {
  console.log(`Blobz client listening on http://${host}:${port}`);
});
