import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface DirvizConfig {
  aiProvider: 'openai' | 'anthropic' | 'gemini' | 'ollama';
  aiModel: string | null;
  apiKeys: {
    openai: string | null;
    anthropic: string | null;
    gemini: string | null;
    ollama: null;
  };
  defaultAiLimit: number;
  defaultPort: number;
}

const CONFIG_DIR = path.join(os.homedir(), '.dirviz');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Bundled Gemini key — free tier (1,500 req/day). User's own saved key takes precedence.
// Falls back to Ollama automatically if this key is invalid or quota is exceeded.
export const BUNDLED_GEMINI_KEY = 'AIzaSyBDBKMPags9CM5befW6htFx_mbpV3IzrgE';

const DEFAULT_CONFIG: DirvizConfig = {
  aiProvider: 'gemini',
  aiModel: null,
  apiKeys: {
    openai: null,
    anthropic: null,
    gemini: null,
    ollama: null,
  },
  defaultAiLimit: 50,
  defaultPort: 4000,
};

export function loadConfig(): DirvizConfig {
  let config: DirvizConfig;
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      config = deepMerge(DEFAULT_CONFIG, JSON.parse(raw)) as DirvizConfig;
    } else {
      config = { ...DEFAULT_CONFIG, apiKeys: { ...DEFAULT_CONFIG.apiKeys } };
    }
  } catch {
    config = { ...DEFAULT_CONFIG, apiKeys: { ...DEFAULT_CONFIG.apiKeys } };
  }

  // If no user-saved Gemini key, inject the bundled key as fallback
  if (!config.apiKeys.gemini) {
    config.apiKeys.gemini = BUNDLED_GEMINI_KEY;
  }

  return config;
}

export function saveConfig(config: Partial<DirvizConfig>): void {
  const current = loadConfig();
  const merged = deepMerge(current, config);
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
}

export function saveApiKey(provider: keyof DirvizConfig['apiKeys'], key: string): void {
  const config = loadConfig();
  config.apiKeys[provider] = key as any;
  saveConfig(config);
}

function deepMerge(base: any, override: any): any {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (
      override[key] !== null &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key])
    ) {
      result[key] = deepMerge(base[key] ?? {}, override[key]);
    } else if (override[key] !== undefined) {
      result[key] = override[key];
    }
  }
  return result;
}
