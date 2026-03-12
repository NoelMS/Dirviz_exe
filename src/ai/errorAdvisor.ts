import { AIProvider } from './prompts';
import { GraphNode } from '../graph/builder';

export async function diagnoseError(
  provider: AIProvider,
  errorText: string,
  involvedNodes: GraphNode[]
): Promise<string> {
  const fileSummaries = involvedNodes
    .map((n) => `${n.id}: ${n.friendlySummary ?? n.expertSummary ?? 'no summary'}`)
    .join('\n');

  return provider.diagnoseError(errorText, fileSummaries);
}
