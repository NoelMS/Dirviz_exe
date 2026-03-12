#!/usr/bin/env node
import * as path from 'path';
import * as fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { loadConfig, saveApiKey } from './config/store';
import { crawlDirectory } from './crawler';
import { parseAllFiles } from './parser';
import { buildGraph } from './graph/builder';
import { createProvider, validateGeminiKey, isOllamaRunning, ensureOllamaRunning, selectFilesForSummarization, summarizeFiles, generateTour, GeminiUnavailableError } from './ai';
import { OllamaProvider } from './ai/providers/ollama';
import { startServer, AnalyzeOptions } from './server';
import { openBrowser } from './server/browser';

const argv = yargs(hideBin(process.argv))
  .usage('Usage: dirviz [options]')
  .option('port',        { alias: 'p', type: 'number',  describe: 'Local server port',               default: undefined })
  .option('no-ai',       {             type: 'boolean', describe: 'Disable all AI features',         default: false })
  .option('ai-provider', {             type: 'string',  choices: ['openai', 'anthropic', 'gemini', 'ollama'], describe: 'AI provider' })
  .option('ai-model',    {             type: 'string',  describe: 'AI model override' })
  .option('ai-key',      {             type: 'string',  describe: 'AI API key (saved to ~/.dirviz/config.json)' })
  .option('ai-limit',    {             type: 'number',  describe: 'Max files to AI-summarize',       default: undefined })
  .option('ignore',      {             type: 'string',  describe: 'Extra comma-separated ignore patterns' })
  .option('depth',       {             type: 'number',  describe: 'Max directory depth',             default: 20 })
  .option('open',        {             type: 'boolean', describe: 'Auto-open browser',               default: true })
  .help()
  .parseSync();

