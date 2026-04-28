const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // Support legacy /docs prefix and directory-style URLs
    if (pathname === '/docs' || pathname === '/docs/') {
        pathname = '/';
    } else if (pathname.startsWith('/docs/')) {
        pathname = pathname.slice(5);
        if (!pathname) pathname = '/';
    }

    if (pathname.endsWith('/')) {
        pathname += 'index.html';
    }

    const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = path.normalize(path.join(__dirname, relativePath));

    // Security: prevent directory traversal
    if (!filePath.startsWith(__dirname + path.sep) && filePath !== __dirname) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // File not found, serve 404.html
                fs.readFile(path.join(__dirname, '404.html'), (err404, data404) => {
                    if (err404) {
                        res.writeHead(404);
                        res.end('File not found');
                    } else {
                        res.writeHead(404, { 'Content-Type': 'text/html' });
                        res.end(data404);
                    }
                });
            } else {
                res.writeHead(500);
                res.end('Internal server error');
            }
        } else {
            // Determine content type
            const ext = path.extname(filePath);
            let contentType = 'text/html';
            switch (ext) {
                case '.js':
                    contentType = 'text/javascript';
                    break;
                case '.css':
                    contentType = 'text/css';
                    break;
                case '.json':
                    contentType = 'application/json';
                    break;
                case '.png':
                    contentType = 'image/png';
                    break;
                case '.jpg':
                case '.jpeg':
                    contentType = 'image/jpeg';
                    break;
                case '.gif':
                    contentType = 'image/gif';
                    break;
                case '.ico':
                    contentType = 'image/x-icon';
                    break;
                case '.mp3':
                    contentType = 'audio/mpeg';
                    break;
                case '.wav':
                    contentType = 'audio/wav';
                    break;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
});

const PORT = 8082;
server.listen(PORT, () => {
    console.log(`Static file server running on http://localhost:${PORT}`);
});