// graph.js — D3.js core graph rendering
// Bundled with D3 via esbuild → graph.bundle.js

import * as d3 from 'd3';

// ── State ────────────────────────────────────────────────────────────
let svg, container, simulation, linkSel, nodeSel;
let currentMode = 'explorer';
let graphData = null;
let activeNodeId = null;
let blastNodeId = null;
let highlightedIds = new Set();
let onNodeClick = null;
let onNodeHover = null;
let onNodeHoverEnd = null;

// Folder → color mapping
const folderColorScale = d3.scaleOrdinal(d3.schemeTableau10);

// Extension → color (architect mode)
const EXT_COLORS = {
  '.ts': '#3b82f6', '.tsx': '#818cf8', '.js': '#f59e0b', '.jsx': '#fb923c',
  '.py': '#34d399', '.css': '#f472b6', '.scss': '#e879f9', '.json': '#94a3b8',
  '.html': '#f97316', '.vue': '#4ade80', '.svelte': '#ff6b35',
  '.md': '#64748b', '.sh': '#86efac', '(none)': '#475569',
};

// ── Public API ───────────────────────────────────────────────────────
window.DirvizGraph = window.DirvizGraph || {};

window.DirvizGraph.init = function({ data, mode, onClickNode, onHoverNode, onHoverEnd }) {
  graphData = data;
  currentMode = mode;
  onNodeClick = onClickNode;
  onNodeHover = onHoverNode;
  onNodeHoverEnd = onHoverEnd;

  svg = d3.select('#graph-svg');
  svg.selectAll('*').remove();

  const width  = svg.node().clientWidth  || window.innerWidth  || 800;
  const height = svg.node().clientHeight || window.innerHeight || 600;

  // Arrow marker for architect mode
  svg.append('defs').append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -4 8 8')
    .attr('refX', 14).attr('refY', 0)
    .attr('markerWidth', 6).attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-4L8,0L0,4')
    .attr('fill', '#4a5568');

  const zoom = d3.zoom().scaleExtent([0.05, 4]).on('zoom', (event) => {
    container.attr('transform', event.transform);
    updateMinimap(event.transform);
  });

  svg.call(zoom);
  window.DirvizGraph._zoom = zoom;
  window.DirvizGraph._svg = svg;

  container = svg.append('g').attr('id', 'graph-container');

  render(width, height);
};

window.DirvizGraph.setMode = function(mode) {
  currentMode = mode;
  const width  = svg.node().clientWidth  || window.innerWidth  || 800;
  const height = svg.node().clientHeight || window.innerHeight || 600;
  if (simulation) simulation.stop();
  render(width, height);
};

window.DirvizGraph.highlightNodes = function(ids, className = 'highlighted') {
  highlightedIds = new Set(ids);
  applyHighlights(className);
};

window.DirvizGraph.clearHighlights = function() {
  highlightedIds.clear();
  blastNodeId = null;
  applyHighlights('');
};

window.DirvizGraph.showBlast = function(nodeId) {
  blastNodeId = nodeId;
  const downstream = getDownstream(nodeId);
  nodeSel?.each(function(d) {
    const el = d3.select(this);
    if (d.id === nodeId) {
      el.classed('highlighted', true).classed('dimmed', false).classed('blast-affected', false);
    } else if (downstream.has(d.id)) {
      el.classed('blast-affected', true).classed('dimmed', false).classed('highlighted', false);
    } else {
      el.classed('dimmed', true).classed('blast-affected', false).classed('highlighted', false);
    }
  });
  linkSel?.each(function(d) {
    const isBlast = downstream.has(d.target.id ?? d.target) && (d.source.id ?? d.source) !== nodeId
      ? false : downstream.has(d.target.id ?? d.target) || d.source.id === nodeId;
    d3.select(this).classed('blast', isBlast);
  });
};

window.DirvizGraph.focusNode = function(nodeId) {
  if (!nodeSel) return;
  const node = graphData.nodes.find(n => n.id === nodeId);
  if (!node || !node.x) return;
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  const t = d3.zoomIdentity.translate(width / 2 - node.x, height / 2 - node.y).scale(1);
  svg.transition().duration(500).call(window.DirvizGraph._zoom.transform, t);
};

