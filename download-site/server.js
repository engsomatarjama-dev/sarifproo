const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.apk': 'application/vnd.android.package-archive',
};

http
  .createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    if (urlPath === '/api/admin-user-auth') {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const {handler} = require('./netlify/functions/admin-user-auth');
          const result = await handler({
            httpMethod: req.method,
            headers: req.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
          res.writeHead(result.statusCode || 200, result.headers || {'Content-Type': 'application/json'});
          res.end(result.body || '');
        } catch (error) {
          res.writeHead(500, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: error instanceof Error ? error.message : 'Local API failed'}));
        }
      });
      return;
    }

    const requestedPath = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
    const filePath = fs.existsSync(requestedPath) && fs.statSync(requestedPath).isDirectory()
      ? path.join(requestedPath, 'index.html')
      : requestedPath;

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      res.writeHead(200, {'Content-Type': types[path.extname(filePath)] || 'application/octet-stream'});
      res.end(data);
    });
  })
  .listen(port, () => {
    console.log(`SarifPro download page preview: http://localhost:${port}`);
  });
