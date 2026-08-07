// Data layer: syncs to Firestore (cloud, cross-device) when signed in and
// Firebase is configured, with localStorage as a fast local mirror + offline
// fallback. If Firebase isn't set up yet, everything behaves exactly like
// the old pure-localStorage version — nothing breaks for people who haven't
// done the Firebase setup.
//
// Scope: this syncs the CORE portfolio data — stocks, transactions,
// dividends, cash positions, cash contributions, account types, snapshots,
// watchlist, price alerts. Device-local UI preferences (tab order, widget
// layout, RRSP/TFSA contribution-room widget, cached FX rate, cached
// dividend forecasts) are NOT synced — those stay per-device for now.
import { db } from "./firebase"
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch,
} from "firebase/firestore"

let currentUid = null
export function setSyncUser(uid) { currentUid = uid }
export function getSyncUser() { return currentUid }
function cloudReady() { return Boolean(db && currentUid) }

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
function colRef(key) { return collection(db, "users", currentUid, key) }
function docRef(key, id) { return doc(db, "users", currentUid, key, id) }

// Fire-and-forget cloud write. Deliberately NOT awaited by callers — the
// local mirror is the source of truth for what the UI shows instantly;
// this just pushes the same data to Firestore in the background. If you're
// offline, this silently fails/queues and the app keeps working normally
// (Firestore's own persistence layer retries once you're back online).
function cloudSet(key, id, data) {
  if (!cloudReady()) return
  setDoc(docRef(key, id), data).catch(() => {})
}
function cloudDelete(key, id) {
  if (!cloudReady()) return
  deleteDoc(docRef(key, id)).catch(() => {})
}
function cloudBatchSet(key, items) {
  if (!cloudReady() || items.length === 0) return
  const batch = writeBatch(db)
  items.forEach(item => batch.set(docRef(key, item.id), item))
  batch.commit().catch(() => {})
}

// Pulls the latest data for one collection from Firestore and refreshes the
// local mirror. Falls back to the local mirror (silently) if offline or
// Firestore isn't reachable — Firestore's own persistent cache usually
// handles this already, this is just an extra safety net.
//
// IMPORTANT: if Firestore comes back empty (e.g. first login, before you've
// ever clicked "Upload to Cloud"), we must NOT overwrite the local mirror
// with that empty result — that would silently wipe out real local data
// that just hasn't been uploaded yet. Only overwrite local data once the
// cloud actually has something in it.
async function fetchAndMirror(key) {
  if (!cloudReady()) return getAll(key)
  try {
    const snap = await getDocs(colRef(key))
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    if (items.length > 0) {
      saveAll(key, items)
      return items
    }
    return getAll(key)
  } catch {
    return getAll(key)
  }
}

function makeEntity(key) {
  return {
    list: async (filters = {}) => {
      let items = await fetchAndMirror(key);
      for (const [k, v] of Object.entries(filters)) {
        items = items.filter(i => i[k] === v);
      }
      return items;
    },
    get: async (id) => {
      const items = await fetchAndMirror(key);
      return items.find(i => i.id === id) || null;
    },
    create: async (data) => {
      const item = { ...data, id: genId(), created_date: new Date().toISOString() };
      const items = getAll(key); items.push(item); saveAll(key, items);
      cloudSet(key, item.id, item);
      return item;
    },
    update: async (id, data) => {
      const items = getAll(key);
      const idx = items.findIndex(i => i.id === id);
      if (idx === -1) throw new Error("Not found");
      items[idx] = { ...items[idx], ...data };
      saveAll(key, items);
      cloudSet(key, id, items[idx]);
      return items[idx];
    },
    delete: async (id) => {
      const items = getAll(key).filter(i => i.id !== id);
      saveAll(key, items);
      cloudDelete(key, id);
      return true;
    },
    bulkCreate: async (dataArray) => {
      const created = dataArray.map(d => ({ ...d, id: genId(), created_date: new Date().toISOString() }));
      const items = getAll(key);
      saveAll(key, [...items, ...created]);
      cloudBatchSet(key, created);
      return created;
    },
    replaceAll: async (dataArray) => {
      const items = dataArray.map(d => ({ ...d, id: d.id || genId() }));
      saveAll(key, items);
      cloudBatchSet(key, items);
      return items;
    },
  };
}

