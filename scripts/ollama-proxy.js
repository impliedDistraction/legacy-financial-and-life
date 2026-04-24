#!/usr/bin/env node
/**
 * Authenticated reverse proxy for Ollama.
 *
 * Sits between the ngrok tunnel and Ollama, validating a bearer token
 * before forwarding requests. This prevents random internet users from
 * hitting Ollama directly if they discover the ngrok URL.
 *
 * Usage:
 *   OLLAMA_PROXY_TOKEN=<secret> node scripts/ollama-proxy.js
 *
 * Env vars:
 *   OLLAMA_PROXY_TOKEN  — required shared secret
 *   PROXY_PORT          — port to listen on (default 11435)
 *   OLLAMA_PORT         — Ollama port to forward to (default 11434)
 */

import http from 'node:http';

const TOKEN = process.env.OLLAMA_PROXY_TOKEN;
const PROXY_PORT = parseInt(process.env.PROXY_PORT || '11435', 10);
const OLLAMA_PORT = parseInt(process.env.OLLAMA_PORT || '11434', 10);

if (!TOKEN) {
  console.error('Error: OLLAMA_PROXY_TOKEN env var is required');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const start = Date.now();
  console.log(`→ ${req.method} ${req.url}`);

  // Validate bearer token
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${TOKEN}`) {
    console.log(`✗ 401 Unauthorized (${Date.now() - start}ms)`);
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  // Collect request body
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    // Forward to Ollama
    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port: OLLAMA_PORT,
        path: req.url,
        method: req.method,
        headers: {
          'Content-Type': req.headers['content-type'] || 'application/json',
          'Content-Length': body.length,
        },
      },
      (proxyRes) => {
        console.log(`✓ ${proxyRes.statusCode} ${req.url} (${Date.now() - start}ms)`);
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ollama unreachable' }));
    });

    proxyReq.end(body);
  });
});

server.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log(`Ollama auth proxy listening on 127.0.0.1:${PROXY_PORT}`);
  console.log(`Forwarding authenticated requests to 127.0.0.1:${OLLAMA_PORT}`);
  console.log('Start ngrok with: ngrok http 11435');
});
