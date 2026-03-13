# dirviz — Project Plan

## 1. Project Overview

**dirviz** is a CLI tool that crawls any codebase directory and opens a local browser-based interactive visualization. Its core mission is **code comprehension and self-sufficiency**:

- **Vibe coders:** Understand what a codebase does, find where bugs originate, and know exactly what to touch when adding a feature — without needing to read every file.
- **Expert coders:** Get an immediate, complete architectural picture of an unfamiliar codebase — dependencies, risk areas, entry points, and structural patterns.

**Three ways to run it:**
```
# 1. No install — run directly via npx (requires internet on first use)
npx dirviz [directory]

# 2. Global install from npm
npm install -g dirviz
dirviz [directory]

# 3. Local install from source (fully offline after clone)
git clone https://github.com/your-org/dirviz.git
cd dirviz
npm install
npm run build
npm link
dirviz [directory]
```

The tool spins up a local HTTP server and opens a browser-based interactive graph UI. No files are uploaded anywhere. Everything runs on your machine. All three installation methods produce an identical experience.

---

## 2. Two Audiences, Two Modes

The UI has two distinct modes, toggled by a switch in the top-right corner. Both modes use the same underlying data — they differ in what they show and how they show it.

### Explorer Mode — Vibe Coder Audience

**Core question answered:** "Something is broken / I want to add X — what files are involved and where do I start?"

- Friendly, colorful, clustered-by-folder layout
- Plain-English AI summaries as node labels (not file paths)
- Complexity collapsed by default — leaf files hidden into expandable bubbles
- Entry point files highlighted with a "Start Here" badge
- Guided Codebase Tour panel for total newcomers
- Error Tracer: paste a stack trace, see the broken file highlighted instantly
- Feature Advisor: type what you want to add, see which files to touch
- No jargon — tooltips say "Used by 4 files", not "4 inbound edges"

### Architect Mode — Expert Coder Audience

**Core question answered:** "How is this entire system structured, what are the risk areas, and how do I navigate it effectively?"

- Dense technical graph, all files visible, file paths as labels
- Metrics per node: lines of code, import/export counts, file size
- Circular dependency detection (red edges)
- Orphaned file detection (files with zero connections, dimmed)
- Blast radius analysis: click any file to see its full downstream impact
- Import direction arrows
- Advanced filtering by path glob, extension, metric thresholds

---

## 3. Repository Structure

```
dirviz/
├── src/
│   ├── cli.ts                        # Entrypoint, yargs arg parsing, pipeline orchestration
│   ├── config/
│   │   └── store.ts                  # Read/write ~/.dirviz/config.json
│   ├── crawler/
│   │   ├── index.ts                  # Crawl orchestrator
│   │   ├── fileCrawler.ts            # Recursive directory walk, collects file metadata
│   │   └── ignoreRules.ts            # Default ignore patterns + user --ignore overrides
│   ├── parser/
│   │   ├── index.ts                  # Routes files to correct parser by extension
│   │   ├── jsParser.ts               # JS/TS: @babel/parser AST-based import/export extraction
│   │   ├── pythonParser.ts           # Python: regex-based import extraction
│   │   └── genericParser.ts          # Fallback: regex grep for unknown languages
│   ├── ai/
│   │   ├── index.ts                  # AI pipeline orchestrator
│   │   ├── providers/
│   │   │   ├── openai.ts             # OpenAI provider (default model: gpt-4o-mini)
│   │   │   ├── anthropic.ts          # Anthropic Claude (default: claude-3-5-haiku-latest)
│   │   │   ├── gemini.ts             # Google Gemini (default: gemini-1.5-flash)
│   │   │   └── ollama.ts             # Local Ollama (default: llama3)
│   │   ├── limiter.ts                # Ranks files by importance score, enforces --ai-limit
│   │   ├── summarizer.ts             # Generates { friendlySummary, expertSummary } per file
│   │   ├── tour.ts                   # Generates the Codebase Tour narrative
│   │   ├── errorAdvisor.ts           # On-demand AI error diagnosis (single call, opt-in)
│   │   └── featureAdvisor.ts         # "Help Me Add This" → ranked + explained file list
│   ├── graph/
│   │   └── builder.ts                # Assembles final GraphData JSON from all pipeline output
│   ├── server/
│   │   ├── index.ts                  # Lightweight Node http server (no Express)
│   │   └── browser.ts                # Cross-platform browser auto-open (uses `open` package)
│   └── ui/
│       ├── index.html                # Shell HTML — injects window.__GRAPH_DATA__ at serve time
│       ├── app.js                    # App bootstrap, mode switching, global state
│       ├── graph.js                  # D3.js v7 core: nodes, edges, zoom, pan, minimap
│       ├── explorer.js               # Explorer mode: cluster layout, badges, friendly labels
│       ├── architect.js              # Architect mode: dense layout, metrics overlays, arrows
│       ├── panel.js                  # Slide-in detail panel (mode-aware content rendering)
│       ├── errorTrace.js             # Stack trace parser, file highlighter, source preview, AI toggle
│       ├── featureAdvisor.js         # Feature Advisor panel UI (online + offline modes)
│       ├── blastRadius.js            # Blast radius computation and highlight logic
│       ├── filters.js                # Filter bar: type checkboxes, folder dropdown, text search
│       ├── tour.js                   # Codebase Tour slide-in panel
│       └── styles.css                # Full UI stylesheet
├── package.json
├── tsconfig.json
└── PLAN.md                           # This file
```

