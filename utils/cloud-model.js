function dedupeByClientId(items) {
  const seen = new Set();
  const result = [];
  (Array.isArray(items) ? items : []).forEach(item => {
    const key = item && item.clientId;
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
}

module.exports = {
  dedupeByClientId
};
