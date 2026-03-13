// featureAdvisor.js — Feature Advisor panel

window.FeatureAdvisor = {
  graphData: null,
  mode: 'explorer',

  init(graphData, mode) {
    this.graphData = graphData;
    this.mode = mode;
    document.getElementById('feature-btn').addEventListener('click', () => this.open());
    document.getElementById('feature-close').addEventListener('click', () => this.close());
    document.getElementById('feature-submit-btn').addEventListener('click', () => this.submit());
  },

  open() {
    document.getElementById('feature-panel').classList.remove('hidden');
    document.getElementById('tour-panel').classList.add('hidden');
    document.getElementById('error-panel').classList.add('hidden');
    document.getElementById('feature-input').focus();
  },

  close() {
    document.getElementById('feature-panel').classList.add('hidden');
    window.DirvizGraph.clearHighlights();
  },

  setMode(mode) { this.mode = mode; },

  async submit() {
    const input = document.getElementById('feature-input').value.trim();
    if (!input) return;

    const btn = document.getElementById('feature-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Analyzing...';

    document.getElementById('feature-results').innerHTML =
      '<p style="color:var(--text-muted);font-size:12px;margin-top:10px">Finding relevant files...</p>';

    try {
      const res = await fetch('/api/feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: input }),
      });
      const data = await res.json();
      this._renderResults(data.results, data.offline, data.error);
    } catch (e) {
      document.getElementById('feature-results').innerHTML =
        `<p style="color:var(--danger);font-size:12px;margin-top:8px">Request failed: ${e.message}</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Find relevant files';
    }
  },

  _renderResults(results, offline, error) {
    const container = document.getElementById('feature-results');
    if (!results || results.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:12px;margin-top:10px">No relevant files found. Try rephrasing your request.</p>';
      return;
    }

    // Highlight matching nodes on the graph
    const ids = results.map(r => r.fileId);
    window.DirvizGraph.highlightNodes(ids, 'feature-match');
    window.DirvizGraph.focusNode(ids[0]);

    const offlineBadge = offline
      ? `<div class="offline-badge" style="margin-bottom:8px">AI disabled — showing keyword matches</div>`
      : '';

    const errorNote = error
      ? `<div class="offline-badge" style="margin-bottom:8px;border-color:var(--warn);color:var(--warn)">AI failed, showing keyword fallback</div>`
      : '';

    const itemsHtml = results.map((r, i) => {
      const reason = this.mode === 'explorer' ? r.friendlyReason : r.expertReason;
      return `
        <div class="feature-result-item" data-file="${r.fileId}">
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px">#${i + 1}</div>
          <div class="fr-file">${r.fileId}</div>
          <div class="fr-reason">${escapeHtml(reason ?? '')}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      ${offlineBadge}${errorNote}
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:4px">${results.length} relevant file${results.length !== 1 ? 's' : ''} found</p>
      ${itemsHtml}
    `;

    container.querySelectorAll('.feature-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const fileId = el.dataset.file;
        const node = this.graphData.nodes.find(n => n.id === fileId);
        if (node) { window.DirvizGraph.focusNode(fileId); window.Panel.show(node); }
      });
    });
  },
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