---

## 4. Data Pipeline

The following steps run sequentially when `dirviz` is invoked:

```
CLI invoked
  │
  ├─ 1. config/store.ts          Load ~/.dirviz/config.json (saved API keys, defaults)
  ├─ 2. fileCrawler              Walk directory → [{ path, size, loc, ext, folder }]
  ├─ 3. importParser             Add { imports[], exports[] } to each file
  ├─ 4. graphBuilder             Produce base { nodes[], edges[] }
  ├─ 5. ai/limiter               Select top N files by importance score (importedBy + imports)
  ├─ 6. ai/summarizer            Add { friendlySummary, expertSummary } to selected nodes
  ├─ 7. ai/tour                  Generate codebase narrative string
  ├─ 8. httpServer               Inject graph JSON into HTML → serve on localhost:<port>
  └─ 9. browser.open()           Auto-open browser
```

Graph JSON is injected as `window.__GRAPH_DATA__` directly into the served HTML. No separate API requests are made from the browser — everything works fully offline after the initial analysis.

---

## 5. Graph Data Schema

```ts
type Node = {
  id: string;                    // Relative file path (unique key)
  label: string;                 // Filename only
  ext: string;                   // .ts | .tsx | .py | .css | .json | etc.
  folder: string;                // Immediate parent folder name
  size: number;                  // Bytes
  loc: number;                   // Lines of code
  importCount: number;           // Outbound edge count (files this file imports)
  importedByCount: number;       // Inbound edge count (files that import this file)
  isEntryPoint: boolean;         // true if index/main/app + low inbound count
  friendlySummary: string|null;  // "Handles user login and token validation"
  expertSummary: string|null;    // "Express middleware: exports verifyJWT(), 3 deps"
};

type Edge = {
  source: string;                // Node id (the file doing the importing)
  target: string;                // Node id (the file being imported)
  type: 'import' | 'require' | 'dynamic' | 'unknown';
};

type GraphData = {
  meta: {
    rootDir: string;             // Absolute path of analyzed directory
    analyzedAt: string;          // ISO timestamp
    totalFiles: number;
    totalEdges: number;
    aiProvider: string | null;
    aiModel: string | null;
  };
  nodes: Node[];
  edges: Edge[];
  tour: string | null;           // AI-generated codebase overview narrative
};
```

---

## 6. Explorer Mode — Full Feature Reference

| Feature | Detail |
|---|---|
| Layout | D3 force simulation with folder clustering — nodes visually grouped into neighborhoods by top-level folder |
| Node label | `friendlySummary` truncated to ~6 words; full filename shown on hover |
| Node color | Consistent color per top-level folder |
| Node size | Proportional to `importedByCount` — more used = visually larger |
| "Start Here" badges | Glowing ring on top 3–5 entry point files (e.g. `index`, `main`, `app`) |
| Collapsed leaf files | Files with 0 inbound edges grouped into a collapsible "N supporting files" bubble per folder — reduces visual noise |
| Codebase Tour | Explicit button opens slide-in panel: AI narrative explaining what the project is, its key folders, and where to begin reading |
| Error Tracer | Paste a stack trace → static parser extracts file paths + line numbers → matching nodes highlighted on graph. Detail panel shows ±5 lines of source code around the error line. Optional "Get AI diagnosis" toggle for plain-English explanation (1 AI call, labeled) |
| Feature Advisor (AI on) | "Help me add a feature" button opens a panel. User types a request (e.g. "add a dark mode toggle"). AI returns a ranked list of files with plain-English explanations of why each is relevant. Files highlighted on graph |
| Feature Advisor (AI off) | Same panel. Keyword extraction from the user's request matched against filenames, folder names, and extensions. Results labeled: "AI disabled — showing files matching keywords from your request" |
| Blast radius | Click any node → "Changing this could affect N files" shown with downstream nodes highlighted |
| Friendly tooltips | Plain-English only: "Used by 4 files", "Part of the auth folder" |
| Detail panel | Friendly summary, "imports these files" list, "used by these files" list, blast radius count, source preview when an error line is active |
| Search | Full-text search across `friendlySummary` and filenames |

