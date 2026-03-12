// filters.js — filter bar logic

window.Filters = {
  activeExts: new Set(),
  activeFolder: '',
  searchQuery: '',
  graphData: null,

  init(graphData) {
    this.graphData = graphData;
    this._buildExtChips();
    this._buildFolderSelect();
    this._bindSearch();
  },

  _buildExtChips() {
    const extCounts = new Map();
    for (const n of this.graphData.nodes) {
      extCounts.set(n.ext, (extCounts.get(n.ext) ?? 0) + 1);
    }
    const bar = document.getElementById('ext-filters');
    bar.innerHTML = '';

    const EXT_COLORS = {
      '.ts': '#3b82f6', '.tsx': '#818cf8', '.js': '#f59e0b', '.jsx': '#fb923c',
      '.py': '#34d399', '.css': '#f472b6', '.scss': '#e879f9', '.json': '#94a3b8',
      '.html': '#f97316',
    };

    // Only show top 6 extensions by count
    const sorted = [...extCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    for (const [ext, count] of sorted) {
      const chip = document.createElement('span');
      chip.className = 'ext-chip active';
      chip.textContent = `${ext} (${count})`;
      chip.style.color = EXT_COLORS[ext] ?? '#94a3b8';
      chip.dataset.ext = ext;
      chip.addEventListener('click', () => this._toggleExt(ext, chip));
      bar.appendChild(chip);
      this.activeExts.add(ext);
    }
  },

  _buildFolderSelect() {
    const sel = document.getElementById('folder-filter');
    const folders = new Set(this.graphData.nodes.map(n => n.id.split('/')[0] ?? 'root'));
    sel.innerHTML = '<option value="">All folders</option>';
    for (const f of [...folders].sort()) {
      const opt = document.createElement('option');
      opt.value = f; opt.textContent = f;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      this.activeFolder = sel.value;
      this._apply();
    });
  },

  _bindSearch() {
    const input = document.getElementById('search-input');
    input.addEventListener('input', () => {
      this.searchQuery = input.value.trim().toLowerCase();
      this._apply();
    });
  },

  _toggleExt(ext, chip) {
    if (this.activeExts.has(ext)) {
      this.activeExts.delete(ext);
      chip.classList.remove('active');
    } else {
      this.activeExts.add(ext);
      chip.classList.add('active');
    }
    this._apply();
  },

  _apply() {
    const q = this.searchQuery;
    const filtered = this.graphData.nodes.filter(n => {
      if (this.activeExts.size > 0 && !this.activeExts.has(n.ext)) return false;
      if (this.activeFolder && n.id.split('/')[0] !== this.activeFolder) return false;
      if (q) {
        const haystack = (n.id + ' ' + (n.friendlySummary ?? '') + ' ' + (n.expertSummary ?? '')).toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    window.__FILTERED_NODES__ = filtered;
    // Re-render without full reinit
    window.DirvizGraph.setMode(window.App?.currentMode ?? 'explorer');
  },

  reset() {
    this.searchQuery = '';
    this.activeFolder = '';
    document.getElementById('search-input').value = '';
    document.getElementById('folder-filter').value = '';
    window.__FILTERED_NODES__ = null;
  },
};
