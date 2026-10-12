const http = require('node:http');
const next = require('next');
const httpProxy = require('http-proxy');

const dev = process.argv[2] === 'dev';
const hostname = '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const apiPort = Number(process.env.API_PORT || 3001);
const app = next({ dev, hostname, port, customServer: true });
const handle = app.getRequestHandler();
const proxy = httpProxy.createProxyServer({ target: `http://127.0.0.1:${apiPort}`, ws: true, changeOrigin: true, xfwd: true });
proxy.on('error', (err, req, res) => {
  console.error('[proxy] upstream error:', err.message);
  if (res && typeof res.writeHead === 'function' && !res.headersSent) {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'API runtime tidak tersedia' }));
  }
});

app.prepare().then(() => {
  const server = http.createServer((req, res) => handle(req, res));
  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws' || req.url.startsWith('/ws?')) {
      proxy.ws(req, socket, head);
      return;
    }
    // Next's own dev/HMR upgrades are handled by Next's request handler.
    if (dev) app.getUpgradeHandler()(req, socket, head);
    else socket.destroy();
  });
  server.listen(port, hostname, () => console.log(`[Next.js] ready on http://${hostname}:${port} (API proxy :${apiPort})`));
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}).catch(err => {
  console.error('[Next.js] startup failed:', err);
  process.exit(1);
});