---

## 7. Architect Mode — Full Feature Reference

| Feature | Detail |
|---|---|
| Layout | Standard D3 force-directed graph, dense, all files visible |
| Node label | Relative file path (e.g. `src/auth/middleware.ts`) |
| Node color | By file extension |
| Node size | Proportional to lines of code |
| Circular dependency detection | Edges forming import cycles rendered in red |
| Orphan detection | Nodes with 0 imports AND 0 importedBy are dimmed and flagged |
| Blast radius | Click node → full directed downstream dependency chain highlighted in orange |
| Metrics per node | LOC, importCount, importedByCount, file size in bytes |
| Technical detail panel | Full path, all metrics, complete import list with edge types, export list |
| Advanced search/filter | Filter by path glob, file extension, or metric thresholds (e.g. "show files with 10+ imports") |
| Import direction arrows | Visible arrow direction on edges, toggleable on/off |
| Error Tracer | Same behavior as Explorer mode but detail panel shows `expertSummary` + raw metrics alongside source preview |
| Feature Advisor | Same panel but AI returns technical guidance: which functions/exports to modify, which interfaces to extend, which files to create |

---

## 8. Shared UI Features

| Feature | Detail |
|---|---|
| Mode toggle | Top-right switch: Explorer ↔ Architect. Instant re-render, preserves currently selected node |
| Filter bar | File type checkboxes, folder dropdown, text search — applies to both modes |
| Zoom + pan | D3 zoom behavior: scroll to zoom, drag to pan |
| Mini-map | Corner overview for large graphs — shows position and allows click-to-jump |
| Keyboard shortcuts | `/` focus search · `Esc` close panel · `R` reset zoom · `T` open tour |

---

## 9. AI Integration

### Providers and Default Models

| Provider | Default Model | Notes |
|---|---|---|
| `openai` | `gpt-4o-mini` | Fast, cost-efficient, high quality |
| `anthropic` | `claude-3-5-haiku-latest` | Fast, cost-efficient |
| `gemini` | `gemini-1.5-flash` | Fast, generous free tier |
| `ollama` | `llama3` | Local, free, no API key required |

All defaults are chosen for speed and cost efficiency. Override with `--ai-model <name>`.

### Smart File Selection (`ai/limiter.ts`)

Files are ranked by **importance score** = `importedByCount + importCount`. The top N files (default: 50) are sent for AI summarization. Files below the limit receive `summary: null` and display "No summary available" gracefully in the UI. Configure with `--ai-limit <n>`.

### Dual Summary Per File (`ai/summarizer.ts`)

A single AI call per file requests both summary types simultaneously to minimize API cost:

- `friendlySummary` — Plain-English one-liner for non-technical users. Example: `"Handles user login and session management"`
- `expertSummary` — Technical one-liner with module type, key exports, dependency context. Example: `"Express middleware: exports verifyJWT(), refreshToken(). Depends on jsonwebtoken, 3 local deps"`

### AI Call Budget

| Feature | AI Calls | Timing |
|---|---|---|
| File summaries | 1 per selected file (batched where possible) | At analysis time |
| Codebase Tour | 1 total | At analysis time |
| Error diagnosis | 1 per query | On-demand, user opt-in toggle |
| Feature Advisor | 1 per query | On-demand, explicit panel |

### API Key Storage

Keys are saved to `~/.dirviz/config.json` on first use via `--ai-key`. Subsequent runs load the saved key automatically. Override at any time with `--ai-key <new-key>`.

---

## 10. Error Tracer — Detailed Behavior

### Step-by-step flow

1. User pastes a stack trace into the input box in the Error Tracer panel.
   Example input: `TypeError: Cannot read properties of undefined at src/auth/middleware.ts:42:15`

