import * as fs from 'fs';
import * as path from 'path';
import { AIProvider } from './prompts';
import { GraphNode } from '../graph/builder';

const SNIPPET_LINES = 60;

export async function summarizeFiles(
  provider: AIProvider,
  nodes: GraphNode[],
  rootDir: string,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const total = nodes.length;
  let done = 0;

  // Run up to 5 concurrent summarization calls
  const CONCURRENCY = 5;
  const queue = [...nodes];

  async function processOne(node: GraphNode): Promise<void> {
    // node.id is relative to rootDir — join to get the full absolute path
    const fullPath = path.join(rootDir, node.id);
    const snippet = readSnippet(fullPath);
    try {
      const summary = await provider.summarizeFile(node.id, snippet);
      node.friendlySummary = summary.friendlySummary ?? null;
      node.expertSummary   = summary.expertSummary   ?? null;
    } catch (err: any) {
      // Keep any offline summary that was already set; don't null it out
      // (offline enrichment already ran before this point)
    }
    done++;
    onProgress?.(done, total);
  }

  // Process in batches
  while (queue.length > 0) {
    const batch = queue.splice(0, CONCURRENCY);
    await Promise.all(batch.map(processOne));
  }
}

function readSnippet(fullPath: string): string {
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    return content.split('\n').slice(0, SNIPPET_LINES).join('\n');
  } catch {
    return '(could not read file)';
  }
}
