/*
 * Minimal static file server with permissive CORS headers, used only to feed
 * the freshly built extension bundles into a live chatgpt.com tab during
 * end-to-end tests (browser_run_action fetches the bundle over localhost and
 * evals it with a stubbed chrome API). Not part of the extension runtime.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2] || 8765);
const rootDir = path.join(__dirname, '..', 'dist');

const mimeTypes = {
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.html': 'text/html',
  '.png': 'image/png',
};

const server = http.createServer((request, response) => {
  const urlPath = decodeURIComponent((request.url || '/').split('?')[0]);
  const filePath = path.join(rootDir, path.normalize(urlPath).replace(/^([.][.][\\/])+/, ''));
  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
    });
    response.end(data);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log('bundle test server listening on http://127.0.0.1:' + port);
});