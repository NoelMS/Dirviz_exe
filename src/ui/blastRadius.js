// blastRadius.js — blast radius computation

window.BlastRadius = {
  getDownstream(nodeId, edges) {
    const visited = new Set();
    const queue = [nodeId];
    while (queue.length) {
      const curr = queue.shift();
      for (const e of edges) {
        const src = e.source?.id ?? e.source;
        const tgt = e.target?.id ?? e.target;
        if (src === curr && !visited.has(tgt)) {
          visited.add(tgt);
          queue.push(tgt);
        }
      }
    }
    return visited;
  },

  getUpstream(nodeId, edges) {
    const visited = new Set();
    const queue = [nodeId];
    while (queue.length) {
      const curr = queue.shift();
      for (const e of edges) {
        const src = e.source?.id ?? e.source;
        const tgt = e.target?.id ?? e.target;
        if (tgt === curr && !visited.has(src)) {
          visited.add(src);
          queue.push(src);
        }
      }
    }
    return visited;
  },

  trigger(nodeId, graphData) {
    const downstream = this.getDownstream(nodeId, graphData.edges);
    const ids = [...downstream];
    window.DirvizGraph.showBlast(nodeId);
    return ids;
  },
};
