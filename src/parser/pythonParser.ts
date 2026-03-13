import * as fs from 'fs';
import * as path from 'path';

export interface ParseResult {
  imports: string[];
  exports: string[];
}

export function parsePython(absolutePath: string, relativePath: string): ParseResult {
  let source: string;
  try {
    source = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return { imports: [], exports: [] };
  }

  const imports: string[] = [];
  const exports: string[] = [];

  // Match: from .module import x  |  from ..module import x  |  import module
  const fromRelative = /^\s*from\s+(\.+[\w.]*)\s+import\s+/gm;
  const importLine = /^\s*import\s+([\w., ]+)/gm;
  const defOrClass = /^\s*(?:def|class)\s+(\w+)/gm;

  let m: RegExpExecArray | null;

  while ((m = fromRelative.exec(source)) !== null) {
    imports.push(m[1]); // relative dotted path
  }

  while ((m = importLine.exec(source)) !== null) {
    // could be multiple: import os, sys
    const mods = m[1].split(',').map((s) => s.trim());
    for (const mod of mods) {
      if (mod) imports.push(mod);
    }
  }

  while ((m = defOrClass.exec(source)) !== null) {
    exports.push(m[1]);
  }

  return { imports: [...new Set(imports)], exports: [...new Set(exports)] };
}

/** Resolve a Python relative import (e.g. '.utils') to a file id, or null */
export function resolvePythonImport(
  specifier: string,
  importerPath: string,
  allIds: Set<string>
): string | null {
  if (!specifier.startsWith('.')) return null;

  // Count leading dots to determine directory depth
  const dotCount = specifier.match(/^\.+/)?.[0].length ?? 0;
  const modulePart = specifier.slice(dotCount).replace(/\./g, '/');

  let baseDir = path.dirname(importerPath);
  for (let i = 1; i < dotCount; i++) {
    baseDir = path.dirname(baseDir);
  }

  const resolved = (modulePart
    ? path.join(baseDir, modulePart)
    : baseDir
  ).replace(/\\/g, '/');

  if (allIds.has(resolved + '.py')) return resolved + '.py';
  if (allIds.has(resolved + '/__init__.py')) return resolved + '/__init__.py';

  return null;
}
