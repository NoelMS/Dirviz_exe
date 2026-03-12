import { FileEntry } from '../crawler/fileCrawler';
import { ImportEdge, ParsedFile } from '../parser/index';
import { enrichOffline, NodeRole } from './enrichOffline';

export interface GraphNode {
  id: string;
  label: string;
  ext: string;
  folder: string;
  size: number;
  loc: number;
  importCount: number;
  importedByCount: number;
  isEntryPoint: boolean;
  exports: string[];
  role: NodeRole;
  friendlySummary: string | null;
  expertSummary: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'import' | 'require' | 'dynamic' | 'unknown';
}

export interface GraphMeta {
  rootDir: string;
  analyzedAt: string;
  totalFiles: number;
  totalEdges: number;
  aiProvider: string | null;
  aiModel: string | null;
}

export interface GraphData {
  meta: GraphMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
  tour: string | null;
}

const ENTRY_POINT_NAMES = new Set([
  'index', 'main', 'app', 'server', 'cli', 'entry', 'start',
  'index.ts', 'index.tsx', 'index.js', 'index.jsx',
  'main.ts', 'main.tsx', 'main.js',
  'app.ts', 'app.tsx', 'app.js', 'app.jsx',
  'server.ts', 'server.js',
  'cli.ts', 'cli.js',
]);

export function buildGraph(
  rootDir: string,
  files: FileEntry[],
  parsedFiles: ParsedFile[],
  edges: ImportEdge[],
  aiProvider: string | null = null,
  aiModel: string | null = null
): GraphData {
  const importCountMap = new Map<string, number>();
  const importedByMap  = new Map<string, number>();
  const exportsMap     = new Map<string, string[]>();

  for (const pf of parsedFiles) {
    exportsMap.set(pf.id, pf.exports);
  }

  for (const edge of edges) {
    importCountMap.set(edge.source, (importCountMap.get(edge.source) ?? 0) + 1);
    importedByMap.set(edge.target,  (importedByMap.get(edge.target)  ?? 0) + 1);
  }

  const nodes: GraphNode[] = files.map((file) => {
    const importedByCount = importedByMap.get(file.id)  ?? 0;
    const importCount     = importCountMap.get(file.id) ?? 0;

    const nameWithoutExt = file.label.replace(/\.[^.]+$/, '');
    const isEntryPoint =
      ENTRY_POINT_NAMES.has(file.label) ||
      ENTRY_POINT_NAMES.has(nameWithoutExt) ||
      (importedByCount === 0 && importCount > 0 && ENTRY_POINT_NAMES.has(nameWithoutExt));

    return {
      id: file.id,
      label: file.label,
      ext: file.ext,
      folder: file.folder,
      size: file.size,
      loc: file.loc,
      importCount,
      importedByCount,
      isEntryPoint,
      exports: exportsMap.get(file.id) ?? [],
      role: 'unknown' as NodeRole,
      friendlySummary: null,
      expertSummary: null,
    };
  });

  // Enrich every node with rule-based summaries and roles (offline, no AI needed)
  enrichOffline(nodes, rootDir);

  return {
    meta: {
      rootDir,
      analyzedAt: new Date().toISOString(),
      totalFiles: files.length,
      totalEdges: edges.length,
      aiProvider,
      aiModel,
    },
    nodes,
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
    })),
    tour: null,
  };
}
