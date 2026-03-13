// tour.js — Codebase Tour panel

window.Tour = {
  init(graphData) {
    document.getElementById('tour-btn').addEventListener('click', () => this.open());
    document.getElementById('tour-close').addEventListener('click', () => this.close());
    this._render(graphData);
  },

  open() {
    document.getElementById('tour-panel').classList.remove('hidden');
    // Close other panels
    document.getElementById('error-panel').classList.add('hidden');
    document.getElementById('feature-panel').classList.add('hidden');
  },

  close() {
    document.getElementById('tour-panel').classList.add('hidden');
  },

  _render(graphData) {
    const content = document.getElementById('tour-content');
    if (graphData.tour) {
      content.textContent = graphData.tour;
    } else {
      // Auto-generate a simple tour from graph data if AI tour is unavailable
      const entryPoints = graphData.nodes.filter(n => n.isEntryPoint);
      const folders = [...new Set(graphData.nodes.map(n => n.id.split('/')[0]))];
      const totalFiles = graphData.meta.totalFiles;
      const totalEdges = graphData.meta.totalEdges;

      const lines = [
        `This codebase has ${totalFiles} files connected by ${totalEdges} import relationships.`,
        '',
        'Main entry points:',
        ...entryPoints.slice(0, 5).map(n => `  • ${n.id}${n.friendlySummary ? ' — ' + n.friendlySummary : ''}`),
        entryPoints.length === 0 ? '  (no clear entry points detected)' : '',
        '',
        'Top-level folders:',
        ...folders.map(f => {
          const count = graphData.nodes.filter(n => n.id.startsWith(f + '/')).length;
          return `  • ${f}/ — ${count} file${count !== 1 ? 's' : ''}`;
        }),
        '',
        'Tip: Click any node to see what it does and what it connects to.',
        'Tip: Use "Error Tracer" to find where a bug is happening.',
        'Tip: Use "+ Feature" to find which files to touch for a new feature.',
      ].filter(l => l !== undefined);

      content.textContent = lines.join('\n');
    }
  },
};
