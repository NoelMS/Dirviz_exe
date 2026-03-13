// architect.js — Architect mode specific behavior (expert coder audience)

window.Architect = {
  init(graphData) {
    // Flag circular deps and orphans in the graph data so graph.js can style them
    this._annotate(graphData);
  },

  _annotate(graphData) {
    const adj = new Map();
    for (const e of graphData.edges) {
      const s = e.source?.id ?? e.source;
      const t = e.target?.id ?? e.target;
      if (!adj.has(s)) adj.set(s, new Set());
      adj.get(s).add(t);
    }

    // Mark orphans
    for (const n of graphData.nodes) {
      n._isOrphan = n.importCount === 0 && n.importedByCount === 0;
    }
  },

  buildTooltip(node) {
    return `
      <div class="tt-name" style="font-family:monospace">${node.id}</div>
      ${node.expertSummary ? `<div class="tt-summary">${node.expertSummary}</div>` : ''}
      <div class="tt-meta">
        ${node.loc} LOC · ${formatBytes(node.size)} · ${node.importCount} imports · ${node.importedByCount} used by
        ${node._isOrphan ? ' · <span style="color:var(--text-muted)">orphan</span>' : ''}
      </div>
    `;
  },
};

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}
