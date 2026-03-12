import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import { GraphData } from '../graph/builder';
import { diagnoseError } from '../ai/errorAdvisor';
import { adviseFeature, adviseFeatureOffline } from '../ai/featureAdvisor';
import { validateGeminiKey, isOllamaRunning } from '../ai';
import { AIProvider } from '../ai/prompts';
import { loadConfig } from '../config/store';

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.map':  'application/json',
};

// Mutable state — updated when /api/analyze completes
let currentGraph: GraphData | null = null;
let currentProvider: AIProvider | null = null;

export function setGraphData(graph: GraphData, provider: AIProvider | null) {
  currentGraph = graph;
  currentProvider = provider;
}

export interface AnalyzeOptions {
  directory: string;
  noAi: boolean;
  aiProvider?: string;
  aiKey?: string;
}

export async function startServer(
  uiDir: string,
  port: number,
  analyzeHandler: (
    opts: AnalyzeOptions,
    send: (msg: object) => void
  ) => Promise<void>,
  initialGraph?: GraphData,
  initialProvider?: AIProvider | null
): Promise<http.Server> {
  if (initialGraph) currentGraph = initialGraph;
  if (initialProvider !== undefined) currentProvider = initialProvider;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    // ── GET /api/config — tells picker which providers have saved keys ────────
    if (req.method === 'GET' && url.pathname === '/api/config') {
      const config = loadConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        provider: config.aiProvider,
        savedKeys: {
          openai:    !!config.apiKeys.openai,
          anthropic: !!config.apiKeys.anthropic,
          gemini:    !!config.apiKeys.gemini,
          ollama:    true, // ollama never needs a key
        },
      }));
      return;
    }

    // ── Landing page ──────────────────────────────────────────────────────────
    if (req.method === 'GET' && url.pathname === '/') {
      const pickerPath = path.join(uiDir, 'picker.html');
      try {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync(pickerPath));
      } catch {
        res.writeHead(500); res.end('picker.html not found — rebuild required');
      }
      return;
    }

    // ── Graph page ────────────────────────────────────────────────────────────
    if (req.method === 'GET' && url.pathname === '/graph') {
      if (!currentGraph) {
        res.writeHead(302, { Location: '/' }); res.end(); return;
      }
      const indexPath = path.join(uiDir, 'index.html');
      try {
        let html = fs.readFileSync(indexPath, 'utf8');
        const injection = `<script>window.__GRAPH_DATA__ = ${JSON.stringify(currentGraph)};</script>`;
        html = html.replace('</head>', `${injection}\n</head>`);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } catch {
        res.writeHead(500); res.end('Could not load UI');
      }
      return;
    }

    // ── GET /api/preflight — check Gemini validity + Ollama reachability ────────
    if (req.method === 'GET' && url.pathname === '/api/preflight') {
      const config = loadConfig();

      // Check Ollama first — if it's already running we can skip Gemini validation entirely
      const ollamaRunning = await isOllamaRunning();

      let geminiOk = false;
      let geminiReason: string | undefined;
      if (!ollamaRunning) {
        // Only validate Gemini when Ollama isn't available
        const geminiKey = config.apiKeys.gemini;
        if (geminiKey) {
          const result = await validateGeminiKey(geminiKey, config.aiModel ?? undefined);
          geminiOk = result.ok;
          geminiReason = result.reason;
        }
      } else {
        // Ollama is running — mark gemini as skipped so picker uses Ollama
        geminiOk = false;
        geminiReason = 'skipped';
      }

      // ollamaInstalled: true if server is running, or binary found in PATH / default location
      const ollamaInstalled = ollamaRunning || await new Promise<boolean>((resolve) => {
        const isWindows = process.platform === 'win32';
        const cmd = isWindows ? 'where' : 'which';
        const proc = child_process.spawn(cmd, ['ollama'], { stdio: 'ignore' });
        proc.on('close', (code) => {
          if (code === 0) { resolve(true); return; }
          if (isWindows) {
            const localAppData = process.env.LOCALAPPDATA ?? '';
            const defaultPath = require('path').join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
            resolve(require('fs').existsSync(defaultPath));
          } else {
            resolve(false);
          }
        });
        proc.on('error', () => {
          if (process.platform === 'win32') {
            const localAppData = process.env.LOCALAPPDATA ?? '';
            const defaultPath = require('path').join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
            resolve(require('fs').existsSync(defaultPath));
          } else {
            resolve(false);
          }
        });
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ geminiOk, geminiReason, ollamaRunning, ollamaInstalled }));
      return;
    }

    // ── POST /api/install-ollama — install Ollama + pull model, stream progress ─
    if (req.method === 'POST' && url.pathname === '/api/install-ollama') {
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      });

      const send = (msg: object) => {
        try { res.write(JSON.stringify(msg) + '\n'); } catch {}
      };

      const isWindows = process.platform === 'win32';
      const isMac = process.platform === 'darwin';

      try {
        // Step 1: Install Ollama binary
        send({ type: 'progress', text: 'Installing Ollama...' });

        if (isWindows) {
          send({ type: 'error', error: 'Automatic Ollama install is not supported on Windows. Please download it manually from https://ollama.com/download and re-run dirviz.' });
          res.end();
          return;
        }

        const installCmd = isMac
          ? 'brew install ollama'
          : 'curl -fsSL https://ollama.com/install.sh | sh';

        await new Promise<void>((resolve, reject) => {
          const proc = child_process.spawn('sh', ['-c', installCmd], { stdio: 'pipe' });
          proc.stdout.on('data', (d: Buffer) => {
            const lines = d.toString().split('\n').filter((l: string) => l.trim());
            for (const line of lines) send({ type: 'progress', text: line });
          });
          proc.stderr.on('data', (d: Buffer) => {
            const lines = d.toString().split('\n').filter((l: string) => l.trim());
            for (const line of lines) send({ type: 'progress', text: line });
          });
          proc.on('close', (code: number | null) => {
            if (code === 0) resolve();
            else reject(new Error(`Ollama install exited with code ${code}`));
          });
        });

        send({ type: 'progress', text: 'Ollama installed. Starting server...' });

        // Step 2: Start the Ollama server in the background
        const serveProc = child_process.spawn('ollama', ['serve'], {
          detached: true,
          stdio: 'ignore',
        });
        serveProc.unref();

        // Give the server a moment to start
        await new Promise<void>(r => setTimeout(r, 2000));

        // Verify it started
        const running = await isOllamaRunning();
        if (!running) {
          send({ type: 'error', error: 'Ollama server failed to start. Try running "ollama serve" manually in a terminal, then re-analyze.' });
          res.end();
          return;
        }

        send({ type: 'progress', text: 'Ollama server running. Pulling qwen2.5-coder:3b model (~2 GB)...' });

        // Step 3: Pull the model — stream progress
        await new Promise<void>((resolve, reject) => {
          const proc = child_process.spawn('ollama', ['pull', 'qwen2.5-coder:3b'], { stdio: 'pipe' });
          proc.stdout.on('data', (d: Buffer) => {
            const lines = d.toString().split('\n').filter((l: string) => l.trim());
            for (const line of lines) send({ type: 'progress', text: line });
          });
          proc.stderr.on('data', (d: Buffer) => {
            const lines = d.toString().split('\n').filter((l: string) => l.trim());
            for (const line of lines) send({ type: 'progress', text: line });
          });
          proc.on('close', (code: number | null) => {
            if (code === 0) resolve();
            else reject(new Error(`ollama pull exited with code ${code}`));
          });
        });

        send({ type: 'done', text: 'Ollama ready with qwen2.5-coder:3b' });
      } catch (e: any) {
        send({ type: 'error', error: e.message ?? String(e) });
      }

      res.end();
      return;
    }

    // ── /api/analyze — runs the full pipeline, streams progress ──────────────
    if (req.method === 'POST' && url.pathname === '/api/analyze') {
      const body = await readBody(req);
      let opts: AnalyzeOptions;
      try {
        opts = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
        return;
      }

      if (!opts.directory) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'directory is required' }));
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      });

      const send = (msg: object) => {
        try { res.write(JSON.stringify(msg) + '\n'); } catch {}
      };

      try {
        await analyzeHandler(opts, send);
        send({ type: 'done' });
      } catch (e: any) {
        send({ type: 'error', error: e.message ?? String(e) });
      }

      res.end();
      return;
    }

    // ── /api/diagnose ─────────────────────────────────────────────────────────
    if (req.method === 'POST' && url.pathname === '/api/diagnose') {
      const body = await readBody(req);
      const { errorText, nodeIds } = JSON.parse(body);
      const graph = currentGraph;

      if (!graph) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No graph loaded yet' }));
        return;
      }

      const involvedNodes = graph.nodes.filter((n) => nodeIds.includes(n.id));

      if (!currentProvider) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'AI is disabled. Enable AI on the home page to use this feature.' }));
        return;
      }

      try {
        const diagnosis = await diagnoseError(currentProvider, errorText, involvedNodes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ diagnosis }));
      } catch (e: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── /api/feature ──────────────────────────────────────────────────────────
    if (req.method === 'POST' && url.pathname === '/api/feature') {
      const body = await readBody(req);
      const { request } = JSON.parse(body);
      const graph = currentGraph;

      if (!graph) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No graph loaded yet' }));
        return;
      }

      if (!currentProvider) {
        const results = adviseFeatureOffline(request, graph.nodes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results, offline: true }));
        return;
      }

      try {
        const results = await adviseFeature(currentProvider, request, graph.nodes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results, offline: false }));
      } catch (e: any) {
        const results = adviseFeatureOffline(request, graph.nodes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results, offline: true, error: e.message }));
      }
      return;
    }

    // ── /api/source ───────────────────────────────────────────────────────────
    if (req.method === 'GET' && url.pathname === '/api/source') {
      const graph = currentGraph;
      const fileId = url.searchParams.get('id');
      const line = parseInt(url.searchParams.get('line') ?? '1', 10);

      if (!graph) { res.writeHead(503); res.end('No graph loaded'); return; }
      if (!fileId) { res.writeHead(400); res.end('Missing id'); return; }

      const node = graph.nodes.find((n) => n.id === fileId);
      if (!node) { res.writeHead(404); res.end('File not in graph'); return; }

      try {
        const content = fs.readFileSync(path.join(graph.meta.rootDir, fileId), 'utf8');
        const lines = content.split('\n');
        const start = Math.max(0, line - 6);
        const end = Math.min(lines.length, line + 5);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ lines: lines.slice(start, end), startLine: start + 1, errorLine: line }));
      } catch {
        res.writeHead(404); res.end('Could not read file');
      }
      return;
    }

    // ── Static UI files ───────────────────────────────────────────────────────
    const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const fullPath = path.join(uiDir, filePath);
    const ext = path.extname(fullPath);

    if (fs.existsSync(fullPath)) {
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'text/plain' });
      res.end(fs.readFileSync(fullPath));
    } else {
      res.writeHead(404); res.end('Not found');
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '0.0.0.0', () => resolve(server));
    server.on('error', reject);
  });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
  });
}
