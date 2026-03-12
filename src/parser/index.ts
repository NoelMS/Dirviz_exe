import { FileEntry } from '../crawler/fileCrawler';
import { parseJsTs, resolveImport as resolveJs } from './jsParser';
import { parsePython, resolvePythonImport } from './pythonParser';
import { parseGeneric, resolveGenericImport } from './genericParser';

export interface ImportEdge {
  source: string;   // file id doing the importing
  target: string;   // file id being imported
  type: 'import' | 'require' | 'dynamic' | 'unknown';
}

export interface ParsedFile {
  id: string;
  rawImports: string[];
  exports: string[];
}

const JS_TS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const PYTHON_EXTS = new Set(['.py']);

export function parseAllFiles(files: FileEntry[]): {
  parsedFiles: ParsedFile[];
  edges: ImportEdge[];
} {
  const allIds = new Set(files.map((f) => f.id));
  const parsedFiles: ParsedFile[] = [];
  const edges: ImportEdge[] = [];

  for (const file of files) {
    let rawImports: string[] = [];
    let exports: string[] = [];

    if (JS_TS_EXTS.has(file.ext)) {
      const result = parseJsTs(file.absolutePath, file.id);
      rawImports = result.imports;
      exports = result.exports;
    } else if (PYTHON_EXTS.has(file.ext)) {
      const result = parsePython(file.absolutePath, file.id);
      rawImports = result.imports;
      exports = result.exports;
    } else {
      const result = parseGeneric(file.absolutePath);
      rawImports = result.imports;
    }

    parsedFiles.push({ id: file.id, rawImports, exports });

    // Resolve each raw import to a known file id
    for (const spec of rawImports) {
      let resolved: string | null = null;

      if (JS_TS_EXTS.has(file.ext)) {
        resolved = resolveJs(spec, file.id, allIds);
      } else if (PYTHON_EXTS.has(file.ext)) {
        resolved = resolvePythonImport(spec, file.id, allIds);
      } else {
        resolved = resolveGenericImport(spec, file.id, allIds);
      }

      if (resolved && resolved !== file.id) {
        edges.push({
          source: file.id,
          target: resolved,
          type: spec.startsWith('import(') ? 'dynamic'
            : spec.startsWith('require') ? 'require'
            : 'import',
        });
      }
    }
  }

  // Deduplicate edges
  const seen = new Set<string>();
  const uniqueEdges = edges.filter((e) => {
    const key = `${e.source}→${e.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { parsedFiles, edges: uniqueEdges };
}
