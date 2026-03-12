import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, AISummary, FeatureAdvice, SUMMARIZE_PROMPT, TOUR_PROMPT, ERROR_PROMPT, FEATURE_PROMPT } from '../prompts';
import { parseJsonSummary, parseJsonArray } from './openai';

export class GeminiUnavailableError extends Error {
  constructor(public readonly reason: 'auth' | 'quota' | 'network', message: string) {
    super(message);
    this.name = 'GeminiUnavailableError';
  }
}

export class GeminiProvider implements AIProvider {
  name = 'gemini';
  model: string;
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string, model = 'gemini-1.5-flash') {
    this.model = model;
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  private async chat(prompt: string): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      const status: number = err?.status ?? err?.httpStatus ?? err?.code ?? 0;

      if (status === 401 || status === 403 || msg.includes('API_KEY_INVALID') || msg.includes('invalid') || msg.includes('403')) {
        throw new GeminiUnavailableError('auth', `Gemini auth failed: ${msg}`);
      }
      if (status === 429 || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
        throw new GeminiUnavailableError('quota', `Gemini quota exceeded: ${msg}`);
      }
      throw err;
    }
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
