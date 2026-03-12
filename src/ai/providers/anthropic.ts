import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AISummary, FeatureAdvice, SUMMARIZE_PROMPT, TOUR_PROMPT, ERROR_PROMPT, FEATURE_PROMPT } from '../prompts';
import { parseJsonSummary, parseJsonArray } from './openai';

export class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  model: string;
  private client: Anthropic;

  constructor(apiKey: string, model = 'claude-3-5-haiku-latest') {
    this.model = model;
    this.client = new Anthropic({ apiKey });
  }

  private async chat(prompt: string): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = res.content[0];
    return block.type === 'text' ? block.text : '';
  }

  async summarizeFile(fileId: string, snippet: string): Promise<AISummary> {
    return parseJsonSummary(await this.chat(SUMMARIZE_PROMPT(fileId, snippet)));
  }

  async generateTour(graphSummary: string): Promise<string> {
    return this.chat(TOUR_PROMPT(graphSummary));
  }

  async diagnoseError(errorText: string, fileSummaries: string): Promise<string> {
    return this.chat(ERROR_PROMPT(errorText, fileSummaries));
  }

  async adviseFeature(request: string, graphSummary: string): Promise<FeatureAdvice[]> {
    return parseJsonArray(await this.chat(FEATURE_PROMPT(request, graphSummary)));
  }
}
