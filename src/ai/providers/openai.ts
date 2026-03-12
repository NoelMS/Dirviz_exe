import OpenAI from 'openai';
import { AIProvider, AISummary, FeatureAdvice, SUMMARIZE_PROMPT, TOUR_PROMPT, ERROR_PROMPT, FEATURE_PROMPT } from '../prompts';

export class OpenAIProvider implements AIProvider {
  name = 'openai';
  model: string;
  private client: OpenAI;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.model = model;
    this.client = new OpenAI({ apiKey });
  }

  private async chat(prompt: string): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });
    return res.choices[0]?.message?.content ?? '';
  }

  async summarizeFile(fileId: string, snippet: string): Promise<AISummary> {
    const text = await this.chat(SUMMARIZE_PROMPT(fileId, snippet));
    return parseJsonSummary(text);
  }

  async generateTour(graphSummary: string): Promise<string> {
    return this.chat(TOUR_PROMPT(graphSummary));
  }

  async diagnoseError(errorText: string, fileSummaries: string): Promise<string> {
    return this.chat(ERROR_PROMPT(errorText, fileSummaries));
  }

  async adviseFeature(request: string, graphSummary: string): Promise<FeatureAdvice[]> {
    const text = await this.chat(FEATURE_PROMPT(request, graphSummary));
    return parseJsonArray(text);
  }
}

export function parseJsonSummary(text: string): AISummary {
  try {
    const json = extractJson(text);
    const parsed = JSON.parse(json);
    return {
      friendlySummary: parsed.friendlySummary ?? 'No summary available.',
      expertSummary: parsed.expertSummary ?? 'No summary available.',
    };
  } catch {
    return { friendlySummary: 'No summary available.', expertSummary: 'No summary available.' };
  }
}

export function parseJsonArray(text: string): FeatureAdvice[] {
  try {
    const json = extractJson(text);
    return JSON.parse(json);
  } catch {
    return [];
  }
}

function extractJson(text: string): string {
  // Strip markdown code fences if present
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  // Try to find raw JSON object or array
  const obj = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (obj) return obj[1];
  return text.trim();
}
