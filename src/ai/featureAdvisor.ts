import { AIProvider, FeatureAdvice } from './prompts';
import { GraphNode } from '../graph/builder';
import { buildGraphSummary } from './limiter';

export async function adviseFeature(
  provider: AIProvider,
  request: string,
  nodes: GraphNode[]
): Promise<FeatureAdvice[]> {
  const summary = buildGraphSummary(nodes);
  return provider.adviseFeature(request, summary);
}

/**
 * Offline keyword-based feature advice — no AI required.
 * Extracts keywords from the request and scores files by how many keywords
 * appear in their id, folder, or existing summaries.
 */
export function adviseFeatureOffline(
  request: string,
  nodes: GraphNode[]
): Array<{ fileId: string; friendlyReason: string; expertReason: string }> {
  const keywords = extractKeywords(request);
  if (keywords.length === 0) return [];

  const scored = nodes
    .map((node) => {
      const haystack = [
        node.id,
        node.folder,
        node.label,
        node.friendlySummary ?? '',
        node.expertSummary ?? '',
      ].join(' ').toLowerCase();

      const matchedKeywords = keywords.filter((kw) => haystack.includes(kw));
      return { node, score: matchedKeywords.length, matchedKeywords };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return scored.map(({ node, matchedKeywords }) => ({
    fileId: node.id,
    friendlyReason: `Matched keywords: ${matchedKeywords.join(', ')}`,
    expertReason: `File path/summary contains: ${matchedKeywords.join(', ')}`,
  }));
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'i', 'want', 'to', 'add', 'create', 'make', 'build',
    'implement', 'feature', 'in', 'my', 'the', 'for', 'and', 'or', 'with',
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}
