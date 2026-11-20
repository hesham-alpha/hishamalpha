const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const root = __dirname;
const host = '127.0.0.1';
const port = 8018;
const url = `http://${host}:${port}/preview.html`;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function openBrowser() {
  execFile('cmd.exe', ['/c', 'start', '', url], { windowsHide: true });
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, url).pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(file, (error, stats) => {
    if (error) {
      res.writeHead(404).end('Not found');
      return;
    }
    const contentType = types[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    const match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      let start = Number(match[1]);
      let end = match[2] ? Number(match[2]) : stats.size - 1;
      if (!match[1]) {
        const suffixLength = end;
        start = Math.max(0, stats.size - suffixLength);
        end = stats.size - 1;
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= stats.size || end < start) {
        res.writeHead(416, { 'Content-Range': `bytes */${stats.size}`, 'Accept-Ranges': 'bytes' }).end();
        return;
      }
      end = Math.min(end, stats.size - 1);
      res.writeHead(206, {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Content-Length': end - start + 1,
        'Content-Type': contentType
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Accept-Ranges': 'bytes', 'Content-Length': stats.size, 'Content-Type': contentType });
    fs.createReadStream(file).pipe(res);
  });
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    openBrowser();
    return;
  }
  console.error(error.message);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Preview running at ${url}. Keep this window open while viewing.`);
  openBrowser();
});