// ── Simple key/value cloud sync ──────────────────────────────────────
// For small pieces of data that live as a single localStorage value
// (a plain array or object) rather than a collection of entities with
// ids — e.g. the watchlist symbol list and price alert list. Stored as
// one Firestore doc per key under users/{uid}/meta/{key}.
function metaDocRef(key) { return doc(db, "users", currentUid, "meta", key) }

export function cloudSetValue(key, value) {
  if (!cloudReady()) return
  setDoc(metaDocRef(key), { value }).catch(() => {})
}

// Fetches the cloud value for `key`. Returns null if not signed in, not
// configured, not yet present in Firestore, or on any error — callers
// should treat null as "no cloud value yet" and keep using local data,
// same rule as fetchAndMirror: never let an empty/missing cloud result
// wipe out real local data.
export async function cloudGetValue(key) {
  if (!cloudReady()) return null
  try {
    const snap = await getDoc(metaDocRef(key))
    return snap.exists() ? snap.data().value : null
  } catch { return null }
}

const SIMPLE_SYNCED_KEYS = [
  "watchlist_items", "watchlists_v1", "price_alerts",
  "groq_api_key", "custom_account_types",
  "historical_dividends_per_stock_v2", "yoy_portfolio_history_v1",
  "proj60_accounts_v3", "proj60_settings_v1", "tfsa_tracker_v1",
  "contribution_tracking", "dividend_archive", "dismissed_div_suggestions",
  "dividend_schedule_cache_v1", "dividend_data_last_refresh_v1",
]
// Keys stored as a raw string in localStorage (not JSON) — everything else
// in SIMPLE_SYNCED_KEYS is JSON (array/object).
const RAW_STRING_KEYS = ["groq_api_key", "dividend_data_last_refresh_v1"]

export const Stock = makeEntity("stocks");
export const Transaction = makeEntity("transactions");
export const Dividend = makeEntity("dividends");
export const AccountType = makeEntity("accountTypes");
export const PortfolioSnapshot = makeEntity("portfolioSnapshots");
export const WatchlistItem = makeEntity("watchlist");
export const PriceAlert = makeEntity("priceAlerts");

const SYNCED_KEYS = ["stocks", "transactions", "dividends", "accountTypes", "portfolioSnapshots", "watchlist", "priceAlerts", "cashPositions", "cashContributions"];

// One-time migration: pushes whatever is currently in this browser's
// localStorage up to Firestore. Use this once, right after setting up
// Firebase, so your existing desktop data becomes available on other
// devices too. Safe to run more than once (it just overwrites with the
// same local data — it will NOT duplicate anything).
export async function uploadLocalDataToCloud() {
  if (!cloudReady()) throw new Error("Not signed in / Firebase not configured");
  let totalDocs = 0;
  for (const key of SYNCED_KEYS) {
    const items = getAll(key);
    if (items.length === 0) continue;
    const batch = writeBatch(db);
    items.forEach(item => {
      const id = item.id || genId();
      batch.set(docRef(key, id), { ...item, id });
    });
    await batch.commit();
    totalDocs += items.length;
  }
  for (const key of SIMPLE_SYNCED_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw == null) continue;
    if (RAW_STRING_KEYS.includes(key)) {
      cloudSetValue(key, raw);
      totalDocs += 1;
      continue;
    }
    try {
      cloudSetValue(key, JSON.parse(raw));
      totalDocs += 1;
    } catch { /* skip malformed local value */ }
  }
  return totalDocs;
}