window.DirvizGraph.resetZoom = function() {
  svg.transition().duration(400).call(
    window.DirvizGraph._zoom.transform,
    d3.zoomIdentity
  );
};

window.DirvizGraph.zoomBy = function(factor) {
  svg.transition().duration(200).call(window.DirvizGraph._zoom.scaleBy, factor);
};

window.DirvizGraph.getNodeColor = getNodeColor;
window.DirvizGraph.folderColorScale = folderColorScale;

// ── Render ───────────────────────────────────────────────────────────
function render(width, height) {
  container.selectAll('*').remove();

  const nodes = visibleNodes();
  const edges = visibleEdges(nodes);

  // Build a quick lookup for circular deps
  const circularSet = buildCircularSet(graphData.edges);

  // Hull layer (Explorer mode only) — drawn first so nodes appear on top
  let hullSel = null;
  if (currentMode === 'explorer') {
    hullSel = container.append('g').attr('id', 'hulls');
  }

  // Links
  linkSel = container.append('g').attr('id', 'links')
    .selectAll('line')
    .data(edges)
    .join('line')
    .attr('class', d => {
      const key = `${d.source}->${d.target}`;
      return 'link' + (circularSet.has(key) ? ' circular' : '');
    })
    .attr('stroke', currentMode === 'explorer' ? 'rgba(148,163,184,0.25)' : '#334155')
    .attr('stroke-width', currentMode === 'architect' ? 1 : 2)
    .attr('stroke-linecap', currentMode === 'explorer' ? 'round' : 'butt')
    .attr('marker-end', currentMode === 'architect' ? 'url(#arrow)' : null);

  // Nodes
  nodeSel = container.append('g').attr('id', 'nodes')
    .selectAll('g')
    .data(nodes, d => d.id)
    .join('g')
    .attr('class', d => {
      let cls = 'node';
      if (d.isEntryPoint && currentMode === 'explorer') cls += ' entry-point';
      return cls;
    })
    .call(d3.drag()
      .on('start', dragStart)
      .on('drag', dragged)
      .on('end', dragEnd)
    )
    .on('click', (event, d) => {
      event.stopPropagation();
      activeNodeId = d.id;
      onNodeClick?.(d);
    })
    .on('mouseover', (event, d) => onNodeHover?.(d, event))
    .on('mouseout', () => onNodeHoverEnd?.());

  nodeSel.append('circle')
    .attr('r', d => nodeRadius(d))
    .attr('fill', d => getNodeColor(d))
    .attr('stroke', d => d.isEntryPoint && currentMode === 'explorer' ? 'var(--accent)' : 'rgba(255,255,255,0.1)')
    .attr('stroke-width', d => d.isEntryPoint && currentMode === 'explorer' ? 2.5 : 1);

  // Entry point star badge (Explorer mode)
  if (currentMode === 'explorer') {
    nodeSel.filter(d => d.isEntryPoint).append('text')
      .attr('class', 'entry-badge')
      .attr('y', d => -nodeRadius(d) - 5)
      .attr('text-anchor', 'middle')
      .text('★');
  }

  // Labels
  nodeSel.append('text')
    .attr('dy', d => nodeRadius(d) + 12)
    .attr('text-anchor', 'middle')
    .attr('font-size', currentMode === 'architect' ? 9 : 11)
    .text(d => truncate(nodeLabel(d), currentMode === 'architect' ? 25 : 20));

  // ── Simulation ─────────────────────────────────────────────────────
  const linkForce = d3.forceLink(edges)
    .id(d => d.id)
    .distance(currentMode === 'explorer' ? 90 : 60)
    .strength(0.4);

  simulation = d3.forceSimulation(nodes)
    .force('link', linkForce)
    .force('charge', d3.forceManyBody().strength(currentMode === 'explorer' ? -200 : -120))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => nodeRadius(d) + 8))
    .on('tick', () => ticked(hullSel, nodes));

  // Cluster force for explorer (pull same-folder nodes together)
  if (currentMode === 'explorer') {
    simulation.force('cluster', clusterForce(nodes, 0.12));
  }

  svg.on('click', () => {
    window.DirvizGraph.clearHighlights();
  });

  // Hide loading after first few ticks — always, even on error
  setTimeout(() => {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
  }, 800);
}

