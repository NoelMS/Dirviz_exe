// panel.js — slide-in detail panel

window.Panel = {
  currentNodeId: null,
  graphData: null,
  mode: 'explorer',

  init(graphData, mode) {
    this.graphData = graphData;
    this.mode = mode;
    document.getElementById('panel-close').addEventListener('click', () => this.close());
  },

  show(node) {
    this.currentNodeId = node.id;
    const panel = document.getElementById('detail-panel');
    const content = document.getElementById('panel-content');
    content.innerHTML = this._render(node);
    panel.classList.remove('hidden');

    // File links in import/used-by lists
    content.querySelectorAll('[data-node-id]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.nodeId;
        const n = this.graphData.nodes.find(x => x.id === id);
        if (n) { window.DirvizGraph.focusNode(id); this.show(n); }
      });
    });

    // Blast radius button
    content.querySelector('#blast-btn')?.addEventListener('click', () => {
      const downstream = window.BlastRadius.trigger(node.id, this.graphData);
      const countEl = content.querySelector('#blast-count-text');
      if (countEl) countEl.textContent = `${downstream.length} file${downstream.length !== 1 ? 's' : ''} affected`;
    });
  },

  close() {
    document.getElementById('detail-panel').classList.add('hidden');
    this.currentNodeId = null;
    window.DirvizGraph.clearHighlights();
  },

  setMode(mode) {
    this.mode = mode;
    if (this.currentNodeId) {
      const n = this.graphData.nodes.find(x => x.id === this.currentNodeId);
      if (n) this.show(n);
    }
  },

  _render(node) {
    const imports = this.graphData.edges
      .filter(e => (e.source?.id ?? e.source) === node.id)
      .map(e => e.target?.id ?? e.target);
    const usedBy = this.graphData.edges
      .filter(e => (e.target?.id ?? e.target) === node.id)
      .map(e => e.source?.id ?? e.source);

    const isExplorer = this.mode === 'explorer';

    const summary = isExplorer
      ? (node.friendlySummary ?? node.expertSummary ?? '<span style="color:var(--text-muted)">No summary available.</span>')
      : (node.expertSummary ?? node.friendlySummary ?? '<span style="color:var(--text-muted)">No summary available.</span>');

    const summaryClass = isExplorer ? 'friendly' : 'expert';

    const metricRows = isExplorer
      ? `
        <div class="metric-row"><span class="label">Used by</span><span class="value">${node.importedByCount} file${node.importedByCount !== 1 ? 's' : ''}</span></div>
        <div class="metric-row"><span class="label">Imports</span><span class="value">${node.importCount} file${node.importCount !== 1 ? 's' : ''}</span></div>
        <div class="metric-row"><span class="label">Size</span><span class="value">${formatBytes(node.size)}</span></div>
      `
      : `
        <div class="metric-row"><span class="label">Lines of code</span><span class="value">${node.loc}</span></div>
        <div class="metric-row"><span class="label">File size</span><span class="value">${formatBytes(node.size)}</span></div>
        <div class="metric-row"><span class="label">Imports</span><span class="value">${node.importCount}</span></div>
        <div class="metric-row"><span class="label">Used by</span><span class="value">${node.importedByCount}</span></div>
        <div class="metric-row"><span class="label">Exports</span><span class="value">${(node.exports ?? []).length}</span></div>
        <div class="metric-row"><span class="label">Type</span><span class="value" style="font-family:monospace">${node.ext}</span></div>
      `;

    const exportsSection = (!isExplorer && node.exports?.length)
      ? `<h3>Exports</h3>
         <ul class="file-list">${node.exports.map(e => `<li style="cursor:default;color:var(--accent2)">${e}</li>`).join('')}</ul>`
      : '';

    const importsList = imports.length
      ? `<h3>${isExplorer ? 'Imports these files' : 'Imports'}</h3>
         <ul class="file-list">${imports.map(id => `<li data-node-id="${id}">${id}</li>`).join('')}</ul>`
      : '';

    const usedByList = usedBy.length
      ? `<h3>${isExplorer ? 'Used by these files' : 'Imported by'}</h3>
         <ul class="file-list">${usedBy.map(id => `<li data-node-id="${id}">${id}</li>`).join('')}</ul>`
      : '';

    return `
      <div class="panel-filename">${node.label}</div>
      <div class="panel-path">${node.id}</div>
      <div class="panel-summary ${summaryClass}">${summary}</div>
      <div>${metricRows}</div>
      <div class="blast-count" id="blast-btn">
        Show blast radius — <span id="blast-count-text">click to compute</span>
      </div>
      <div id="source-preview-container"></div>
      ${exportsSection}
      ${importsList}
      ${usedByList}
      <div id="ai-diagnosis-container"></div>
    `;
  },

  async showSourcePreview(fileId, line) {
    try {
      const res = await fetch(`/api/source?id=${encodeURIComponent(fileId)}&line=${line}`);
      if (!res.ok) return;
      const data = await res.json();
      const container = document.getElementById('source-preview-container');
      if (!container) return;

      const linesHtml = data.lines.map((l, i) => {
        const ln = data.startLine + i;
        const isErr = ln === data.errorLine;
        return `<div class="source-line${isErr ? ' error-line' : ''}">
          <span class="ln">${ln}</span>
          <span class="lc">${escapeHtml(l)}</span>
        </div>`;
      }).join('');

      container.innerHTML = `
        <div class="source-preview">
          <div class="source-preview-header">Lines around line ${line} in ${fileId}</div>
          <div class="source-lines">${linesHtml}</div>
        </div>`;
    } catch { /* non-fatal */ }
  },

  showAiDiagnosis(text) {
    const container = document.getElementById('ai-diagnosis-container');
    if (!container) return;
    container.innerHTML = `
      <div class="ai-diagnosis">
        <div class="ai-label">AI Diagnosis (1 call used)</div>
        ${escapeHtml(text)}
      </div>`;
  },
};

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
