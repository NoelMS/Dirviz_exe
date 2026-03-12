import { AIProvider } from './prompts';
import { GraphNode } from '../graph/builder';
import { buildGraphSummary } from './limiter';

export async function generateTour(
  provider: AIProvider,
  nodes: GraphNode[]
): Promise<string> {
  const summary = buildGraphSummary(nodes);
  return provider.generateTour(summary);
}
