# dirviz

A CLI tool that crawls any codebase directory and opens a local browser-based interactive visualization for code comprehension and navigation.

Supports two modes: **Explorer** (friendly, plain-English summaries) and **Architect** (dense graph with technical metrics). Uses AST-based parsing to extract dependency graphs, with optional AI-powered file summaries, error diagnosis, and feature advice.

---

## Features

- **Dependency Graph Visualization** -- Interactive D3.js force-directed graph showing all files and their import relationships
- **Two Modes** -- Explorer mode for newcomers (clustered by folder, plain-English labels, entry point badges) and Architect mode for experts (full graph, circular dependency detection, import direction arrows)
- **Multi-Language Parsing** -- AST-based extraction for JavaScript/TypeScript (Babel), regex-based for Python, generic fallback for other languages
- **AI Summaries** -- Optional AI-powered file summaries using OpenAI, Anthropic, Google Gemini, or local Ollama models
- **Error Tracer** -- Paste a stack trace to see matching files highlighted on the graph with source code preview
- **Feature Advisor** -- Describe a feature you want to add; get a ranked list of files to modify (works offline with keyword matching)
- **Blast Radius Analysis** -- Click any file to see its full downstream dependency chain
- **Codebase Tour** -- AI-generated narrative explaining the project structure and where to start reading
- **Fully Offline** -- After initial analysis, all graph data is embedded in the served page. No external API calls from the browser.
- **Multiple AI Providers** -- OpenAI, Anthropic Claude, Google Gemini, and local Ollama (no API key required for Ollama)

---

## Installation

### Via npx (no install)

```
npx dirviz [directory]
```

### Global install from npm

```
npm install -g dirviz
dirviz [directory]
```

### Local install from source

```
git clone https://github.com/NoelMS/Dirviz_exe.git
cd Dirviz_exe
npm install
npm run build
npm link
dirviz [directory]
```

---

## Usage

```
dirviz [directory]               Analyze a directory (default: current directory)

Options:
  --port <n>                       Local server port (default: 4000)
  --mode explorer|architect        Starting UI mode (default: explorer)
  --no-ai                          Disable all AI features
  --ai-provider <name>             openai | anthropic | gemini | ollama
  --ai-model <name>                Model name override
  --ai-key <key>                   API key (saved to ~/.dirviz/config.json)
  --ai-limit <n>                   Max files to AI-summarize (default: 50)
  --ignore <patterns>              Extra comma-separated ignore patterns
  --depth <n>                      Max directory depth (default: 20)
  --open / --no-open               Auto-open browser (default: --open)
  --version                        Show version number
  --help                           Show help
```

---

## How It Works

1. **Crawl** -- Walks the directory tree, collecting file metadata (size, LOC)
2. **Parse** -- Extracts imports and exports from each file using language-appropriate parsers
3. **Graph** -- Builds a dependency graph with nodes (files) and edges (import relationships)
4. **Summarize** (optional) -- AI generates friendly and technical summaries for the most important files
5. **Serve** -- Starts a local HTTP server and opens the interactive UI in your browser

All analysis runs on your machine. No files are uploaded anywhere.

---

## AI Providers

| Provider | Default Model | Key Required |
|---|---|---|
| OpenAI | gpt-4o-mini | Yes |
| Anthropic | claude-3-5-haiku-latest | Yes |
| Google Gemini | gemini-1.5-flash | Yes |
| Ollama (local) | qwen2.5-coder:3b | No |

Ollama runs fully locally with no API key. The tool can automatically install Ollama and pull the model if not already present.

---

## Requirements

- Node.js 18+
- A modern browser (Chrome, Firefox, Safari, Edge)

---

## Project Structure

```
dirviz/
  src/
    cli.ts                        # Entry point, argument parsing
    config/store.ts               # Configuration management (~/.dirviz/config.json)
    crawler/
      fileCrawler.ts              # Recursive directory walk
      ignoreRules.ts              # Default and user-specified ignore patterns
    parser/
      index.ts                    # Routes files to correct parser
      jsParser.ts                 # JS/TS AST-based import/export extraction
      pythonParser.ts             # Python import extraction
      genericParser.ts            # Regex-based fallback parser
    ai/
      index.ts                    # AI pipeline orchestrator and provider creation
      limiter.ts                  # Ranks files by importance for AI summarization
      summarizer.ts               # Generates file summaries
      tour.ts                     # Generates codebase tour narrative
      errorAdvisor.ts            # AI-powered error diagnosis
      featureAdvisor.ts          # Feature advice (online and offline modes)
      prompts.ts                  # AI prompt templates
      providers/
        openai.ts                 # OpenAI provider
        anthropic.ts              # Anthropic Claude provider
        gemini.ts                 # Google Gemini provider
        ollama.ts                 # Local Ollama provider
    graph/
      builder.ts                  # Graph data assembly
    server/
      index.ts                    # HTTP server (REST API + static file serving)
      browser.ts                  # Browser auto-open
    ui/
      index.html                  # Graph UI shell
      app.js                      # Bootstrap and orchestration
      graph.js                    # D3.js graph rendering
      explorer.js                 # Explorer mode layout and interactions
      architect.js                # Architect mode layout and interactions
      panel.js                    # Slide-in detail panel
      errorTrace.js               # Stack trace parser and highlighter
      featureAdvisor.js           # Feature advisor UI
      blastRadius.js              # Blast radius computation
      filters.js                  # Search and filter controls
      tour.js                     # Codebase tour panel
      styles.css                  # UI stylesheet
```

---

## Data Pipeline

```
CLI invoked
  |
  1. Load config (~/.dirviz/config.json)
  2. Walk directory -> file metadata
  3. Parse imports/exports from each file
  4. Build base graph (nodes + edges)
  5. Select top N files by importance
  6. Generate AI summaries (optional)
  7. Generate codebase tour (optional)
  8. Start local server
  9. Open browser to interactive UI
```

---

## License

MIT
