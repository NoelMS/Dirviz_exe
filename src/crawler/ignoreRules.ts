export const DEFAULT_IGNORE_PATTERNS: string[] = [
  // Dependency and build output
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.output',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
  '.env',
  '.turbo',
  'coverage',
  'storybook-static',
  '.svelte-kit',

  // Generated / lock files (by extension pattern, handled separately)
];

export const IGNORE_EXTENSIONS: string[] = [
  '.lock',
  '.map',
  '.min.js',
  '.min.css',
  // Binary / media
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.dylib',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.mp4', '.mp3', '.mov', '.avi', '.webm',
  '.db', '.sqlite', '.sqlite3',
];

export function shouldIgnore(
  relativePath: string,
  extraPatterns: string[] = []
): boolean {
  const allIgnored = [...DEFAULT_IGNORE_PATTERNS, ...extraPatterns];
  const parts = relativePath.split('/');

  // Check if any path segment matches an ignored directory name
  for (const part of parts) {
    if (allIgnored.includes(part)) return true;
  }

  // Check ignored extensions
  const lower = relativePath.toLowerCase();
  for (const ext of IGNORE_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }

  return false;
}
