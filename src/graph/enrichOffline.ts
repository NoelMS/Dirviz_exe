import * as fs from 'fs';
import * as path from 'path';
import { GraphNode } from './builder';

// ── Role detection ────────────────────────────────────────────────────────────

export type NodeRole =
  | 'entry-point'
  | 'ui-component'
  | 'route-handler'
  | 'utility'
  | 'data-model'
  | 'state-management'
  | 'middleware'
  | 'config'
  | 'test'
  | 'styles'
  | 'types'
  | 'build-script'
  | 'documentation'
  | 'data-file'
  | 'storybook'
  | 'hook'
  | 'core-shared'
  | 'standalone'
  | 'leaf'
  | 'unknown';

interface ProjectContext {
  packageDescription: string | null;
  packageScripts: Record<string, string>;
  readmeIntro: string | null;
  mainFile: string | null;
}

export function enrichOffline(nodes: GraphNode[], rootDir: string): void {
  const ctx = readProjectContext(rootDir);

  for (const node of nodes) {
    const role = detectRole(node, ctx);
    node.role = role;

    if (!node.friendlySummary) {
      node.friendlySummary = buildFriendlySummary(node, role, ctx);
    }
    if (!node.expertSummary) {
      node.expertSummary = buildExpertSummary(node, role, ctx);
    }
  }
}

// ── Project context ───────────────────────────────────────────────────────────

function readProjectContext(rootDir: string): ProjectContext {
  let packageDescription: string | null = null;
  let packageScripts: Record<string, string> = {};
  let mainFile: string | null = null;
  let readmeIntro: string | null = null;

  // Read package.json
  try {
    const pkgPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      packageDescription = pkg.description ?? null;
      packageScripts = pkg.scripts ?? {};
      // Resolve main entry
      if (pkg.main) mainFile = pkg.main.replace(/^\.\//, '');
      else if (pkg.bin) {
        const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin as Record<string, string>);
        mainFile = (bins[0] as string)?.replace(/^\.\//, '') ?? null;
      }
    }
  } catch { /* ignore */ }

  // Read README
  try {
    const readmeCandidates = ['README.md', 'readme.md', 'Readme.md'];
    for (const name of readmeCandidates) {
      const p = path.join(rootDir, name);
      if (fs.existsSync(p)) {
        const lines = fs.readFileSync(p, 'utf8').split('\n');
        // Skip headings and blank lines, grab first real paragraph
        const para: string[] = [];
        let inPara = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!') || trimmed.startsWith('<')) {
            if (inPara && para.length) break;
            continue;
          }
          inPara = true;
          para.push(trimmed);
          if (para.length >= 3) break;
        }
        if (para.length) readmeIntro = para.join(' ').slice(0, 200);
        break;
      }
    }
  } catch { /* ignore */ }

  return { packageDescription, packageScripts, readmeIntro, mainFile };
}

// ── Role detection ────────────────────────────────────────────────────────────

function detectRole(node: GraphNode, ctx: ProjectContext): NodeRole {
  const id = node.id.toLowerCase();
  const label = node.label.toLowerCase();
  const ext = node.ext;
  const parts = id.split('/');
  const folders = parts.slice(0, -1);

  // Entry point — check first
  if (node.isEntryPoint) return 'entry-point';
  if (ctx.mainFile && node.id === ctx.mainFile) return 'entry-point';

  // Test files
  if (
    label.includes('.test.') || label.includes('.spec.') ||
    folders.some(f => f === 'test' || f === 'tests' || f === '__tests__' || f === 'spec' || f === 'specs')
  ) return 'test';

  // Storybook
  if (label.includes('.stories.') || label.includes('.story.')) return 'storybook';

  // Type definitions
  if (label.endsWith('.d.ts') || label.includes('.types.') || folders.some(f => f === 'types' || f === '@types')) return 'types';

  // Config files
  if (
    label.includes('.config.') || label === '.env' || label.startsWith('.env.') ||
    ext === '.yaml' || ext === '.yml' || ext === '.toml' ||
    (ext === '.json' && (label.includes('config') || label.includes('settings') || label === 'package.json' || label === 'tsconfig.json')) ||
    folders.some(f => f === 'config' || f === 'configs' || f === 'settings' || f === 'configuration')
  ) return 'config';

  // Build scripts
  if (folders.some(f => f === 'scripts' || f === 'build' || f === 'tools') ||
      (label.includes('build') || label.includes('deploy') || label.includes('release')) && ext === '.js'
  ) return 'build-script';

  // Styles
  if (ext === '.css' || ext === '.scss' || ext === '.less' || ext === '.sass') return 'styles';

  // Documentation
  if (ext === '.md' || ext === '.mdx' || ext === '.txt') return 'documentation';

  // Data files
  if (ext === '.json' || ext === '.csv' || ext === '.xml') return 'data-file';

  // Hooks (React/Vue/etc.)
  if (
    (label.startsWith('use') && /use[A-Z]/.test(node.label)) ||
    folders.some(f => f === 'hooks' || f === 'composables')
  ) return 'hook';

  // State management
  if (
    folders.some(f => ['store', 'stores', 'redux', 'zustand', 'mobx', 'context', 'state', 'atoms'].includes(f)) ||
    label.includes('store') || label.includes('reducer') || label.includes('action') || label.includes('slice') || label.includes('context')
  ) return 'state-management';

  // Middleware
  if (
    folders.some(f => f === 'middleware' || f === 'middlewares') ||
    label.includes('middleware') || label.includes('interceptor') || label.includes('guard')
  ) return 'middleware';

  // Data models / schemas
  if (
    folders.some(f => ['models', 'model', 'schemas', 'schema', 'entities', 'dto', 'dtos'].includes(f)) ||
    label.includes('model') || label.includes('schema') || label.includes('entity') || label.includes('dto')
  ) return 'data-model';

  // Route handlers / API
  if (
    folders.some(f => ['routes', 'route', 'api', 'controllers', 'controller', 'handlers', 'endpoints'].includes(f)) ||
    label.includes('route') || label.includes('controller') || label.includes('handler') || label.includes('endpoint')
  ) return 'route-handler';

  // UI components
  if (
    folders.some(f => ['components', 'component', 'ui', 'views', 'pages', 'layouts', 'screens', 'widgets'].includes(f)) ||
    (node.ext === '.tsx' || node.ext === '.jsx' || node.ext === '.vue' || node.ext === '.svelte') ||
    (node.exports?.some(e => /^[A-Z]/.test(e))) // PascalCase export = likely component
  ) return 'ui-component';

  // Utilities / helpers
  if (
    folders.some(f => ['utils', 'util', 'helpers', 'helper', 'lib', 'libs', 'shared', 'common'].includes(f)) ||
    label.includes('util') || label.includes('helper') || label.includes('format') ||
    label.includes('parse') || label.includes('transform')
  ) return 'utility';

  // Graph-based roles (fallback)
  if (node.importedByCount === 0 && node.importCount === 0) return 'standalone';
  if (node.importedByCount > 5) return 'core-shared';
  if (node.importCount === 0) return 'leaf';

  return 'unknown';
}