2. `errorTrace.js` runs a static regex parser — no AI needed — to extract all `file:line:col` references from the stack trace.

3. Matching file nodes are immediately highlighted on the graph.

4. Clicking a highlighted node opens the detail panel showing:
   - The file's summary (friendly or expert depending on current mode)
   - **Source code preview:** lines 37–47 of the file (5 lines above and below line 42), syntax highlighted
   - "Imports these files" and "Used by these files" lists
   - Blast radius count

5. **"Get AI diagnosis" toggle** (only visible when AI is enabled):
   - Sends the error message + summaries of all highlighted files to the AI provider
   - Returns a plain-English diagnosis explaining the likely cause and what to check
   - Displayed in a callout box inside the detail panel
   - Clearly labeled: "1 AI call used"

### Offline behavior

Steps 1–4 work with no AI and no internet connection. The source preview reads directly from the file on disk at serve time.

---

## 11. Feature Advisor — Detailed Behavior

### Online (AI enabled)

1. User clicks "Help me add a feature" button in Explorer or Architect mode.
2. A panel slides in with a text input field.
3. User types a natural-language request. Example: `"I want to add a dark mode toggle"`
4. The AI receives: the user's request + the full graph structure (node ids, folder names, summaries, import counts).
5. The AI returns a ranked list of files with explanations:
   - **Explorer output:** `"styles/theme.css — this file controls all visual styles and color variables"`
   - **Architect output:** `"Extend the ThemeContext interface in context/ThemeContext.ts, update useTheme() in hooks/useTheme.ts, add CSS variables to styles/globals.css"`
6. Relevant files are highlighted on the graph and listed in the panel.

### Offline (AI disabled)

1. Same panel, same input field.
2. Keywords are extracted from the user's request (e.g. `"dark"`, `"mode"`, `"toggle"`, `"theme"`, `"style"`).
3. Keywords are matched against: filenames, folder names, file extensions, and any existing AI summaries from the initial analysis.
4. Matching files are highlighted on the graph.
5. Results are shown with a clear note: `"AI disabled — showing files matching keywords from your request"` — no false confidence implied.

---

## 12. CLI Interface

```
Usage:
  dirviz [directory]               Analyze a directory (default: current directory)

Options:
  --port <n>                       Local server port (default: 4000)
  --mode explorer|architect        Starting UI mode (default: explorer)
  --no-ai                          Disable all AI features
  --ai-provider <name>             openai | anthropic | gemini | ollama
  --ai-model <name>                Model name override (see Section 9 for defaults)
  --ai-key <key>                   API key — saved to ~/.dirviz/config.json
  --ai-limit <n>                   Max files to AI-summarize (default: 50)
  --ignore <patterns>              Extra comma-separated ignore patterns
  --depth <n>                      Max directory depth to analyze
  --open / --no-open               Auto-open browser (default: --open)
  --version                        Show version number
  --help                           Show help
```

---

## 13. Config File (`~/.dirviz/config.json`)

```json
{
  "aiProvider": "openai",
  "aiModel": null,
  "apiKeys": {
    "openai": "sk-...",
    "anthropic": "sk-ant-...",
    "gemini": "AIza...",
    "ollama": null
  },
  "defaultAiLimit": 50,
  "defaultPort": 4000
}
```

- `aiModel: null` means use the provider's default model. Set to a string (e.g. `"gpt-4o"`) to override globally.
- `ollama` does not require an API key — its value is always `null`.
- This file is created automatically on first run when `--ai-key` is provided.

---

## 14. Default Ignore Patterns

The following are ignored by default during directory crawl:

```
# Dependency and build output
node_modules/    .git/           dist/           build/
.next/           .nuxt/          .output/        .cache/
__pycache__/     .venv/          venv/           .env/

# Generated and compiled files
*.lock           *.map           *.min.js        *.min.css

# Binary and media assets
*.png  *.jpg  *.jpeg  *.gif  *.svg  *.ico  *.webp
*.woff *.woff2 *.ttf  *.eot
*.zip  *.tar   *.gz   *.exe  *.dll
```

Users add extra patterns via `--ignore "coverage,storybook-static,.turbo"`.

---

## 15. npm Dependencies

