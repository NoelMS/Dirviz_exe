import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

export interface ParseResult {
  imports: string[];   // raw import specifiers found
  exports: string[];   // exported names
}

export function parseJsTs(absolutePath: string, relativePath: string): ParseResult {
  let source: string;
  try {
    source = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return { imports: [], exports: [] };
  }

  const imports: string[] = [];
  const exports: string[] = [];

  try {
    const ast = parse(source, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: [
        'typescript',
        'jsx',
        'decorators-legacy',
        'classProperties',
        'dynamicImport',
        'optionalChaining',
        'nullishCoalescingOperator',
      ],
    });

    traverse(ast, {
      ImportDeclaration({ node }) {
        imports.push(node.source.value);
      },
      ExportNamedDeclaration({ node }) {
        if (node.source) {
          imports.push(node.source.value);
        }
        if (node.declaration) {
          // e.g. export function foo() {}
          const decl = node.declaration as any;
          if (decl.id?.name) exports.push(decl.id.name);
          if (decl.declarations) {
            for (const d of decl.declarations) {
              if (d.id?.name) exports.push(d.id.name);
            }
          }
        }
        for (const spec of node.specifiers || []) {
          exports.push((spec as any).exported.name || (spec as any).exported.value);
        }
      },
      ExportDefaultDeclaration({ node }) {
        exports.push('default');
      },
      // require() calls
      CallExpression({ node }) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length > 0 &&
          node.arguments[0].type === 'StringLiteral'
        ) {
          imports.push((node.arguments[0] as any).value);
        }
        // dynamic import()
        if (
          node.callee.type === 'Import' &&
          node.arguments.length > 0 &&
          node.arguments[0].type === 'StringLiteral'
        ) {
          imports.push((node.arguments[0] as any).value);
        }
      },
    });
  } catch {
    // parse failure — fall through with empty results
  }

  return { imports: [...new Set(imports)], exports: [...new Set(exports)] };
}

/** Resolves a raw import specifier to a relative file id, or null if external */
export function resolveImport(
  specifier: string,
  importerPath: string,   // relative path of the importing file
  allIds: Set<string>
): string | null {
  // External package (doesn't start with . or /)
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;

  const importerDir = path.dirname(importerPath);
  const resolved = path.join(importerDir, specifier).replace(/\\/g, '/');

  // Try exact match first
  if (allIds.has(resolved)) return resolved;

  // Try adding extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  for (const ext of extensions) {
    if (allIds.has(resolved + ext)) return resolved + ext;
  }

  // Try index files
  for (const ext of extensions) {
    const withIndex = resolved + '/index' + ext;
    if (allIds.has(withIndex)) return withIndex;
  }

  return null;
}
