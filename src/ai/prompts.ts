export interface AISummary {
  friendlySummary: string;
  expertSummary: string;
}

export interface AIProvider {
  name: string;
  model: string;
  summarizeFile(fileId: string, snippet: string): Promise<AISummary>;
  generateTour(graphSummary: string): Promise<string>;
  diagnoseError(errorText: string, fileSummaries: string): Promise<string>;
  adviseFeature(request: string, graphSummary: string): Promise<FeatureAdvice[]>;
}

export interface FeatureAdvice {
  fileId: string;
  friendlyReason: string;
  expertReason: string;
}

export const SUMMARIZE_PROMPT = (fileId: string, snippet: string) => `
You are analyzing a source code file in a software project.

File path: ${fileId}
First 60 lines of the file:
\`\`\`
${snippet}
\`\`\`

Respond with ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "friendlySummary": "One plain-English sentence (max 15 words) describing what this file does, for a non-technical person.",
  "expertSummary": "One technical sentence (max 20 words) naming the module type, key exports, and main dependencies."
}
`.trim();

export const TOUR_PROMPT = (graphSummary: string) => `
You are analyzing the structure of a software project.

Here is a summary of the project's files and their connections:
${graphSummary}

Write a short codebase tour (4-6 bullet points) that explains:
- What this project appears to be
- What the main entry points are
- What the key folders/areas do
- Where a newcomer should start reading

Write it in plain English. Be concise. Do not use technical jargon unless necessary.
`.trim();

export const ERROR_PROMPT = (errorText: string, fileSummaries: string) => `
A developer encountered this error:
\`\`\`
${errorText}
\`\`\`

The files mentioned in the stack trace do the following:
${fileSummaries}

In 3-5 sentences, explain in plain English:
1. What likely caused this error
2. What the developer should look at or check
3. A suggested fix approach

Be direct and practical. Avoid jargon where possible.
`.trim();

export const FEATURE_PROMPT = (request: string, graphSummary: string) => `
A developer wants to add the following to their project:
"${request}"

Here is the project's file structure and what each file does:
${graphSummary}

Return ONLY valid JSON — an array of the most relevant files to touch, in priority order (max 8):
[
  {
    "fileId": "relative/path/to/file.ts",
    "friendlyReason": "Plain-English explanation (max 15 words) of why this file is relevant",
    "expertReason": "Technical explanation (max 20 words) of what to change in this file"
  }
]
`.trim();
