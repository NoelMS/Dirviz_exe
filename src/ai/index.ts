import * as child_process from 'child_process';
import { DirvizConfig } from '../config/store';
import { AIProvider } from './prompts';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider, GeminiUnavailableError } from './providers/gemini';
import { OllamaProvider } from './providers/ollama';

export { GeminiUnavailableError } from './providers/gemini';

export function createProvider(config: DirvizConfig): AIProvider | null {
  const { aiProvider, aiModel, apiKeys } = config;

  switch (aiProvider) {
    case 'openai': {
      const key = apiKeys.openai;
      if (!key) return null;
      return new OpenAIProvider(key, aiModel ?? undefined);
    }
    case 'anthropic': {
      const key = apiKeys.anthropic;
      if (!key) return null;
      return new AnthropicProvider(key, aiModel ?? undefined);
    }
    case 'gemini': {
      const key = apiKeys.gemini;
      if (!key) return null;
      return new GeminiProvider(key, aiModel ?? undefined);
    }
    case 'ollama': {
      return new OllamaProvider(aiModel ?? undefined);
    }
    default:
      return null;
  }
}

/**
 * Sends a minimal test prompt to Gemini to verify the key works.
 * Times out after 5 seconds to keep the preflight snappy.
 */
export async function validateGeminiKey(key: string, model = 'gemini-1.5-flash'): Promise<{ ok: boolean; reason?: string }> {
  const provider = new GeminiProvider(key, model);

  const timeout = new Promise<{ ok: boolean; reason: string }>(resolve =>
    setTimeout(() => resolve({ ok: false, reason: 'network' }), 5000)
  );

  const check = async (): Promise<{ ok: boolean; reason?: string }> => {
    try {
      // Minimal prompt — just enough to trigger an auth/quota check
      await provider.generateTour('ping');
      return { ok: true };
    } catch (err: any) {
      if (err instanceof GeminiUnavailableError) {
        return { ok: false, reason: err.reason };
      }
      return { ok: false, reason: 'network' };
    }
  };

  return Promise.race([check(), timeout]);
}

/**
 * Checks whether a local Ollama server is reachable at the default port.
 * Uses http.get instead of fetch for reliable cross-platform behaviour on Windows.
 */
export function isOllamaRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = require('http').get(
      { hostname: 'localhost', port: 11434, path: '/', timeout: 2000 },
      (res: any) => { res.resume(); resolve(res.statusCode < 500); }
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

/**
 * If Ollama is not already running, tries to spawn `ollama serve` in the
 * background and waits up to 8 seconds for it to become reachable.
 * Returns true if the server is running after the call.
 */
export async function ensureOllamaRunning(): Promise<boolean> {
  if (await isOllamaRunning()) return true;

  // Resolve the ollama binary path — on Windows it may not be in PATH
  let ollamaCmd = 'ollama';
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? '';
    const defaultExe = require('path').join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
    if (require('fs').existsSync(defaultExe)) ollamaCmd = defaultExe;
  }

  try {
    const proc = child_process.spawn(ollamaCmd, ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    proc.unref();
  } catch {
    return false; // binary not found or spawn failed
  }

  // Poll until the server is up (up to 8 seconds)
  for (let i = 0; i < 16; i++) {
    await new Promise<void>(r => setTimeout(r, 500));
    if (await isOllamaRunning()) return true;
  }
  return false;
}

export { selectFilesForSummarization } from './limiter';
export { summarizeFiles } from './summarizer';
export { generateTour } from './tour';
export { diagnoseError } from './errorAdvisor';
export { adviseFeature, adviseFeatureOffline } from './featureAdvisor';
export type { AIProvider, AISummary, FeatureAdvice } from './prompts';
