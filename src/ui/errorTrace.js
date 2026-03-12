// errorTrace.js — Error Tracer panel

window.ErrorTrace = {
  graphData: null,
  currentMatches: [],

  init(graphData) {
    this.graphData = graphData;
    document.getElementById('error-btn').addEventListener('click', () => this.open());
    document.getElementById('error-close').addEventListener('click', () => this.close());
    document.getElementById('error-trace-btn').addEventListener('click', () => this.trace());
  },

  open() {
    document.getElementById('error-panel').classList.remove('hidden');
    document.getElementById('tour-panel').classList.add('hidden');
    document.getElementById('feature-panel').classList.add('hidden');
    document.getElementById('error-input').focus();
  },

  close() {
    document.getElementById('error-panel').classList.add('hidden');
    window.DirvizGraph.clearHighlights();
  },

  trace() {
    const input = document.getElementById('error-input').value.trim();
    if (!input) return;

    const matches = this._parseStackTrace(input);
    this.currentMatches = matches;

    const ids = matches.map(m => m.fileId);
    if (ids.length > 0) {
      window.DirvizGraph.highlightNodes(ids, 'error-node');
      window.DirvizGraph.focusNode(ids[0]);
    }

    this._renderResults(matches, input);
  },

  _parseStackTrace(text) {
    const results = [];
    const seen = new Set();

    // Match patterns like:
    // at src/auth/middleware.ts:42:15
    // at Object.<anonymous> (src/auth/middleware.ts:42:15)
    // File "src/utils.py", line 20
    const patterns = [
      /(?:at\s+(?:\S+\s+\()?)([\w/.\-]+\.\w+):(\d+)(?::(\d+))?/g,
      /File "([^"]+)", line (\d+)/g,
      /([\w/.\-]+\.\w+):(\d+)/g,
    ];

    for (const pattern of patterns) {
      let m;
      while ((m = pattern.exec(text)) !== null) {
        const rawPath = m[1];
        const line = parseInt(m[2], 10);

        // Try to find a matching node
        const node = this.graphData.nodes.find(n =>
          n.id === rawPath ||
          n.id.endsWith('/' + rawPath) ||
          rawPath.endsWith(n.id)
        );

        if (node && !seen.has(node.id)) {
          seen.add(node.id);
          results.push({ fileId: node.id, rawPath, line });
        }
      }
    }

    return results;
  },

  _renderResults(matches, errorText) {
    const container = document.getElementById('error-results');
    if (matches.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:12px;margin-top:10px">No matching files found in this project. Make sure file paths in the stack trace match your project structure.</p>';
      return;
    }

    const aiEnabled = window.__GRAPH_DATA__?.meta?.aiProvider != null;

    const itemsHtml = matches.map(m => `
      <div class="error-result-item" data-file="${m.fileId}" data-line="${m.line}">
        <div class="err-file">${m.fileId}</div>
        <div class="err-line">Line ${m.line} — click to view source</div>
      </div>
    `).join('');

    const aiToggle = aiEnabled ? `
      <button id="ai-diagnose-btn" class="btn-primary" style="margin-top:12px">
        Get AI diagnosis (1 AI call)
      </button>
    ` : `<div class="offline-badge">AI disabled — paste the error into your AI assistant for a diagnosis</div>`;

    container.innerHTML = `
      <p style="font-size:12px;color:var(--text-muted);margin:10px 0 4px">${matches.length} file${matches.length !== 1 ? 's' : ''} found in stack trace</p>
      ${itemsHtml}
      ${aiToggle}
      <div id="diagnosis-output"></div>
    `;

    // Click on a result → open panel + show source
    container.querySelectorAll('.error-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const fileId = el.dataset.file;
        const line = parseInt(el.dataset.line, 10);
        const node = this.graphData.nodes.find(n => n.id === fileId);
        if (node) {
          window.DirvizGraph.focusNode(fileId);
          window.Panel.show(node);
          window.Panel.showSourcePreview(fileId, line);
        }
      });
    });

    // AI diagnosis
    document.getElementById('ai-diagnose-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('ai-diagnose-btn');
      btn.disabled = true;
      btn.textContent = 'Getting AI diagnosis...';
      try {
        const res = await fetch('/api/diagnose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ errorText, nodeIds: matches.map(m => m.fileId) }),
        });
        const data = await res.json();
        const out = document.getElementById('diagnosis-output');
        if (data.diagnosis) {
          out.innerHTML = `
            <div class="ai-diagnosis">
              <div class="ai-label">AI Diagnosis (1 call used)</div>
              ${escapeHtml(data.diagnosis)}
            </div>`;
        } else if (data.error) {
          out.innerHTML = `<p style="color:var(--danger);font-size:12px;margin-top:8px">${escapeHtml(data.error)}</p>`;
        }
      } catch (e) {
        document.getElementById('diagnosis-output').innerHTML =
          `<p style="color:var(--danger);font-size:12px;margin-top:8px">Request failed: ${e.message}</p>`;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Get AI diagnosis (1 AI call)';
      }
    });
  },
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
