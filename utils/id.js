function uniqueId(prefix) {
  return (prefix || 'item') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

module.exports = { uniqueId };