| Package | Purpose |
|---|---|
| `@babel/parser` | AST-based JS/TS import and export extraction |
| `@babel/traverse` | Walks the AST produced by `@babel/parser` |
| `yargs` | CLI argument parsing and help text generation |
| `openai` | OpenAI API client |
| `@anthropic-ai/sdk` | Anthropic Claude API client |
| `@google/generative-ai` | Google Gemini API client |
| `ollama` | Ollama local model client |
| `open` | Cross-platform browser auto-open |
| D3.js v7 | Graph rendering — loaded via CDN in the UI HTML, not bundled into the CLI |

**TypeScript dev dependencies:** `typescript`, `@types/node`, `ts-node`, `esbuild`

`esbuild` is used exclusively to bundle D3.js into the UI output during `npm run build`. It is a dev dependency and is not shipped with the published package.

---

## 16. Build and Publish

### Publishing to npm

- TypeScript source in `src/` compiled to `dist/` via `tsc`
- UI files (`src/ui/`) copied to `dist/ui/` as-is — no bundler, pure vanilla JS and CSS
- `package.json` `bin` field points to `dist/cli.js`
- Published to npm as `dirviz`
- Executable via `npx dirviz` with no global install required

### Local Installation from Source

Anyone can clone the repository and run the tool locally without npm or an internet connection after the initial clone:

```bash
# Clone the repository
git clone https://github.com/your-org/dirviz.git
cd dirviz

# Install dependencies
npm install

# Compile TypeScript to dist/
npm run build

# Register the dirviz command globally on the local machine
npm link

# Run against any directory
dirviz /path/to/your/project
```

To uninstall: `npm unlink -g dirviz`

To update to the latest source: `git pull && npm run build`

### Requirements

| Requirement | Minimum Version | Notes |
|---|---|---|
| Node.js | v18.0.0 | Required for built-in `fetch`, `fs/promises`, and modern ESM support |
| npm | v8.0.0 | Bundled with Node.js v18 |
| Git | Any | Only needed for local source installation |
| Browser | Any modern browser | Chrome, Firefox, Safari, Edge — for the UI |

Node.js v18+ is the only hard requirement to run the tool. No other system dependencies are needed.

### D3.js Delivery

D3.js is bundled directly into the compiled UI output (`dist/ui/graph.js`) via `esbuild` as part of `npm run build`. It is **not** loaded from a CDN. This means:

- The UI works fully offline after `npm install && npm run build`
- No CDN dependency, no third-party requests from the browser
- `npx` and global npm installs include the pre-bundled D3 in the published package

This differs from the initial prototype approach (CDN) and was chosen specifically to support local offline usage.

---

## 17. Decisions Log

This section records key design decisions made during planning, and the reasoning behind them.

| Decision | Choice | Reason |
|---|---|---|
| UI framework | Vanilla JS + D3.js | No build step for UI, single self-contained HTML file, no framework version drift |
| HTTP server | Node built-in `http` module | Zero extra dependencies, no Express needed for a single-purpose local server |
| Graph data delivery | Injected as `window.__GRAPH_DATA__` | No CORS, no second HTTP request, works offline after initial analysis |
| AI default models | Cheapest/fastest per provider | Users running this on large codebases should not face large unexpected bills |
| AI file selection | Rank by `importedBy + imports` | The most connected files are the most architecturally significant |
| Dual summaries | One API call per file for both | Halves AI cost compared to two separate calls per file |
| Error Tracer default | Offline static parsing | Free, instant, no API dependency for the core debugging workflow |
| Feature Advisor offline | Keyword matching | Provides value without AI while being honest about its limitations |
| Config storage | `~/.dirviz/config.json` | Persistent across projects, user doesn't need to re-enter keys every run |
| Ollama default model | `llama3` | Most widely pulled Ollama model, best general-purpose reliability |
| D3.js delivery | Bundled via esbuild (not CDN) | Supports fully offline local installation — no internet needed after `npm install` |
| Local install support | `npm link` after `npm run build` | Standard Node.js workflow, works on any OS, no special tooling required |
| Node.js minimum version | v18.0.0 | Required for built-in `fetch` (no `node-fetch` dependency), `fs/promises`, and ESM |

---

## 18. Installation Methods Summary

| Method | Command | Internet required | Best for |
|---|---|---|---|
| npx (no install) | `npx dirviz [dir]` | On first run only | Trying it out quickly |
| Global npm install | `npm install -g dirviz` | During install | Regular use across projects |
| Local source install | `git clone` + `npm install` + `npm link` | During clone/install | Contributing, customizing, fully offline use |

All three methods produce an identical runtime experience. The local source install is the only method that allows the tool to run with zero internet dependency after setup.
