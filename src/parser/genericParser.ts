import * as fs from 'fs';
import * as path from 'path';

export interface ParseResult {
  imports: string[];
  exports: string[];
}

/**
 * Generic fallback parser — extracts anything that looks like
 * a relative path reference from the source text.
 */
export function parseGeneric(absolutePath: string): ParseResult {
  let source: string;
  try {
    source = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return { imports: [], exports: [] };
  }

  const imports: string[] = [];

  // Match quoted relative paths: "./foo", "../bar/baz"
  const relativeRef = /['"`](\.{1,2}\/[^'"`\s]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = relativeRef.exec(source)) !== null) {
    imports.push(m[1]);
  }

  return { imports: [...new Set(imports)], exports: [] };
}

export function resolveGenericImport(
  specifier: string,
  importerPath: string,
  allIds: Set<string>
): string | null {
  if (!specifier.startsWith('.')) return null;

  const importerDir = path.dirname(importerPath);
  const resolved = path.join(importerDir, specifier).replace(/\\/g, '/');

  if (allIds.has(resolved)) return resolved;

  return null;
}
