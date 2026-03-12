import * as fs from 'fs';
import * as path from 'path';
import { shouldIgnore } from './ignoreRules';

export interface FileEntry {
  id: string;          // relative path from root (e.g. src/auth/middleware.ts)
  label: string;       // filename only (e.g. middleware.ts)
  ext: string;         // extension including dot (e.g. .ts)
  folder: string;      // immediate parent folder name
  absolutePath: string;
  size: number;        // bytes
  loc: number;         // lines of code
}

export interface CrawlOptions {
  rootDir: string;
  maxDepth?: number;
  extraIgnore?: string[];
}

export async function crawlDirectory(options: CrawlOptions): Promise<FileEntry[]> {
  const { rootDir, maxDepth = 20, extraIgnore = [] } = options;
  const results: FileEntry[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, absolutePath).replace(/\\/g, '/');

      if (shouldIgnore(relativePath, extraIgnore)) continue;

      if (entry.isDirectory()) {
        await walk(absolutePath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        let size = 0;
        let loc = 0;

        try {
          const stat = await fs.promises.stat(absolutePath);
          size = stat.size;

          // Only count lines for text files (skip binary by checking ext)
          const textExts = new Set([
            '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
            '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h',
            '.css', '.scss', '.less', '.html', '.htm', '.vue', '.svelte',
            '.json', '.yaml', '.yml', '.toml', '.env', '.md', '.txt',
            '.sh', '.bash', '.zsh', '.fish', '.ps1',
          ]);

          if (textExts.has(ext)) {
            const content = await fs.promises.readFile(absolutePath, 'utf8');
            loc = content.split('\n').length;
          }
        } catch {
          // skip unreadable files
        }

        results.push({
          id: relativePath,
          label: entry.name,
          ext: ext || '(none)',
          folder: path.basename(path.dirname(absolutePath)),
          absolutePath,
          size,
          loc,
        });
      }
    }
  }

  await walk(rootDir, 0);
  return results;
}
