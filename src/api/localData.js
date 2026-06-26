// localStorage-based data layer
// Each entity has: list, create, update, delete, bulkCreate

function getAll(key) {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); }
  catch { return []; }
}
function saveAll(key, items) {
  localStorage.setItem(key, JSON.stringify(items));
}
function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function makeEntity(key) {
  return {
    list: (filters = {}) => {
      let items = getAll(key);
      for (const [k, v] of Object.entries(filters)) {
        items = items.filter(i => i[k] === v);
      }
      return Promise.resolve(items);
    },
    get: (id) => {
      const items = getAll(key);
      return Promise.resolve(items.find(i => i.id === id) || null);
    },
    create: (data) => {
      const items = getAll(key);
      const item = { ...data, id: genId(), created_date: new Date().toISOString() };
      items.push(item);
      saveAll(key, items);
      return Promise.resolve(item);
    },
    update: (id, data) => {
      const items = getAll(key);
      const idx = items.findIndex(i => i.id === id);
      if (idx === -1) return Promise.reject(new Error("Not found"));
      items[idx] = { ...items[idx], ...data };
      saveAll(key, items);
      return Promise.resolve(items[idx]);
    },
    delete: (id) => {
      const items = getAll(key).filter(i => i.id !== id);
      saveAll(key, items);
      return Promise.resolve(true);
    },
    bulkCreate: (dataArray) => {
      const items = getAll(key);
      const created = dataArray.map(d => ({ ...d, id: genId(), created_date: new Date().toISOString() }));
      saveAll(key, [...items, ...created]);
      return Promise.resolve(created);
    },
    replaceAll: (dataArray) => {
      const items = dataArray.map(d => ({ ...d, id: d.id || genId() }));
      saveAll(key, items);
      return Promise.resolve(items);
    },
  };
}

export const Stock = makeEntity("stocks");
export const Transaction = makeEntity("transactions");
export const Dividend = makeEntity("dividends");
export const AccountType = makeEntity("accountTypes");
export const PortfolioSnapshot = makeEntity("portfolioSnapshots");
export const WatchlistItem = makeEntity("watchlist");
export const PriceAlert = makeEntity("priceAlerts");

// Export/import all data as JSON
export function exportAllData() {
  const keys = ["stocks", "transactions", "dividends", "accountTypes", "portfolioSnapshots", "watchlist", "priceAlerts", "cashPositions"];
  const data = {};
  for (const key of keys) {
    data[key] = getAll(key);
  }
  return data;
}

export function importAllData(data) {
  const keys = ["stocks", "transactions", "dividends", "accountTypes", "portfolioSnapshots", "watchlist", "priceAlerts", "cashPositions"];
  for (const key of keys) {
    if (data[key]) saveAll(key, data[key]);
  }
}

// ── Cash Positions ─────────────────────────────────────────────────
// One record per account+currency combination
// { id, account_type, currency, balance, updated_date }
export const CashPosition = makeEntity("cashPositions");

// Helper: adjust cash balance for an account+currency by a delta amount
// delta > 0 = add cash, delta < 0 = deduct cash
export async function adjustCash(account_type, currency, delta) {
  const all = getAll("cashPositions");
  const key = `${account_type}__${currency}`;
  const existing = all.find(c => c.account_type === account_type && c.currency === currency);
  if (existing) {
    const newBalance = (existing.balance || 0) + delta;
    const updated = { ...existing, balance: newBalance, updated_date: new Date().toISOString() };
    saveAll("cashPositions", all.map(c => c.id === existing.id ? updated : c));
    return updated;
  } else {
    const item = {
      id: genId(),
      account_type,
      currency,
      balance: delta,
      updated_date: new Date().toISOString(),
      created_date: new Date().toISOString(),
    };
    saveAll("cashPositions", [...all, item]);
    return item;
  }
}

// Helper: set cash balance directly (for manual entry)
export async function setCash(account_type, currency, balance) {
  const all = getAll("cashPositions");
  const existing = all.find(c => c.account_type === account_type && c.currency === currency);
  if (existing) {
    const updated = { ...existing, balance: parseFloat(balance) || 0, updated_date: new Date().toISOString() };
    saveAll("cashPositions", all.map(c => c.id === existing.id ? updated : c));
    return updated;
  } else {
    const item = {
      id: genId(),
      account_type,
      currency,
      balance: parseFloat(balance) || 0,
      updated_date: new Date().toISOString(),
      created_date: new Date().toISOString(),
    };
    saveAll("cashPositions", [...all, item]);
    return item;
  }
}

// Helper: delete a cash position entirely
export async function deleteCash(account_type, currency) {
  const all = getAll("cashPositions");
  saveAll("cashPositions", all.filter(c => !(c.account_type === account_type && c.currency === currency)));
}

