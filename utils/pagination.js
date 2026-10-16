const PAGE_SIZE = 20;

function normalizePage(page) {
  const value = Number(page);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function slice(items, page) {
  const list = Array.isArray(items) ? items : [];
  const current = normalizePage(page);
  const visible = list.slice(0, current * PAGE_SIZE);
  return {
    items: visible,
    page: current,
    pageSize: PAGE_SIZE,
    hasMore: visible.length < list.length,
    total: list.length
  };
}

module.exports = {
  PAGE_SIZE,
  slice
};
