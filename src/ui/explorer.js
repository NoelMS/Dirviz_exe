// explorer.js — Explorer mode specific behavior (vibe coder audience)
// Most logic is handled in graph.js / app.js; this file adds Explorer-only UI tweaks

const ROLE_LABELS = {
  'entry-point':      'Entry Point',
  'ui-component':     'UI Component',
  'route-handler':    'Route Handler',
  'utility':          'Utility',
  'data-model':       'Data Model',
  'state-management': 'State',
  'middleware':       'Middleware',
  'config':           'Config',
  'test':             'Test',
  'styles':           'Styles',
  'types':            'Types',
  'build-script':     'Build Script',
  'documentation':    'Docs',
  'data-file':        'Data File',
  'storybook':        'Storybook',
  'hook':             'Hook',
  'core-shared':      'Core Shared',
  'standalone':       'Standalone',
  'leaf':             'Leaf',
};

window.Explorer = {
  init(graphData) {
    // Highlight entry points prominently
    const entryPoints = graphData.nodes.filter(n => n.isEntryPoint);
    if (entryPoints.length) {
      // Brief auto-focus on the first entry point on load
      setTimeout(() => {
        if (entryPoints[0]) window.DirvizGraph.focusNode(entryPoints[0].id);
      }, 800);
    }

    // Build and insert folder legend
    this.buildLegend(graphData);
  },

  buildLegend(graphData) {
    // Collect unique top-level folders
    const folders = [...new Set(graphData.nodes.map(n => n.id.split('/')[0] ?? 'root'))];
    if (folders.length < 2) return; // not worth showing

    const container = document.getElementById('canvas-container');
    if (!container) return;

    // Remove any existing legend
    const existing = document.getElementById('folder-legend');
    if (existing) existing.remove();

    const legend = document.createElement('div');
    legend.id = 'folder-legend';
    legend.innerHTML = `
      <div class="legend-header">
        <span class="legend-title">Folders</span>
        <button class="legend-toggle" title="Collapse">−</button>
      </div>
      <div class="legend-body">
        ${folders.map(folder => {
          const color = window.DirvizGraph?.folderColorScale?.(folder) ?? '#888';
          return `<div class="legend-item">
            <span class="legend-swatch" style="background:${color}"></span>
            <span class="legend-name">${folder}/</span>
          </div>`;
        }).join('')}
      </div>
    `;

    container.appendChild(legend);

    // Toggle collapse
    let collapsed = false;
    legend.querySelector('.legend-toggle').addEventListener('click', () => {
      collapsed = !collapsed;
      legend.querySelector('.legend-body').style.display = collapsed ? 'none' : '';
      legend.querySelector('.legend-toggle').textContent = collapsed ? '+' : '−';
    });
  },

  buildTooltip(node) {
    const folder = node.id.split('/')[0] ?? 'root';
    const usedByText = node.importedByCount === 0
      ? 'Not used by any other file'
      : `Used by ${node.importedByCount} file${node.importedByCount !== 1 ? 's' : ''}`;
    const summary = node.friendlySummary ?? node.expertSummary ?? '';
    const roleLabel = ROLE_LABELS[node.role] ?? '';
    const roleBadge = roleLabel
      ? `<span class="role-badge role-${node.role}">${roleLabel}</span>`
      : '';
    return `
      <div class="tt-name">${node.label}${roleBadge}</div>
      ${summary ? `<div class="tt-summary">${summary}</div>` : ''}
      <div class="tt-meta">${usedByText} · Part of <em>${folder}/</em></div>
    `;
  },
};