async function main() {
  let config = loadConfig();

  // Apply CLI-level overrides
  if (argv['ai-provider']) config.aiProvider = argv['ai-provider'] as any;
  if (argv['ai-model'])    config.aiModel = argv['ai-model'];
  if (argv['ai-key']) {
    saveApiKey(config.aiProvider, argv['ai-key']);
    config = loadConfig();
    console.log(`API key saved for ${config.aiProvider}`);
  }
  if (argv['ai-limit']) config.defaultAiLimit = argv['ai-limit'];

  const port = argv['port'] ?? config.defaultPort;
  const extraIgnore = argv['ignore'] ? argv['ignore'].split(',').map((s: string) => s.trim()) : [];

  // ── Find UI dir ────────────────────────────────────────────────────────────
  const uiDir = path.join(__dirname, 'ui');
  if (!fs.existsSync(uiDir)) {
    console.error(`\nUI files not found at ${uiDir}. Run "npm run build" first.`);
    process.exit(1);
  }

  // ── Analyze pipeline (called from browser via /api/analyze) ───────────────
  const analyzeHandler = async (
    opts: AnalyzeOptions,
    send: (msg: object) => void
  ) => {
    // Use the path exactly as the user typed it — it's already absolute.
    // On Windows (win32) Node, C:\foo\bar works directly with fs.existsSync.
    // On Linux/Mac, /home/user/project works directly.
    // Normalise only: trim whitespace and convert any forward-slashes on Windows.
    let targetDir = opts.directory.trim().replace(/^["']+|["']+$/g, ''); // strip accidental quotes
    if (process.platform === 'win32') {
      targetDir = targetDir.replace(/\//g, '\\');
    }

    if (!fs.existsSync(targetDir)) {
      throw new Error(`Directory not found: ${targetDir}`);
    }

    // Reload config fresh, then apply any per-request overrides
    let runConfig = loadConfig();
    if (opts.aiProvider) runConfig.aiProvider = opts.aiProvider as any;
    if (opts.aiKey && opts.aiProvider && opts.aiProvider !== 'ollama') {
      // Save the key for future runs
      saveApiKey(opts.aiProvider as any, opts.aiKey);
      runConfig = loadConfig();
      send({ type: 'progress', text: `API key saved for ${opts.aiProvider}`, pct: 2 });
    }

    // Step 1: Crawl
    send({ type: 'progress', text: 'Crawling directory...', pct: 5 });
    const files = await crawlDirectory({ rootDir: targetDir, maxDepth: argv['depth'], extraIgnore });
    send({ type: 'progress', text: `Found ${files.length} files`, pct: 20 });

    // Step 2: Parse
    send({ type: 'progress', text: 'Parsing imports...', pct: 25 });
    const { parsedFiles, edges } = parseAllFiles(files);
    send({ type: 'progress', text: `Found ${edges.length} connections`, pct: 40 });

    // Step 3: Build graph (offline enrichment runs inside buildGraph)
    const useAi = !opts.noAi && !argv['no-ai'];

    // Validate Gemini key before starting (pre-flight check)
    let provider = useAi ? createProvider(runConfig) : null;

    if (useAi && provider && runConfig.aiProvider === 'gemini') {
      send({ type: 'progress', text: 'Testing Gemini connection...', pct: 3 });
      const geminiKey = runConfig.apiKeys.gemini!;
      const check = await validateGeminiKey(geminiKey, runConfig.aiModel ?? undefined);
      if (!check.ok) {
        // Gemini failed — try Ollama fallback
        const ollamaUp = await isOllamaRunning();
        if (ollamaUp) {
          send({ type: 'progress', text: `Gemini unavailable (${check.reason}) — falling back to Ollama`, pct: 4 });
          provider = new OllamaProvider(runConfig.aiModel ?? undefined);
        } else {
          send({ type: 'progress', text: `Gemini unavailable (${check.reason}) — using offline summaries`, pct: 4 });
          provider = null;
        }
      } else {
        send({ type: 'progress', text: 'Gemini connected', pct: 4 });
      }
    } else if (useAi && provider && runConfig.aiProvider === 'ollama') {
      // Ensure Ollama server is running — start it if installed but not yet running
      if (!(await isOllamaRunning())) {
        send({ type: 'progress', text: 'Starting Ollama server...', pct: 3 });
        const started = await ensureOllamaRunning();
        if (started) {
          send({ type: 'progress', text: 'Ollama server ready', pct: 4 });
        } else {
          send({ type: 'progress', text: 'Ollama could not be started — using offline summaries', pct: 4 });
          provider = null;
        }
      }
    } else if (useAi && !provider) {
      send({ type: 'progress', text: 'No AI key found — continuing without AI summaries. Add a key above to enable.', pct: 42 });
    }

    const graph = buildGraph(
      targetDir, files, parsedFiles, edges,
      provider ? runConfig.aiProvider : null,
      provider ? (runConfig.aiModel ?? null) : null
    );
    send({ type: 'progress', text: 'Graph built with offline summaries', pct: 50 });

    // Step 4: AI summaries (optional)
    if (provider) {
      const toSummarize = selectFilesForSummarization(graph.nodes, runConfig.defaultAiLimit);
      send({ type: 'progress', text: `Generating AI summaries for ${toSummarize.length} files...`, pct: 55 });
      let lastPct = 0;
      try {
        await summarizeFiles(provider, toSummarize, targetDir, (done, total) => {
          const pct = 55 + Math.floor((done / total) * 35);
          if (pct > lastPct + 2) {
            lastPct = pct;
            send({ type: 'progress', text: `Summarized ${done}/${total} files`, pct });
          }
        });
        send({ type: 'progress', text: 'AI summaries done', pct: 90 });
      } catch (aiErr: any) {
        if (aiErr instanceof GeminiUnavailableError) {
          // Mid-run Gemini failure — try Ollama fallback
          send({ type: 'progress', text: `Gemini failed mid-run (${aiErr.reason}) — trying Ollama fallback`, pct: 70 });
          const ollamaUp = await ensureOllamaRunning();
          if (ollamaUp) {
            send({ type: 'progress', text: 'Switching to Ollama...', pct: 71 });
            const fallbackProvider = new OllamaProvider(runConfig.aiModel ?? undefined);
            const remaining = toSummarize.filter(n => !n.friendlySummary);
            await summarizeFiles(fallbackProvider, remaining, targetDir, (done, total) => {
              const pct = 70 + Math.floor((done / total) * 20);
              if (pct > lastPct + 2) {
                lastPct = pct;
                send({ type: 'progress', text: `Ollama: summarized ${done}/${total} files`, pct });
              }
            });
            send({ type: 'progress', text: 'AI summaries done (via Ollama fallback)', pct: 90 });
          } else {
            send({ type: 'progress', text: `Gemini failed mid-run (${aiErr.reason}) — using offline summaries for remaining files`, pct: 70 });
          }
        } else {
          throw aiErr; // rethrow unexpected errors
        }
      }

      // Step 5: Tour
      send({ type: 'progress', text: 'Generating codebase tour...', pct: 92 });
      try { graph.tour = await generateTour(provider, graph.nodes); } catch { /* non-fatal */ }
      send({ type: 'progress', text: 'Tour ready', pct: 97 });
    } else {
      send({ type: 'progress', text: 'Offline summaries ready', pct: 90 });
    }

    // Store graph in server state
    const { setGraphData } = await import('./server');
    setGraphData(graph, provider);

    send({ type: 'progress', text: `Ready — ${graph.meta.totalFiles} files, ${graph.meta.totalEdges} connections`, pct: 99 });
  };

  // ── Start server ───────────────────────────────────────────────────────────
  let actualPort = port;
  let server: import('http').Server | undefined;
  while (actualPort < port + 20) {
    try {
      server = await startServer(uiDir, actualPort, analyzeHandler);
      break;
    } catch (e: any) {
      if (e.code === 'EADDRINUSE') { actualPort++; }
      else throw e;
    }
  }

  const url = `http://localhost:${actualPort}`;
  console.log(`\ndirviz — ready at ${url}\n`);
  console.log('  Open the URL above, enter a directory path, and click Analyze.\n');
  console.log('  Press Ctrl+C to stop.\n');

  if (argv['open'] !== false) await openBrowser(url);

  process.on('SIGINT', () => { server?.close(); process.exit(0); });
}

main().catch((e) => {
  console.error('\ndirviz error:', e.message);
  process.exit(1);
});
