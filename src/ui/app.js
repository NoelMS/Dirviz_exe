// app.js — Bootstrap and orchestration

(function () {
  // Surface any silent JS errors on screen
  window.addEventListener('error', (e) => {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      const txt = document.getElementById('loading-text');
      if (txt) {
        txt.style.color = '#f85149';
        txt.textContent = 'Error: ' + (e.message || 'Unknown JS error') + ' — open DevTools (F12) for details';
      }
      const spinner = document.getElementById('loading-spinner');
      if (spinner) spinner.style.display = 'none';
    }
  });

  const G = window.__GRAPH_DATA__;
  if (!G) {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#8892a4;font-family:sans-serif">No graph data loaded. Run dirviz from your terminal.</div>';
    return;
  }

  window.App = { currentMode: 'explorer', graphData: G };

  // ── Meta info ─────────────────────────────────────────────────────
  const meta = document.getElementById('meta-info');
  if (meta) {
    const ai = G.meta.aiProvider ? `· AI: ${G.meta.aiProvider}` : '· No AI';
    meta.textContent = `${G.meta.totalFiles} files · ${G.meta.totalEdges} connections ${ai}`;
  }

  // ── Init graph ────────────────────────────────────────────────────
  if (window.__BUNDLE_FAILED__ || !window.DirvizGraph || !window.DirvizGraph.init) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('hidden');
    const txt = document.getElementById('loading-text');
    if (txt) {
      txt.style.color = '#f85149';
      txt.textContent = window.__BUNDLE_FAILED__
        ? 'Error: graph.bundle.js failed to load — try a hard refresh (Ctrl+Shift+R)'
        : 'Error: DirvizGraph not initialized — graph.bundle.js may have crashed. Open DevTools (F12) > Console for details.';
    }
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.style.display = 'none';
    return;
  }
  window.DirvizGraph.init({
    data: G,
    mode: 'explorer',
    onClickNode: (node) => {
      window.Panel.show(node);
    },
    onHoverNode: (node, event) => {
      const tt = document.getElementById('tooltip');
      const html = window.App.currentMode === 'explorer'
        ? window.Explorer.buildTooltip(node)
        : window.Architect.buildTooltip(node);
      tt.innerHTML = html;
      tt.classList.remove('hidden');
      positionTooltip(tt, event);
    },
    onHoverEnd: () => {
      document.getElementById('tooltip').classList.add('hidden');
    },
  });

  document.addEventListener('mousemove', (e) => {
    const tt = document.getElementById('tooltip');
    if (!tt.classList.contains('hidden')) positionTooltip(tt, e);
  });

  // ── Init modules ──────────────────────────────────────────────────
  window.Panel.init(G, 'explorer');
  window.Explorer.init(G);
  window.Architect.init(G);
  window.Filters.init(G);
  window.Tour.init(G);
  window.ErrorTrace.init(G);
  window.FeatureAdvisor.init(G, 'explorer');

  // ── Mode toggle ───────────────────────────────────────────────────
  document.getElementById('mode-explorer').addEventListener('click', () => setMode('explorer'));
  document.getElementById('mode-architect').addEventListener('click', () => setMode('architect'));

  function setMode(mode) {
    window.App.currentMode = mode;
    document.getElementById('mode-explorer').classList.toggle('active', mode === 'explorer');
    document.getElementById('mode-architect').classList.toggle('active', mode === 'architect');
    window.DirvizGraph.setMode(mode);
    window.Panel.setMode(mode);
    window.FeatureAdvisor.setMode(mode);
  }

  // ── Zoom controls ─────────────────────────────────────────────────
  document.getElementById('zoom-in').addEventListener('click', () => window.DirvizGraph.zoomBy(1.4));
  document.getElementById('zoom-out').addEventListener('click', () => window.DirvizGraph.zoomBy(0.7));
  document.getElementById('zoom-reset').addEventListener('click', () => window.DirvizGraph.resetZoom());

  // ── Keyboard shortcuts ────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      document.getElementById('search-input').focus();
    }
    if (e.key === 'Escape') {
      window.Panel.close();
      window.Tour.close?.();
      window.ErrorTrace.close?.();
      window.FeatureAdvisor.close?.();
      window.DirvizGraph.clearHighlights();
    }
    if (e.key === 'r' || e.key === 'R') {
      window.DirvizGraph.resetZoom();
    }
    if (e.key === 't' || e.key === 'T') {
      window.Tour.open();
    }
  });

  function positionTooltip(tt, e) {
    const pad = 12;
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    const rect = tt.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - pad;
    tt.style.left = x + 'px';
    tt.style.top = y + 'px';
  }
})();
