// 族谱：节点是植物或育苗，关系存在育苗的 motherType / motherId 上
const MAX_DEPTH = 8;

function nodeKey(type, id) {
  return type + ':' + id;
}

function motherOf(node, seedlings) {
  if (node.type !== 'seedling') return null;
  const item = seedlings.find(s => s.id === node.id);
  if (!item || !item.motherId || (item.motherType !== 'plant' && item.motherType !== 'seedling')) return null;
  return { type: item.motherType, id: item.motherId };
}

function childrenOf(node, seedlings) {
  return seedlings
    .filter(s => s.motherType === node.type && s.motherId === node.id)
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
}

// 往上找最早的祖先，最多 MAX_DEPTH 代，遇到断链或环停止
function rootOf(node, seedlings) {
  const seen = {};
  let current = node;
  for (let i = 0; i < MAX_DEPTH; i += 1) {
    seen[nodeKey(current.type, current.id)] = true;
    const mother = motherOf(current, seedlings);
    if (!mother || seen[nodeKey(mother.type, mother.id)]) break;
    current = mother;
  }
  return current;
}

// candidate 作为 seedlingId 的母株是否会成环
function wouldCycle(seedlingId, candidate, seedlings) {
  if (!seedlingId || !candidate || candidate.type !== 'seedling') return false;
  let current = candidate;
  for (let i = 0; i < MAX_DEPTH * 4; i += 1) {
    if (current.type === 'seedling' && current.id === seedlingId) return true;
    const mother = motherOf(current, seedlings);
    if (!mother) return false;
    current = mother;
  }
  return true;
}

// 从根展开为带层级的扁平列表，便于 wxml 渲染
function flatten(root, lookup, seedlings) {
  const rows = [];
  const seen = {};
  function walk(node, depth) {
    const key = nodeKey(node.type, node.id);
    if (seen[key] || depth > MAX_DEPTH) return;
    seen[key] = true;
    const info = lookup(node);
    if (!info) return;
    const kids = childrenOf(node, seedlings);
    rows.push(Object.assign({ key, type: node.type, id: node.id, depth, childCount: kids.length }, info));
    kids.forEach(child => walk({ type: 'seedling', id: child.id }, depth + 1));
  }
  walk(root, 0);
  return rows;
}

module.exports = {
  MAX_DEPTH,
  nodeKey,
  motherOf,
  childrenOf,
  rootOf,
  wouldCycle,
  flatten
};