// ── Friendly summary ──────────────────────────────────────────────────────────

const ROLE_FRIENDLY: Record<NodeRole, string> = {
  'entry-point':      'This is where the app starts.',
  'ui-component':     'A visual piece of the user interface.',
  'route-handler':    'Handles incoming requests from users or other services.',
  'utility':          'A helper — provides reusable functions used across the project.',
  'data-model':       'Defines the shape of data (like a database table or schema).',
  'state-management': 'Manages shared app state — what the app "remembers".',
  'middleware':        'Sits between requests and responses, handling cross-cutting logic.',
  'config':           'Configuration — sets up how the app behaves.',
  'test':             'A test file — verifies that code works correctly.',
  'styles':           'Visual styles — controls how things look.',
  'types':            'Type definitions — describes the shape of data for TypeScript.',
  'build-script':     'A script used to build, bundle, or deploy the project.',
  'documentation':    'Documentation — explains how things work.',
  'data-file':        'Raw data or configuration in a structured format.',
  'storybook':        'A Storybook story — shows a UI component in isolation.',
  'hook':             'A reusable logic hook — encapsulates behaviour for components.',
  'core-shared':      'A core shared file — used by many other parts of the app.',
  'standalone':       'A standalone file — not connected to anything else.',
  'leaf':             'A leaf file — doesn\'t import any other project files.',
  'unknown':          '',
};

function buildFriendlySummary(node: GraphNode, role: NodeRole, ctx: ProjectContext): string {
  const parts: string[] = [];

  // For entry points, use README intro or package description if available
  if (role === 'entry-point') {
    if (ctx.readmeIntro) return ctx.readmeIntro;
    if (ctx.packageDescription) return ctx.packageDescription;
    return ROLE_FRIENDLY['entry-point'];
  }

  const roleText = ROLE_FRIENDLY[role];
  if (roleText) parts.push(roleText);

  // Add connection context
  if (node.importedByCount > 5) {
    parts.push(`It\'s used by ${node.importedByCount} other files — a central piece.`);
  } else if (node.importedByCount > 1) {
    parts.push(`Used by ${node.importedByCount} other files.`);
  } else if (node.importedByCount === 1) {
    parts.push(`Used by 1 other file.`);
  }

  return parts.join(' ') || node.label;
}

// ── Expert summary ────────────────────────────────────────────────────────────

const ROLE_EXPERT: Record<NodeRole, string> = {
  'entry-point':      'Application entry point.',
  'ui-component':     'UI component.',
  'route-handler':    'Route/request handler.',
  'utility':          'Utility/helper module.',
  'data-model':       'Data model/schema definition.',
  'state-management': 'State management module.',
  'middleware':        'Middleware/interceptor.',
  'config':           'Configuration module.',
  'test':             'Test suite.',
  'styles':           'Stylesheet.',
  'types':            'Type definitions.',
  'build-script':     'Build/deploy script.',
  'documentation':    'Documentation.',
  'data-file':        'Data/config file.',
  'storybook':        'Storybook story.',
  'hook':             'Custom hook/composable.',
  'core-shared':      `Highly-connected shared module.`,
  'standalone':       'Isolated module — no edges.',
  'leaf':             'Leaf node — no outgoing imports.',
  'unknown':          '',
};

function buildExpertSummary(node: GraphNode, role: NodeRole, ctx: ProjectContext): string {
  const roleText = ROLE_EXPERT[role] || '';
  const stats = `imports=${node.importCount} importedBy=${node.importedByCount} loc=${node.loc}`;
  const exportsText = node.exports?.length ? ` exports=[${node.exports.slice(0, 4).join(', ')}${node.exports.length > 4 ? '…' : ''}]` : '';
  return [roleText, stats + exportsText].filter(Boolean).join(' | ');
}