// Pulls everything down from Firestore into the local mirror. Called once
// right after login so the app has fresh cloud data before you start using it.
export async function downloadCloudDataToLocal() {
  if (!cloudReady()) return;
  for (const key of SYNCED_KEYS) {
    await fetchAndMirror(key);
  }
  for (const key of SIMPLE_SYNCED_KEYS) {
    const cloudValue = await cloudGetValue(key);
    // Same rule as fetchAndMirror: an empty/missing cloud value must not
    // wipe out real local data that just hasn't been uploaded yet.
    if (cloudValue != null) {
      localStorage.setItem(key, RAW_STRING_KEYS.includes(key) ? cloudValue : JSON.stringify(cloudValue));
    }
  }
}

// Export/import all data as JSON (local mirror — used for manual backup file)
export function exportAllData() {
  const data = {};
  for (const key of SYNCED_KEYS) {
    data[key] = getAll(key);
  }
  for (const key of SIMPLE_SYNCED_KEYS) {
    if (RAW_STRING_KEYS.includes(key)) { data[key] = localStorage.getItem(key) || null; continue; }
    try { data[key] = JSON.parse(localStorage.getItem(key) || "null"); }
    catch { data[key] = null; }
  }
  return data;
}

export function importAllData(data) {
  for (const key of SYNCED_KEYS) {
    if (data[key]) saveAll(key, data[key]);
  }
  for (const key of SIMPLE_SYNCED_KEYS) {
    if (data[key] != null) {
      localStorage.setItem(key, RAW_STRING_KEYS.includes(key) ? data[key] : JSON.stringify(data[key]));
      cloudSetValue(key, data[key]);
    }
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
  const existing = all.find(c => c.account_type === account_type && c.currency === currency);
  let updated;
  if (existing) {
    const newBalance = (existing.balance || 0) + delta;
    updated = { ...existing, balance: newBalance, updated_date: new Date().toISOString() };
    saveAll("cashPositions", all.map(c => c.id === existing.id ? updated : c));
  } else {
    updated = {
      id: genId(), account_type, currency, balance: delta,
      updated_date: new Date().toISOString(), created_date: new Date().toISOString(),
    };
    saveAll("cashPositions", [...all, updated]);
  }
  cloudSet("cashPositions", updated.id, updated);
  return updated;
}

// Helper: set cash balance directly (for manual entry)
export async function setCash(account_type, currency, balance) {
  const all = getAll("cashPositions");
  const existing = all.find(c => c.account_type === account_type && c.currency === currency);
  let updated;
  if (existing) {
    updated = { ...existing, balance: parseFloat(balance) || 0, updated_date: new Date().toISOString() };
    saveAll("cashPositions", all.map(c => c.id === existing.id ? updated : c));
  } else {
    updated = {
      id: genId(), account_type, currency, balance: parseFloat(balance) || 0,
      updated_date: new Date().toISOString(), created_date: new Date().toISOString(),
    };
    saveAll("cashPositions", [...all, updated]);
  }
  cloudSet("cashPositions", updated.id, updated);
  return updated;
}

// Helper: delete a cash position entirely
export async function deleteCash(account_type, currency) {
  const all = getAll("cashPositions");
  const existing = all.find(c => c.account_type === account_type && c.currency === currency);
  saveAll("cashPositions", all.filter(c => !(c.account_type === account_type && c.currency === currency)));
  if (existing) cloudDelete("cashPositions", existing.id);
}

// ── Cash Contributions Log ─────────────────────────────────────────
// Records ONLY manual "Deposit"/"Withdraw" actions from CashModal — i.e.
// actual new money moved in or out of the accounts. Buy/sell transactions
// and dividend cash credits move cash too (via adjustCash) but must NOT be
// logged here, since they aren't new contributions — they're money already
// inside the portfolio moving around.
// { id, date (YYYY-MM-DD), account_type, currency, amount } — amount is
// signed: positive = deposit, negative = withdrawal.
export const CashContribution = makeEntity("cashContributions");

export async function recordCashContribution(account_type, currency, amount) {
  const item = {
    id: genId(),
    account_type,
    currency,
    amount,
    date: new Date().toISOString().slice(0, 10),
    created_date: new Date().toISOString(),
  };
  const all = getAll("cashContributions");
  saveAll("cashContributions", [...all, item]);
  cloudSet("cashContributions", item.id, item);
  return item;
}
