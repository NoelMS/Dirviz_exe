import { GraphNode } from '../graph/builder';

/**
 * Selects the top N files by importance score (importedByCount + importCount).
 * These are the files that will receive AI summaries.
 */
export function selectFilesForSummarization(
  nodes: GraphNode[],
  limit: number
): GraphNode[] {
  return [...nodes]
    .sort((a, b) => {
      const scoreA = a.importedByCount + a.importCount;
      const scoreB = b.importedByCount + b.importCount;
      return scoreB - scoreA;
    })
    .slice(0, limit);
}

/**
 * Builds a compact text representation of the graph for AI tour/feature prompts.
 * Keeps token usage low by summarizing rather than dumping raw JSON.
 */
export function buildGraphSummary(nodes: GraphNode[]): string {
  const lines: string[] = [];

  // Group by top-level folder
  const byFolder = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const topFolder = node.id.split('/')[0] ?? 'root';
    if (!byFolder.has(topFolder)) byFolder.set(topFolder, []);
    byFolder.get(topFolder)!.push(node);
  }

  for (const [folder, folderNodes] of byFolder) {
    lines.push(`\nFolder: ${folder}/ (${folderNodes.length} files)`);
    for (const node of folderNodes.slice(0, 10)) {
      const summary = node.friendlySummary ?? node.expertSummary ?? '';
      const connInfo = `imports:${node.importCount} usedBy:${node.importedByCount}`;
      lines.push(`  - ${node.id} [${connInfo}]${summary ? ': ' + summary : ''}`);
    }
    if (folderNodes.length > 10) {
      lines.push(`  ... and ${folderNodes.length - 10} more files`);
    }
  }

  return lines.join('\n');
}
