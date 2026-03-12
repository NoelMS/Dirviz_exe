import { Ollama } from 'ollama';
import { AIProvider, AISummary, FeatureAdvice, SUMMARIZE_PROMPT, TOUR_PROMPT, ERROR_PROMPT, FEATURE_PROMPT } from '../prompts';
import { parseJsonSummary, parseJsonArray } from './openai';

export class OllamaProvider implements AIProvider {
  name = 'ollama';
  model: string;
  private client: Ollama;

  constructor(model = 'llama3') {
    this.model = model;
    this.client = new Ollama();
  }

  private async chat(prompt: string): Promise<string> {
    const res = await this.client.chat({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.message.content;
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
