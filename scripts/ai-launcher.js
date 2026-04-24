#!/usr/bin/env node
/**
 * AI Services Launcher
 *
 * Single command to start all local AI infrastructure:
 *   1. Verify Ollama is running
 *   2. Start the auth proxy
 *   3. Start ngrok tunnel
 *   4. Update Vercel OLLAMA_URL if the tunnel URL changed
 *   5. Log session metrics on shutdown
 *
 * Usage:
 *   node scripts/ai-launcher.js
 *
 * Reads OLLAMA_PROXY_TOKEN and NGROK_AUTHTOKEN from .env.local
 */

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Config ──────────────────────────────────────────────────────────
const OLLAMA_PORT = 11434;
const PROXY_PORT = 11435;
const NGROK_BIN = path.join(process.env.HOME || '~', '.local/bin/ngrok');

// ─── Load env ────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('✗ .env.local not found');
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match) process.env[match[1]] = match[2].trim();
  }
}

loadEnv();

const TOKEN = process.env.OLLAMA_SECRET;
if (!TOKEN) {
  console.error('✗ OLLAMA_SECRET not found in .env.local');
  process.exit(1);
}

// ─── Session metrics ─────────────────────────────────────────────────
const session = {
  startedAt: new Date().toISOString(),
  requests: 0,
  totalLatencyMs: 0,
  errors: 0,
  tunnelUrl: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────
function log(msg) { console.log(`[ai] ${msg}`); }
function warn(msg) { console.warn(`[ai] ⚠ ${msg}`); }
function err(msg) { console.error(`[ai] ✗ ${msg}`); }

async function checkOllama() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${OLLAMA_PORT}/api/tags`, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.models?.length || 0);
        } catch { resolve(0); }
      });
    });
    req.on('error', () => resolve(-1));
    req.setTimeout(3000, () => { req.destroy(); resolve(-1); });
  });
}

async function getNgrokUrl() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const tunnel = parsed.tunnels?.[0];
          resolve(tunnel?.public_url || null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
  });
}

function updateVercelEnv(tunnelUrl) {
  try {
    // Remove old value (ignore errors if it doesn't exist)
    try {
      execSync('vercel env rm OLLAMA_URL production -y', { cwd: ROOT, stdio: 'pipe' });
    } catch { /* first time */ }

    execSync(`echo "${tunnelUrl}" | vercel env add OLLAMA_URL production`, {
      cwd: ROOT,
      stdio: 'pipe',
    });
    log(`Vercel OLLAMA_URL updated → ${tunnelUrl}`);
    return true;
  } catch (e) {
    warn(`Could not update Vercel env: ${e.message}`);
    return false;
  }
}

// ─── Proxy with metrics ──────────────────────────────────────────────
function startProxy() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const start = Date.now();

      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${TOKEN}`) {
        session.errors++;
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks);

        const proxyReq = http.request({
          hostname: '127.0.0.1',
          port: OLLAMA_PORT,
          path: req.url,
          method: req.method,
          headers: {
            'Content-Type': req.headers['content-type'] || 'application/json',
            'Content-Length': body.length,
          },
        }, (proxyRes) => {
          const latency = Date.now() - start;
          session.requests++;
          session.totalLatencyMs += latency;
          log(`✓ ${req.method} ${req.url} → ${proxyRes.statusCode} (${latency}ms) [#${session.requests}]`);
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        });

        proxyReq.on('error', (e) => {
          session.errors++;
          err(`Proxy → Ollama: ${e.message}`);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Ollama unreachable' }));
        });

        proxyReq.end(body);
      });
    });

    server.listen(PROXY_PORT, '127.0.0.1', () => {
      log(`Auth proxy on 127.0.0.1:${PROXY_PORT}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

// ─── ngrok ───────────────────────────────────────────────────────────
function startNgrok() {
  if (!fs.existsSync(NGROK_BIN)) {
    err(`ngrok not found at ${NGROK_BIN}`);
    process.exit(1);
  }

  const ngrok = spawn(NGROK_BIN, ['http', String(PROXY_PORT), '--log', 'stdout', '--log-format', 'json'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  ngrok.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const j = JSON.parse(line);
        if (j.url && !session.tunnelUrl) {
          session.tunnelUrl = j.url;
          log(`Tunnel: ${j.url}`);
        }
      } catch { /* non-json log line */ }
    }
  });

  ngrok.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) warn(`ngrok: ${msg}`);
  });

  ngrok.on('close', (code) => {
    if (code !== null && code !== 0) err(`ngrok exited with code ${code}`);
  });

  return ngrok;
}

// ─── Session summary ─────────────────────────────────────────────────
function printSummary() {
  const duration = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000 / 60);
  console.log('\n' + '─'.repeat(50));
  console.log('  AI Session Summary');
  console.log('─'.repeat(50));
  console.log(`  Duration:    ${duration} min`);
  console.log(`  Requests:    ${session.requests}`);
  console.log(`  Errors:      ${session.errors}`);
  console.log(`  Avg latency: ${session.requests ? Math.round(session.totalLatencyMs / session.requests) : 0}ms`);
  console.log(`  Tunnel:      ${session.tunnelUrl || 'none'}`);
  console.log('─'.repeat(50) + '\n');

  // Append to metrics log
  const logPath = path.join(ROOT, 'ai-sessions.log');
  const entry = JSON.stringify({
    ...session,
    endedAt: new Date().toISOString(),
    durationMin: duration,
    avgLatencyMs: session.requests ? Math.round(session.totalLatencyMs / session.requests) : 0,
  }) + '\n';
  fs.appendFileSync(logPath, entry);
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log('\n  Legacy Financial — AI Services Launcher\n');

  // 1. Check Ollama
  log('Checking Ollama...');
  const modelCount = await checkOllama();
  if (modelCount === -1) {
    err('Ollama is not running. Start it with: ollama serve');
    process.exit(1);
  }
  log(`Ollama online (${modelCount} models)`);

  // 2. Start proxy
  log('Starting auth proxy...');
  const proxyServer = await startProxy();

  // 3. Start ngrok
  log('Starting ngrok tunnel...');
  const ngrokProc = startNgrok();

  // 4. Wait for tunnel URL
  log('Waiting for tunnel URL...');
  let tunnelUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    tunnelUrl = await getNgrokUrl();
    if (tunnelUrl) break;
  }

  if (!tunnelUrl) {
    err('Failed to get ngrok tunnel URL after 30s');
    ngrokProc.kill();
    proxyServer.close();
    process.exit(1);
  }

  session.tunnelUrl = tunnelUrl;
  log(`Tunnel active: ${tunnelUrl}`);

  // 5. Update Vercel
  log('Updating Vercel env...');
  updateVercelEnv(tunnelUrl);

  console.log('\n  ✓ All services running. Press Ctrl+C to stop.\n');
  console.log(`  Chat demo: https://legacyfinancial.app/ai-demo`);
  console.log(`  Tunnel:    ${tunnelUrl}`);
  console.log(`  Proxy:     http://127.0.0.1:${PROXY_PORT}`);
  console.log(`  Ollama:    http://127.0.0.1:${OLLAMA_PORT}\n`);

  // Cleanup handler
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('Shutting down...');
    ngrokProc.kill();
    proxyServer.close();
    printSummary();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  err(e.message);
  process.exit(1);
});