function ticked(hullSel, nodes) {
  linkSel
    .attr('x1', d => (d.source.x ?? 0))
    .attr('y1', d => (d.source.y ?? 0))
    .attr('x2', d => (d.target.x ?? 0))
    .attr('y2', d => (d.target.y ?? 0));

  nodeSel.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);

  // Update hulls in Explorer mode
  if (hullSel && nodes) {
    updateHulls(hullSel, nodes);
  }

  updateMinimap();
}

// ── Helpers ──────────────────────────────────────────────────────────
function visibleNodes() {
  const data = window.__FILTERED_NODES__ || graphData.nodes;
  return data.map(n => ({ ...n }));
}

function visibleEdges(nodes) {
  const ids = new Set(nodes.map(n => n.id));
  return graphData.edges
    .filter(e => ids.has(e.source) && ids.has(e.target))
    .map(e => ({ source: e.source, target: e.target, type: e.type }));
}

function nodeRadius(d) {
  if (currentMode === 'architect') {
    return 4 + Math.min(Math.sqrt(d.loc || 1) * 0.6, 18);
  }
  // Explorer: entry points are larger, leaf nodes are smaller
  if (d.isEntryPoint) {
    return Math.min(12 + d.importedByCount * 1.5, 28);
  }
  if (d.role === 'leaf' || d.importCount === 0) {
    return Math.max(5, 5 + Math.min(d.importedByCount * 1.5, 8));
  }
  return Math.max(7, 7 + Math.min(d.importedByCount * 2, 21));
}

function nodeLabel(d) {
  if (currentMode === 'architect') return d.id;
  const s = d.friendlySummary;
  if (s) return s.split(' ').slice(0, 5).join(' ');
  return d.label;
}

