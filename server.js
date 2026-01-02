/**
 * GIVE Video Proxy Server
 *
 * Streams video from remote URLs to bypass CORS restrictions.
 * Supports range requests for seeking.
 *
 * Usage: node server.js
 * Then open http://localhost:8080/demo.html
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
};

// Allowed video sources for proxying
const ALLOWED_SOURCES = [
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'archive.org',
  'ia800.us.archive.org',
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Handle video proxy requests
  if (url.pathname === '/proxy/video') {
    const videoUrl = url.searchParams.get('url');

    if (!videoUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing url parameter');
      return;
    }

    try {
      const parsedUrl = new URL(videoUrl);

      // Security: Only allow specific hosts
      if (!ALLOWED_SOURCES.some(host => parsedUrl.hostname.includes(host))) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Video source not allowed');
        return;
      }

      // Forward range header for seeking support
      const headers = {
        'User-Agent': 'GIVE-VideoProxy/1.0'
      };

      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const proxyReq = protocol.request(parsedUrl, { headers }, (proxyRes) => {
        // Forward relevant headers
        const responseHeaders = {
          'Content-Type': proxyRes.headers['content-type'] || 'video/webm',
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
        };

        if (proxyRes.headers['content-length']) {
          responseHeaders['Content-Length'] = proxyRes.headers['content-length'];
        }
        if (proxyRes.headers['content-range']) {
          responseHeaders['Content-Range'] = proxyRes.headers['content-range'];
        }

        res.writeHead(proxyRes.statusCode, responseHeaders);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        console.error('Proxy error:', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Failed to fetch video');
        }
      });

      proxyReq.end();

    } catch (err) {
      console.error('URL parse error:', err.message);
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid URL');
    }
    return;
  }

  // Handle static files
  let filePath = url.pathname;
  if (filePath === '/') {
    filePath = '/index.html';
  }

  const fullPath = path.join(__dirname, filePath);
  const ext = path.extname(filePath).toLowerCase();

  // Security: Prevent directory traversal
  if (!fullPath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  try {
    const stat = await fs.promises.stat(fullPath);

    if (stat.isFile()) {
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      // Handle range requests for local video files
      if (req.headers.range && (ext === '.webm' || ext === '.mp4')) {
        const range = req.headers.range;
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = end - start + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
        });

        const stream = fs.createReadStream(fullPath, { start, end });
        stream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
          'Cache-Control': 'no-cache',
        });

        const stream = fs.createReadStream(fullPath);
        stream.pipe(res);
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } else {
      console.error('Server error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║          GIVE - Gol'Nuggit Interactive Video Editor        ║
╠════════════════════════════════════════════════════════════╣
║  Server running at http://localhost:${PORT}                   ║
║                                                            ║
║  Pages:                                                    ║
║    • Editor:  http://localhost:${PORT}/index.html             ║
║    • Demo:    http://localhost:${PORT}/demo.html              ║
║    • Player:  http://localhost:${PORT}/player.html            ║
║                                                            ║
║  The demo will stream Nosferatu via proxy (no download!)   ║
╚════════════════════════════════════════════════════════════╝
`);
});