function getNodeColor(d) {
  if (currentMode === 'architect') {
    return EXT_COLORS[d.ext] ?? '#64748b';
  }
  const top = d.id.split('/')[0] ?? 'root';
  return folderColorScale(top);
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function dragStart(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x; d.fy = d.y;
}
function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
function dragEnd(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null; d.fy = null;
}

function applyHighlights(className) {
  if (!nodeSel) return;
  nodeSel.each(function(d) {
    const el = d3.select(this);
    el.classed('highlighted', false).classed('dimmed', false)
      .classed('blast-affected', false).classed('error-node', false)
      .classed('feature-match', false);
    if (highlightedIds.size > 0) {
      if (highlightedIds.has(d.id)) el.classed(className || 'highlighted', true);
      else el.classed('dimmed', true);
    }
  });
  linkSel?.each(function(d) {
    d3.select(this).classed('blast', false);
  });
}

function getDownstream(nodeId) {
  const visited = new Set();
  const queue = [nodeId];
  while (queue.length) {
    const curr = queue.shift();
    for (const e of graphData.edges) {
      const src = e.source.id ?? e.source;
      const tgt = e.target.id ?? e.target;
      if (src === curr && !visited.has(tgt)) {
        visited.add(tgt);
        queue.push(tgt);
      }
    }
  }
  return visited;
}

function buildCircularSet(edges) {
  const adj = new Map();
  for (const e of edges) {
    const s = e.source.id ?? e.source;
    const t = e.target.id ?? e.target;
    if (!adj.has(s)) adj.set(s, new Set());
    adj.get(s).add(t);
  }
  const circular = new Set();
  for (const [s, targets] of adj) {
    for (const t of targets) {
      if (adj.get(t)?.has(s)) {
        circular.add(`${s}->${t}`);
        circular.add(`${t}->${s}`);
      }
    }
  }
  return circular;
}

// Hull rendering for Explorer mode — soft folder background regions
function updateHulls(hullSel, nodes) {
  // Group nodes by top-level folder
  const folderMap = new Map();
  for (const n of nodes) {
    if (!n.x || !n.y) continue;
    const folder = n.id.split('/')[0] ?? 'root';
    if (!folderMap.has(folder)) folderMap.set(folder, []);
    folderMap.get(folder).push([n.x, n.y]);
  }

  const hullData = [];
  for (const [folder, points] of folderMap) {
    if (points.length < 2) {
      // Single node — just draw a circle-ish hull
      hullData.push({ folder, points: null, cx: points[0][0], cy: points[0][1] });
    } else if (points.length === 2) {
      // Two nodes — pad to make a hull computable
      const [p0, p1] = points;
      const pad = 20;
      const padded = [
        [p0[0] - pad, p0[1] - pad], [p0[0] + pad, p0[1] - pad],
        [p0[0] + pad, p0[1] + pad], [p0[0] - pad, p0[1] + pad],
        [p1[0] - pad, p1[1] - pad], [p1[0] + pad, p1[1] - pad],
        [p1[0] + pad, p1[1] + pad], [p1[0] - pad, p1[1] + pad],
      ];
      const hull = d3.polygonHull(padded);
      if (hull) hullData.push({ folder, points: hull, cx: null, cy: null });
    } else {
      const pad = 28;
      const padded = [];
      for (const [px, py] of points) {
        padded.push([px - pad, py - pad], [px + pad, py - pad],
                    [px + pad, py + pad], [px - pad, py + pad]);
      }
      const hull = d3.polygonHull(padded);
      if (hull) hullData.push({ folder, points: hull, cx: null, cy: null });
    }
  }

  // Bind hulls
  const groups = hullSel.selectAll('g.hull-group')
    .data(hullData, d => d.folder);

  const entering = groups.enter().append('g').attr('class', 'hull-group');
  entering.append('path').attr('class', 'hull-fill');
  entering.append('text').attr('class', 'hull-label');

  groups.exit().remove();

  const merged = entering.merge(groups);

  merged.select('path.hull-fill')
    .attr('d', d => {
      if (d.points) return 'M' + d.points.join('L') + 'Z';
      // Single node circle
      return null;
    })
    .attr('fill', d => folderColorScale(d.folder))
    .attr('stroke', d => folderColorScale(d.folder))
    .style('display', d => d.points ? null : 'none');

  // For single nodes, draw a circle-ish indicator via a different approach (skip for now)

  // Position folder name label at centroid
  merged.select('text.hull-label')
    .attr('x', d => {
      if (d.cx !== null) return d.cx;
      if (d.points) return d3.polygonCentroid(d.points)[0];
      return 0;
    })
    .attr('y', d => {
      if (d.cy !== null) return d.cy - 30;
      if (d.points) return d3.polygonCentroid(d.points)[1] - 14;
      return 0;
    })
    .text(d => d.folder + '/');
}

// Simple cluster force for explorer mode
function clusterForce(nodes, strength) {
  const centers = new Map();
  for (const n of nodes) {
    const folder = n.id.split('/')[0] ?? 'root';
    if (!centers.has(folder)) {
      const angle = centers.size * (2 * Math.PI / 8);
      const r = 200;
      centers.set(folder, { x: 400 + r * Math.cos(angle), y: 300 + r * Math.sin(angle) });
    }
  }
  return (alpha) => {
    for (const n of nodes) {
      const folder = n.id.split('/')[0] ?? 'root';
      const c = centers.get(folder);
      if (c) {
        n.vx = (n.vx ?? 0) + (c.x - (n.x ?? 0)) * strength * alpha;
        n.vy = (n.vy ?? 0) + (c.y - (n.y ?? 0)) * strength * alpha;
      }
    }
  };
}

// Mini-map rendering
function updateMinimap(transform) {
  const canvas = document.getElementById('minimap');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const nodes = graphData?.nodes ?? [];
  if (!nodes.length || !nodes[0].x) return;

  const xs = nodes.map(n => n.x ?? 0);
  const ys = nodes.map(n => n.y ?? 0);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;

  const pad = 8;
  for (const n of nodes) {
    const mx = pad + ((n.x - minX) / rangeX) * (W - 2 * pad);
    const my = pad + ((n.y - minY) / rangeY) * (H - 2 * pad);
    ctx.beginPath();
    ctx.arc(mx, my, 1.5, 0, 2 * Math.PI);
    ctx.fillStyle = getNodeColor(n);
    ctx.fill();
  }
}
